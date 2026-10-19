import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { build } from 'esbuild';

const projectId = 'a93a4581-5b5c-42d7-bc34-533a2fc71ec5';
const imageId = '6f630cac-2b1e-48a8-8270-964399682cd1';
const original = { id: imageId, project_id: projectId, path: `${projectId}/photo.webp`, alt: 'Garden patio', caption: '', is_pending: false, project: { id: projectId, title: 'Patio', published: true } };
type Route = typeof import('../src/lib/server/public-images');

async function fixture() {
  const state = { image: structuredClone(original) as typeof original | null, downloads: 0, filters: [] as [string, unknown][], failure: false };
  const client = {
    from(table: string) {
      assert.equal(table, 'project_images');
      const query = {
        select() { return query; },
        eq(key: string, value: unknown) { state.filters.push([key, value]); return query; },
        async maybeSingle() { return { data: state.image, error: state.failure ? new Error('offline') : null }; },
      }; return query;
    },
    storage: { from(bucket: string) { assert.equal(bucket, 'project-images'); return { async download(path: string) {
      state.downloads++; assert.equal(path, original.path);
      return { data: new Blob(['fixture-webp-bytes'], { type: 'image/webp' }), error: null };
    } }; } },
  };
  const built = await build({ entryPoints: ['src/lib/server/public-images.ts'], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
    define: { 'process.env.NEXT_PUBLIC_SUPABASE_URL': '"https://database.example"', 'process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY': '"fixture-key"' },
    plugins: [{ name: 'public-media-fixture', setup(builder) {
      builder.onResolve({ filter: /^(server-only|@\/lib\/supabase\/server)$/ }, ({ path }) => ({ path, namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({ contents: path === 'server-only' ? '' : 'export function createPublicSupabaseClient() { return fixtureClient(); }', loader: 'js' }));
    } }],
  });
  const routeModule = { exports: {} as Route };
  new Function('require', 'module', 'exports', 'fixtureClient', built.outputFiles[0].text)(createRequire(import.meta.url), routeModule, routeModule.exports, () => client);
  const get = (filename = 'garden-patio.webp', id = imageId) => routeModule.exports.serveProjectImage(new Request(`https://www.gnjgarden.com/project-images/${projectId}/${id}/${filename}`), { projectId, imageId: id, filename });
  return { state, get };
}

test('stable public photo route checks publication and pending state before delivering WebP', async () => {
  const { state, get } = await fixture();
  const response = await get();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/webp');
  assert.match(response.headers.get('cache-control')!, /private, no-store/);
  assert.equal(await response.text(), 'fixture-webp-bytes');
  assert.ok(state.filters.some(([key, value]) => key === 'project.published' && value === true));
  assert.ok(state.filters.some(([key, value]) => key === 'is_pending' && value === false));
  state.image!.project.published = false;
  assert.equal((await get()).status, 404, 'Unpublishing revokes the same public URL');
  assert.equal(state.downloads, 1);
});

test('pending, mismatched, malformed and missing image requests never download storage bytes', async () => {
  const { state, get } = await fixture();
  assert.equal((await get('garden-patio.webp', 'not-a-uuid')).status, 404);
  state.image!.is_pending = true;
  assert.equal((await get()).status, 404);
  state.image = structuredClone(original); state.image.path = 'another-project/photo.webp';
  assert.equal((await get()).status, 404);
  state.image = structuredClone(original); state.image.path = `${projectId}/../private.webp`;
  assert.equal((await get()).status, 404);
  state.image = null;
  assert.equal((await get()).status, 404);
  assert.equal(state.downloads, 0);
});

test('descriptive filename redirects and transient database failures are not cached', async () => {
  const { state, get } = await fixture();
  const redirect = await get('old-name.webp');
  assert.equal(redirect.status, 308);
  assert.match(redirect.headers.get('location')!, /\/garden-patio.webp$/);
  assert.equal(state.downloads, 0);
  state.failure = true;
  const response = await get();
  assert.equal(response.status, 503);
  assert.match(response.headers.get('cache-control')!, /no-store/);
});
