import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { build } from 'esbuild';

const projectId = '5b3962f9-d81f-4fd1-9b06-bc3b0b9f51a4';
type Video = { id: string; project_id: string; path: string; caption: string; sort_order: number };
const mp4 = Buffer.from('000000186674797069736f6d0000000069736f6d6d703432', 'hex');

test('direct video uploads validate storage bytes before attaching private videos', async (t) => {
  const videos = new Map<string, Video>();
  const objects = new Map<string, Blob>();
  const signedPaths: string[] = [];
  const removedPaths: string[] = [];
  let count = 0;
  let authenticated = true;
  let insertError: { message: string } | null = null;
  let competingVideo: Video | undefined;
  const bucket = {
    async createSignedUploadUrl(path: string, options: { upsert: boolean }) {
      assert.equal(options.upsert, false);
      signedPaths.push(path);
      return { data: { signedUrl: `https://storage.example/upload/${path}?token=temporary` }, error: null };
    },
    async createSignedUrl(path: string) { return { data: { signedUrl: `https://storage.example/read/${path}` }, error: null }; },
    async download(path: string) { return { data: objects.get(path) || null, error: objects.has(path) ? null : { message: 'Not found' } }; },
    async remove(paths: string[]) { removedPaths.push(...paths); paths.forEach(path => objects.delete(path)); return { error: null }; },
  };
  const client = {
    storage: { from(name: string) { assert.equal(name, 'project-videos'); return bucket; } },
    from(table: string) {
      if (table === 'projects') return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: projectId }, error: null }) }) }) };
      assert.equal(table, 'project_videos');
      const filters = new Map<string, string>();
      let inserted: Video | undefined;
      const query = {
        select() { return query; },
        eq(column: string, value: string) { filters.set(column, value); return query; },
        insert(value: Video) { inserted = value; return query; },
        async maybeSingle() {
          const video = videos.get(filters.get('id') || '');
          return { data: video?.project_id === filters.get('project_id') ? video : null, error: null };
        },
        async single() {
          if (competingVideo) videos.set(competingVideo.id, competingVideo);
          if (insertError) return { data: null, error: insertError };
          assert.ok(inserted);
          videos.set(inserted.id, inserted);
          return { data: inserted, error: null };
        },
        then(resolve: (result: { count: number; error: null }) => unknown) { return Promise.resolve(resolve({ count, error: null })); },
      };
      return query;
    },
  };
  const built = await build({
    entryPoints: ['src/app/api/admin/video-uploads/route.ts'], bundle: true, write: false,
    platform: 'node', format: 'cjs', packages: 'external',
    plugins: [{ name: 'owner-fixture', setup(builder) {
      builder.onResolve({ filter: /^@\/lib\/server\/auth$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'import {HttpError} from "@/lib/server/http"; export function requireAdmin() { const owner=fixtureAuth(); if(!owner) throw new HttpError(401,"Please sign in to continue."); return owner; }', loader: 'js', resolveDir: process.cwd() }));
    } }],
  });
  const routeModule = { exports: {} as Record<'POST' | 'PATCH', (request: Request) => Promise<Response>> };
  new Function('require', 'module', 'exports', 'fixtureAuth', built.outputFiles[0].text)(createRequire(import.meta.url), routeModule, routeModule.exports, () => authenticated ? { client } : null);
  const request = (method: string, body: unknown) => new Request('http://localhost/api/admin/video-uploads', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const prepare = () => routeModule.exports.POST(request('POST', { projectId, contentType: 'video/mp4', size: 6 * 1024 * 1024 }));
  const complete = (id: string, contentType = 'video/mp4') => routeModule.exports.PATCH(request('PATCH', { projectId, id, contentType }));

  await t.test('preparation authorizes a single immutable path without sending file bytes through the app', async () => {
    const response = await prepare();
    assert.equal(response.status, 201);
    const { upload } = await response.json();
    assert.equal(upload.path, `${projectId}/${upload.id}.mp4`);
    assert.equal(upload.signedUrl, `https://storage.example/upload/${upload.path}?token=temporary`);
    assert.equal(videos.size, 0);
    assert.equal(objects.size, 0);
  });
  await t.test('preparation rejects oversized files, a third video, and unauthenticated users', async () => {
    const before = signedPaths.length;
    assert.equal((await routeModule.exports.POST(request('POST', { projectId, contentType: 'video/mp4', size: 51 * 1024 * 1024 }))).status, 400);
    count = 2;
    assert.equal((await prepare()).status, 409);
    count = 0; authenticated = false;
    assert.equal((await prepare()).status, 401);
    assert.equal((await complete('57c9da8d-4ffc-4a67-9788-8417a3cab209')).status, 401);
    authenticated = true;
    assert.equal(signedPaths.length, before);
  });
  await t.test('completion validates a file above Vercel’s body limit and attaches it as pending', async () => {
    const { upload } = await (await prepare()).json();
    const bytes = Buffer.alloc(6 * 1024 * 1024); mp4.copy(bytes);
    objects.set(upload.path, new Blob([bytes], { type: 'video/mp4' }));
    const response = await complete(upload.id);
    assert.equal(response.status, 201);
    const { video } = await response.json();
    assert.equal(video.path, upload.path);
    assert.match(video.url, /\/read\//);
    assert.equal(videos.get(upload.id)?.project_id, projectId);
    assert.equal('is_pending' in videos.get(upload.id)!, false, 'The database default keeps new videos private until Save');
    assert.equal((await complete(upload.id)).status, 200, 'Completion is idempotent');
    assert.ok(objects.has(upload.path));
  });
  await t.test('invalid bytes are removed without creating metadata', async () => {
    const { upload } = await (await prepare()).json();
    objects.set(upload.path, new Blob(['not a video'], { type: 'video/mp4' }));
    const response = await complete(upload.id);
    assert.equal(response.status, 400);
    assert.equal(videos.has(upload.id), false);
    assert.equal(objects.has(upload.path), false);
  });
  await t.test('MOV preparation and completion use QuickTime metadata and an immutable .mov path', async () => {
    const response = await routeModule.exports.POST(request('POST', { projectId, contentType: 'video/quicktime', size: 6 * 1024 * 1024 }));
    assert.equal(response.status, 201);
    const { upload } = await response.json();
    assert.equal(upload.path, `${projectId}/${upload.id}.mov`);
    const bytes = Buffer.alloc(6 * 1024 * 1024);
    mp4.copy(bytes);
    bytes.write('qt  ', 8);
    objects.set(upload.path, new Blob([bytes], { type: 'video/quicktime' }));
    const completed = await complete(upload.id, 'video/quicktime');
    assert.equal(completed.status, 201);
    assert.equal((await completed.json()).video.path, upload.path);
    assert.equal(videos.get(upload.id)?.path, upload.path);
    assert.equal((await complete(upload.id, 'video/quicktime')).status, 200);
  });
  await t.test('completion checks actual stored size and MIME rather than trusting preparation metadata', async () => {
    for (const [file, status] of [
      [new Blob([new Uint8Array(50 * 1024 * 1024 + 1)], { type: 'video/mp4' }), 413],
      [new Blob([mp4], { type: 'video/webm' }), 400],
    ] as const) {
      const { upload } = await (await prepare()).json();
      objects.set(upload.path, file);
      assert.equal((await complete(upload.id)).status, status);
      assert.equal(videos.has(upload.id), false);
      assert.equal(objects.has(upload.path), false);
    }
  });
  await t.test('a simultaneous upload losing the final slot cleans its unattached file', async () => {
    const { upload } = await (await prepare()).json();
    objects.set(upload.path, new Blob([mp4], { type: 'video/mp4' }));
    insertError = { message: 'A project can contain up to 2 videos.' };
    const response = await complete(upload.id);
    assert.equal(response.status, 409);
    assert.ok(removedPaths.includes(upload.path));
    assert.equal(videos.has(upload.id), false);
    insertError = null;
  });
  await t.test('concurrent completion retries never delete an attached object', async () => {
    const { upload } = await (await prepare()).json();
    objects.set(upload.path, new Blob([mp4], { type: 'video/mp4' }));
    competingVideo = { id: upload.id, project_id: projectId, path: upload.path, caption: '', sort_order: 0 };
    insertError = { message: 'duplicate key value violates unique constraint project_videos_pkey' };
    const response = await complete(upload.id);
    assert.equal(response.status, 200);
    assert.ok(objects.has(upload.path));
    assert.ok(!removedPaths.includes(upload.path));
    insertError = null; competingVideo = undefined;
  });
});
