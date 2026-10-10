import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { build } from 'esbuild';

type ProjectQueries = typeof import('../src/lib/server/projects');
type DatabaseError = { code: string; message: string };

const projectId = 'a93a4581-5b5c-42d7-bc34-533a2fc71ec5';
const projectRow = {
  id: projectId, slug: 'a-finished-garden', title: 'A finished garden',
  category: 'Garden & Outdoor Improvements', description: 'A completed garden project.',
  location: '', published: true, featured: false, sort_order: 0,
  cover_image_id: '6f630cac-2b1e-48a8-8270-964399682cd1',
  images: [{ id: '6f630cac-2b1e-48a8-8270-964399682cd1', path: `${projectId}/garden.webp`, alt: 'A completed garden', caption: '', sort_order: 0 }],
  comparisons: [],
};
type VideoRow = { id: string; project_id: string; path: string; caption: string; sort_order: number };

function databaseFixture(options: {
  rows?: typeof projectRow[];
  videos?: VideoRow[];
  videoError?: DatabaseError;
  projectError?: DatabaseError;
  signingError?: boolean;
} = {}) {
  const videoQueries: string[][] = [];
  const signed: { bucket: string; paths: string[] }[] = [];
  const rows = options.rows ?? [projectRow];
  const client = {
    from(table: string) {
      if (table === 'project_videos') {
        return { select(columns: string) {
          assert.match(columns, /project_id/);
          return { async in(column: string, ids: string[]) {
            assert.equal(column, 'project_id');
            videoQueries.push(ids);
            return { data: options.videos?.filter((video) => ids.includes(video.project_id)) ?? [], error: options.videoError ?? null };
          } };
        } };
      }
      assert.equal(table, 'projects');
      return { select(columns: string) {
        assert.doesNotMatch(columns, /project_videos/, 'Base project loading must work before the video migration');
        const filters: [string, unknown][] = [];
        const result = () => ({
          data: rows.filter((row) => filters.every(([column, value]) => row[column as keyof typeof row] === value)),
          error: options.projectError ?? null,
        });
        const query = {
          eq(column: string, value: unknown) { filters.push([column, value]); return query; },
          order() { return query; },
          async maybeSingle() { const response = result(); return { ...response, data: response.data[0] ?? null }; },
          then(resolve: (value: ReturnType<typeof result>) => unknown) { return Promise.resolve(result()).then(resolve); },
        };
        return query;
      } };
    },
    storage: { from(bucket: string) {
      return { async createSignedUrls(paths: string[]) {
        signed.push({ bucket, paths });
        return {
          data: paths.map((path) => ({ path, signedUrl: `https://media.example/${bucket}/${path}` })),
          error: options.signingError ? new Error('Storage unavailable') : null,
        };
      } };
    } },
  };
  return { client, videoQueries, signed };
}

async function loadProjectQueries(client: unknown): Promise<ProjectQueries> {
  const built = await build({
    entryPoints: ['src/lib/server/projects.ts'], bundle: true, write: false,
    platform: 'node', format: 'cjs', packages: 'external',
    define: {
      'process.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify('https://database.example'),
      'process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('fixture-key'),
    },
    plugins: [{ name: 'project-loading-fixture', setup(builder) {
      builder.onResolve({ filter: /^(server-only|\.\/auth|@\/lib\/supabase\/server)$/ }, ({ path }) => ({ path, namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
        contents: path === 'server-only' ? '' : path === './auth'
          ? 'export async function requireAdmin() { return { client: fixtureClient() }; }'
          : 'export function createPublicSupabaseClient() { return fixtureClient(); }',
        loader: 'js',
      }));
    } }],
  });
  const queryModule = { exports: {} as ProjectQueries };
  new Function('require', 'module', 'exports', 'fixtureClient', built.outputFiles[0].text)(
    createRequire(import.meta.url), queryModule, queryModule.exports, () => client,
  );
  return queryModule.exports;
}

test('existing projects and signed photographs remain available before the video migration', async (t) => {
  for (const videoError of [
    { code: 'PGRST205', message: "Could not find the table 'public.project_videos' in the schema cache" },
    { code: '42P01', message: 'relation "public.project_videos" does not exist' },
  ]) {
    await t.test(videoError.code, async () => {
      const fixture = databaseFixture({ videoError });
      const queries = await loadProjectQueries(fixture.client);
      const projects = [
        ...(await queries.getPublishedProjects()),
        await queries.getPublishedProject(projectRow.slug),
        ...(await queries.getAdminProjects()),
        await queries.readProject(fixture.client as unknown as Parameters<ProjectQueries['readProject']>[0], projectId),
      ];
      assert.equal(projects.length, 4);
      for (const project of projects) {
        assert.ok(project);
        assert.equal(project.id, projectId);
        assert.equal(project.title, projectRow.title);
        assert.equal(project.images[0].url, `https://media.example/project-images/${projectRow.images[0].path}`);
        assert.deepEqual(project.videos, []);
        assert.equal(project.video_uploads_enabled, false);
      }
      assert.equal(fixture.videoQueries.length, 4);
      assert.ok(fixture.signed.every(({ bucket }) => bucket === 'project-images'));
    });
  }
});

