import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { build } from 'esbuild';

test('enquiry deletion validates access and only reports confirmed deletions', async (t) => {
  const id = '10000000-0000-4000-8000-000000000001';
  const otherId = '10000000-0000-4000-8000-000000000002';
  const saved = new Set([id, otherId]);
  let authStatus = 200;
  let databaseFails = false;
  let databaseCalls = 0;
  const client = {
    from(table: string) {
      databaseCalls++;
      assert.equal(table, 'enquiries');
      return { delete() { return { eq(column: string, value: string) {
        assert.equal(column, 'id');
        return { select(columns: string) {
          assert.equal(columns, 'id');
          return { async maybeSingle() {
            if (databaseFails) return { data: null, error: new Error('Database unavailable') };
            return { data: saved.delete(value) ? { id: value } : null, error: null };
          } };
        } };
      } }; } };
    },
  };
  const built = await build({
    entryPoints: ['src/app/api/admin/enquiries/[id]/route.ts'],
    bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
    plugins: [{ name: 'admin-fixture', setup(builder) {
      builder.onResolve({ filter: /^@\/lib\/server\/auth$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
        contents: 'import { HttpError } from "@/lib/server/http"; export function requireAdmin() { const status = fixtureStatus(); if (status !== 200) throw new HttpError(status, "Owner access required."); return { client: fixtureClient() }; }',
        loader: 'js', resolveDir: process.cwd(),
      }));
    } }],
  });
  type DeleteHandler = (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response>;
  const routeModule = { exports: {} as { DELETE: DeleteHandler } };
  new Function('require', 'module', 'exports', 'fixtureClient', 'fixtureStatus', built.outputFiles[0].text)(createRequire(import.meta.url), routeModule, routeModule.exports, () => client, () => authStatus);
  const remove = (entryId = id, origin = 'http://localhost') => routeModule.exports.DELETE(
    new Request(`http://localhost/api/admin/enquiries/${entryId}`, { method: 'DELETE', headers: { origin } }),
    { params: Promise.resolve({ id: entryId }) },
  );

  await t.test('rejects signed-out, non-owner, cross-origin and malformed requests before database access', async () => {
    authStatus = 401;
    assert.equal((await remove()).status, 401);
    authStatus = 403;
    assert.equal((await remove()).status, 403);
    authStatus = 200;
    assert.equal((await remove(id, 'https://untrusted.example')).status, 403);
    assert.equal((await remove('invalid')).status, 400);
    assert.equal(databaseCalls, 0);
    assert.equal(saved.size, 2);
  });
  await t.test('database failure retains the enquiry and returns an error', async () => {
    databaseFails = true;
    assert.equal((await remove()).status, 500);
    assert.equal(saved.size, 2);
    databaseFails = false;
  });
  await t.test('owner deletes only the requested enquiry and missing records return 404', async () => {
    const response = await remove();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
    assert.match(response.headers.get('cache-control') || '', /private, no-store/);
    assert.deepEqual([...saved], [otherId]);
    assert.equal((await remove()).status, 404);
    assert.deepEqual([...saved], [otherId]);
  });
});
