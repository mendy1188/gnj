import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { build } from 'esbuild';
import type { Project } from '../src/lib/types';

const projectId = '5b3962f9-d81f-4fd1-9b06-bc3b0b9f51a4';
const mp4 = Buffer.from('000000186674797069736f6d0000000069736f6d6d703432', 'hex');

test('video upload API validates limits and cleans storage after a rejected insert', async (t) => {
  let storedCount = 0;
  let inserted: Record<string, unknown> | undefined;
  let countError: { code: string; message: string } | null = null;
  let insertError: { code: string; message: string } | null = null;
  let signedError = false;
  const uploadedPaths: string[] = [];
  const uploadedTypes: string[] = [];
  const removedPaths: string[] = [];
  const bucket = {
    async upload(path: string, _bytes: Buffer, options: { contentType: string }) { uploadedPaths.push(path); uploadedTypes.push(options.contentType); return { error: null }; },
    async remove(paths: string[]) { removedPaths.push(...paths); return { error: null }; },
    async createSignedUrl(path: string) { return signedError ? { data: null, error: new Error('Unavailable') } : { data: { signedUrl: `https://media.example/${path}` }, error: null }; },
  };
  const client = {
    storage: { from(name: string) { assert.equal(name, 'project-videos'); return bucket; } },
    from(table: string) {
      if (table === 'projects') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: projectId }, error: null }) }) }) };
      assert.equal(table, 'project_videos');
      return {
        select: (_columns: string, options?: { head?: boolean }) => {
          assert.notEqual(options?.head, true, 'The count must use GET so missing-table errors retain their response body');
          return { eq: async () => ({ count: countError ? null : storedCount, error: countError }) };
        },
        insert(value: Record<string, unknown>) {
          inserted = value;
          return { select: () => ({ single: async () => ({ data: insertError ? null : value, error: insertError }) }) };
        },
      };
    },
  };
  // Bundle the real route, replacing only its authenticated database connection.
  // Container validation and HTTP errors execute unchanged.
  const built = await build({
    entryPoints: ['src/app/api/admin/video-uploads/route.ts'], bundle: true, write: false,
    platform: 'node', format: 'cjs', packages: 'external',
    plugins: [{ name: 'owner-fixture', setup(builder) {
      builder.onResolve({ filter: /^@\/lib\/server\/auth$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export async function requireAdmin() { return fixtureAuth(); }', loader: 'js' }));
    } }],
  });
  const routeModule = { exports: {} as { POST(request: Request): Promise<Response> } };
  new Function('require', 'module', 'exports', 'fixtureAuth', built.outputFiles[0].text)(createRequire(import.meta.url), routeModule, routeModule.exports, () => ({ client }));
  const post = routeModule.exports.POST;
  function request(bytes = mp4, type = 'video/mp4', name = 'walkthrough.mp4') {
    const form = new FormData();
    form.append('projectId', projectId);
    form.append('file', new File([new Uint8Array(bytes)], name, { type }));
    return new Request('http://localhost/api/admin/video-uploads', { method: 'POST', body: form });
  }

  await t.test('a missing video migration reports setup instructions before any upload', async () => {
    countError = { code: 'PGRST205', message: "Could not find the table 'public.project_videos' in the schema cache" };
    try {
      const response = await post(request());
      assert.equal(response.status, 503);
      assert.match((await response.json()).error, /Complete the video database setup/);
      assert.deepEqual(uploadedPaths, []);
      assert.deepEqual(removedPaths, []);
      assert.equal(inserted, undefined);
    } finally { countError = null; }
  });
  await t.test('a third video never reaches storage', async () => {
    storedCount = 2;
    const response = await post(request());
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /up to 2 videos/);
    assert.equal(uploadedPaths.length, 0);
  });
  await t.test('invalid bytes never reach storage', async () => {
    storedCount = 0;
    const response = await post(request(Buffer.from('This is not a video')));
    assert.equal(response.status, 400);
    assert.equal(uploadedPaths.length, 0);
  });
  await t.test('oversized requests are refused before reading multipart data', async () => {
    const response = await post(new Request('http://localhost/api/admin/video-uploads', { method: 'POST', headers: { 'content-length': String(51 * 1024 * 1024) } }));
    assert.equal(response.status, 413);
    assert.equal(uploadedPaths.length, 0);
  });
  await t.test('successful uploads persist metadata and return playable signed URLs', async () => {
    storedCount = 1;
    const response = await post(request());
    assert.equal(response.status, 201);
    const { video } = await response.json();
    assert.equal(inserted?.project_id, projectId);
    assert.equal(inserted?.sort_order, 1);
    assert.equal(inserted?.caption, '');
    assert.equal(inserted?.is_pending, undefined, 'The database default keeps the video pending until Save');
    assert.equal(video.path, `${projectId}/${video.id}.mp4`);
    assert.equal(video.url, `https://media.example/${video.path}`);
  });
  await t.test('multipart MOV uploads normalize a missing MIME type and retain the .mov extension', async () => {
    const mov = Buffer.from(mp4);
    mov.write('qt  ', 8);
    const response = await post(request(mov, '', 'walkthrough.MOV'));
    assert.equal(response.status, 201);
    assert.match((await response.json()).video.path, /\.mov$/);
    assert.equal(uploadedTypes.at(-1), 'video/quicktime');
  });
  await t.test('a simultaneous upload that loses the final slot removes its object', async () => {
    insertError = { code: '23514', message: 'A project can contain up to 2 videos.' };
    const response = await post(request());
    assert.equal(response.status, 409);
    assert.equal(removedPaths.at(-1), uploadedPaths.at(-1));
  });
  await t.test('an unavailable signed URL removes its object without occupying a slot', async () => {
    insertError = null;
    inserted = undefined;
    signedError = true;
    const response = await post(request());
    assert.equal(response.status, 503);
    assert.equal(inserted, undefined);
    assert.equal(removedPaths.at(-1), uploadedPaths.at(-1));
  });
});