test('the migrated schema attaches, signs and sorts videos for each project', async () => {
  const secondProject = { ...projectRow, id: '3f5cbd0c-2aa8-41c9-8fb6-79d43c5a02ed', slug: 'second-project', images: [] };
  const videos = [
    { id: '4610f124-07a1-4f75-ae3d-a9e3c25f0595', project_id: projectId, path: `${projectId}/after.mp4`, caption: 'After', sort_order: 1 },
    { id: '8e249915-771d-4bff-8c61-956cfd986f67', project_id: secondProject.id, path: `${secondProject.id}/garden.mp4`, caption: 'Second garden', sort_order: 0 },
    { id: 'b0deea9b-1c46-4d9c-9076-76389cf95370', project_id: projectId, path: `${projectId}/before.webm`, caption: 'Before', sort_order: 0 },
  ];
  const fixture = databaseFixture({ rows: [projectRow, secondProject], videos });
  const queries = await loadProjectQueries(fixture.client);
  const projects = await queries.getPublishedProjects();
  assert.equal(projects.length, 2);
  assert.deepEqual(projects[0].videos.map((video) => video.caption), ['Before', 'After']);
  assert.deepEqual(projects[1].videos.map((video) => video.caption), ['Second garden']);
  for (const project of projects) {
    assert.equal(project.video_uploads_enabled, true);
    for (const video of project.videos) assert.equal(video.url, `https://media.example/project-videos/${video.path}`);
  }
  assert.deepEqual(fixture.videoQueries, [[projectId, secondProject.id]]);
  assert.equal(fixture.signed.filter(({ bucket }) => bucket === 'project-videos').length, 1);
});

test('a supported schema with no videos keeps video uploads enabled', async () => {
  const fixture = databaseFixture();
  const queries = await loadProjectQueries(fixture.client);
  const [project] = await queries.getAdminProjects();
  assert.deepEqual(project.videos, []);
  assert.equal(project.video_uploads_enabled, true);
  assert.equal(project.images.length, 1);
  assert.deepEqual(fixture.signed.map(({ bucket }) => bucket), ['project-images']);
});

test('unrelated database and storage failures are not hidden as a missing video migration', async (t) => {
  for (const videoError of [
    { code: '42501', message: 'permission denied for table project_videos' },
    { code: 'PGRST205', message: "Could not find the table 'public.unrelated_table' in the schema cache" },
    { code: '42P01', message: 'relation "public.unrelated_table" does not exist' },
    { code: 'PGRST000', message: 'Connection unavailable' },
  ]) {
    await t.test(videoError.message, async () => {
      const fixture = databaseFixture({ videoError });
      const queries = await loadProjectQueries(fixture.client);
      await assert.rejects(() => queries.getPublishedProjects(), { status: 503 });
    });
  }
  await t.test('project query errors', async () => {
    const fixture = databaseFixture({ projectError: { code: 'PGRST000', message: 'Connection unavailable' } });
    const queries = await loadProjectQueries(fixture.client);
    await assert.rejects(() => queries.getAdminProjects(), { status: 503 });
    assert.deepEqual(fixture.videoQueries, []);
  });
  await t.test('photograph signing errors', async () => {
    const fixture = databaseFixture({ signingError: true });
    const queries = await loadProjectQueries(fixture.client);
    await assert.rejects(() => queries.getPublishedProjects(), { status: 503 });
  });
});

test('empty project results do not query video metadata', async () => {
  const fixture = databaseFixture({ rows: [] });
  const queries = await loadProjectQueries(fixture.client);
  assert.deepEqual(await queries.getPublishedProjects(), []);
  assert.equal(await queries.getPublishedProject('missing-project'), null);
  assert.deepEqual(await queries.getAdminProjects(), []);
  assert.equal(await queries.readProject(fixture.client as unknown as Parameters<ProjectQueries['readProject']>[0], projectId), null);
  assert.deepEqual(fixture.videoQueries, []);
  assert.deepEqual(fixture.signed, []);
});