type ProjectHandler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;

async function loadProjectRoute(entryPoint: string, client: unknown, project: Project) {
  const built = await build({
    entryPoints: [entryPoint], bundle: true, write: false,
    platform: 'node', format: 'cjs', packages: 'external',
    plugins: [{ name: 'project-fixture', setup(builder) {
      builder.onResolve({ filter: /^@\/lib\/server\/(auth|projects)$/ }, ({ path }) => ({ path, namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
        contents: path.endsWith('/auth')
          ? 'export async function requireAdmin() { return fixtureAuth(); }'
          : 'export async function readProject(client, id) { return fixtureProject(client, id); }',
        loader: 'js',
      }));
    } }],
  });
  const routeModule = { exports: {} as Record<string, ProjectHandler> };
  new Function('require', 'module', 'exports', 'fixtureAuth', 'fixtureProject', built.outputFiles[0].text)(
    createRequire(import.meta.url), routeModule, routeModule.exports,
    () => ({ client }),
    (receivedClient: unknown, id: string) => {
      assert.equal(receivedClient, client);
      assert.equal(id, project.id);
      return structuredClone(project);
    },
  );
  return routeModule.exports;
}

test('project edits preserve pending videos and save explicit video changes', async (t) => {
  const imageId = 'd277df04-dab3-4f3b-82df-dbc66d37dccc';
  const firstVideoId = 'd03b1abf-7ddc-46e7-99ac-4b077c9b6c18';
  const secondVideoId = 'ce575078-9ac0-408a-987a-e28a7cba75ed';
  const current: Project = {
    id: projectId, slug: 'garden-project', title: 'A garden project',
    category: 'Garden & Outdoor Improvements', description: '', location: '',
    published: false, featured: false, sort_order: 0, cover_image_id: imageId,
    images: [{ id: imageId, path: `${projectId}/${imageId}.webp`, url: 'https://media.example/photo.webp', alt: 'Garden', caption: '', sort_order: 0 }],
    videos: [
      { id: firstVideoId, path: `${projectId}/${firstVideoId}.mp4`, url: 'https://media.example/saved.mp4', caption: 'Garden before', sort_order: 0 },
      { id: secondVideoId, path: `${projectId}/${secondVideoId}.webm`, url: 'https://media.example/pending.webm', caption: '', sort_order: 1 },
    ],
    comparisons: [],
  };
  const saves: { p_project_id: string; p_data: Record<string, unknown> }[] = [];
  const removals: { bucket: string; paths: string[] }[] = [];
  const client = {
    async rpc(name: string, args: typeof saves[number]) {
      assert.equal(name, 'save_project');
      saves.push(args);
      return { error: null };
    },
    storage: { from(bucket: string) {
      return { async remove(paths: string[]) { removals.push({ bucket, paths }); return { error: null }; } };
    } },
    from(table: string) {
      assert.equal(table, 'project_images');
      return { select: () => ({ eq(column: string, id: string) {
        assert.equal(column, 'id');
        assert.equal(id, imageId);
        return { maybeSingle: async () => ({ data: { project_id: projectId, path: current.images[0].path }, error: null }) };
      } }) };
    },
  };
  const projects = await loadProjectRoute('src/app/api/admin/projects/[id]/route.ts', client, current);
  const projectsWithoutVideos = await loadProjectRoute('src/app/api/admin/projects/[id]/route.ts', client, {
    ...current, videos: [], video_uploads_enabled: false,
  });
  const photos = await loadProjectRoute('src/app/api/admin/uploads/[id]/route.ts', client, current);
  function patch(data: unknown, handler = projects.PATCH) {
    saves.length = 0;
    removals.length = 0;
    return handler(new Request(`http://localhost/api/admin/projects/${projectId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data),
    }), { params: Promise.resolve({ id: projectId }) });
  }

  await t.test('a detail-only PATCH leaves video publication state untouched', async () => {
    const response = await patch({ title: 'Updated garden project' });
    assert.equal(response.status, 200);
    assert.equal(saves.length, 1);
    assert.equal(saves[0].p_project_id, projectId);
    assert.equal(saves[0].p_data.title, 'Updated garden project');
    assert.equal(Object.hasOwn(saves[0].p_data, 'videos'), false);
    assert.deepEqual(removals, []);
  });

  await t.test('an unavailable video schema never sends an empty replacement array to the save RPC', async () => {
    const response = await patch({ title: 'Saved before video setup', videos: [] }, projectsWithoutVideos.PATCH);
    assert.equal(response.status, 200);
    assert.equal(saves.length, 1);
    assert.equal(saves[0].p_data.title, 'Saved before video setup');
    assert.equal(Object.hasOwn(saves[0].p_data, 'videos'), false, 'Omitting videos preserves newly available rows if the migration completes between reading and saving');
    assert.deepEqual(removals, []);
  });

  await t.test('video edits are rejected with setup instructions when the migration is unavailable', async () => {
    const response = await patch({ videos: [current.videos[0]] }, projectsWithoutVideos.PATCH);
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /Complete the video database setup/);
    assert.deepEqual(saves, []);
    assert.deepEqual(removals, []);
  });

  await t.test('explicit video edits save captions and ordering without signed URLs', async () => {
    const videos = [
      { ...current.videos[1], caption: 'The completed garden', sort_order: 0 },
      { ...current.videos[0], caption: 'Before the work', sort_order: 1 },
    ];
    const response = await patch({ videos });
    assert.equal(response.status, 200);
    assert.equal(saves.length, 1);
    assert.deepEqual(saves[0].p_data.videos, videos.map(({ id, path, caption, sort_order }) => ({ id, path, caption, sort_order })));
    assert.deepEqual(removals, []);
  });

  await t.test('foreign video IDs and swapped storage paths are rejected before saving', async () => {
    for (const video of [
      { ...current.videos[0], id: 'ec7078ae-f63f-47dc-a4dd-8e3c962b6f1c' },
      { ...current.videos[0], path: 'another-project/unowned.mp4' },
    ]) {
      const response = await patch({ videos: [video] });
      assert.equal(response.status, 400);
      assert.match((await response.json()).error, /Videos must be uploaded to this project first/);
      assert.equal(saves.length, 0);
      assert.deepEqual(removals, []);
    }
  });

  await t.test('explicit removal deletes only the removed video storage object', async () => {
    const response = await patch({ videos: [current.videos[0]] });
    assert.equal(response.status, 200);
    assert.equal(saves.length, 1);
    assert.deepEqual(removals, [{ bucket: 'project-videos', paths: [current.videos[1].path] }]);
  });

  await t.test('deleting a photograph preserves pending videos in the save RPC', async () => {
    saves.length = 0;
    removals.length = 0;
    const response = await photos.DELETE(new Request(`http://localhost/api/admin/uploads/${imageId}`, { method: 'DELETE' }), { params: Promise.resolve({ id: imageId }) });
    assert.equal(response.status, 200);
    assert.equal(saves.length, 1);
    assert.equal(saves[0].p_project_id, projectId);
    assert.deepEqual(saves[0].p_data.images, []);
    assert.equal(saves[0].p_data.cover_image_id, null);
    assert.equal(Object.hasOwn(saves[0].p_data, 'videos'), false);
    assert.deepEqual(removals, [{ bucket: 'project-images', paths: [current.images[0].path] }]);
  });
});
