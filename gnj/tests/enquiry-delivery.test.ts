import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { build } from 'esbuild';

type Entry = { name: string; email: string; phone: string; service: string; message: string };
type SavedEntry = Entry & { id: string; created_at: string };

test('enquiries are saved for the owner without sending email', async (t) => {
  const envNames = ['SUPABASE_SERVICE_ROLE_KEY', 'RESEND_API_KEY', 'RESEND_FROM_EMAIL', 'RESEND_NOTIFICATION_TO'] as const;
  const originalEnv = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  let outgoingRequests = 0;
  t.after(() => {
    globalThis.fetch = originalFetch;
    for (const name of envNames) {
      if (originalEnv[name] === undefined) delete process.env[name];
      else process.env[name] = originalEnv[name];
    }
  });
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  process.env.RESEND_API_KEY = 'test-configured-email-provider';
  process.env.RESEND_FROM_EMAIL = 'website@example.com';
  process.env.RESEND_NOTIFICATION_TO = 'owner@example.com';
  globalThis.fetch = async () => { outgoingRequests++; return new Response('{}', { status: 200 }); };

  const saved: SavedEntry[] = [];
  let saveFails = false;
  let allowed = true;
  let ownerSignedIn = true;
  const client = {
    async rpc(name: string) {
      assert.equal(name, 'consume_rate_limit');
      return { data: allowed, error: null };
    },
    from(table: string) {
      assert.equal(table, 'enquiries');
      return {
        async insert(entry: Entry) {
          if (saveFails) return { error: { message: 'Database unavailable' } };
          saved.push({ ...entry, id: `enquiry-${saved.length + 1}`, created_at: new Date().toISOString() });
          return { error: null };
        },
        select() {
          return { order(column: string, options: { ascending: boolean }) {
            assert.equal(column, 'created_at');
            assert.equal(options.ascending, false);
            return { async limit(count: number) { return { data: saved.slice().reverse().slice(0, count), error: null }; } };
          } };
        },
      };
    },
  };
  async function loadRoute(entryPoint: string) {
    const built = await build({
      entryPoints: [entryPoint], bundle: true, write: false, platform: 'node', format: 'cjs', packages: 'external',
      plugins: [{ name: 'enquiry-fixture', setup(builder) {
        builder.onResolve({ filter: /^@\/lib\/(supabase\/(server|config)|server\/auth)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
        builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({
          contents: args.path.endsWith('/config') ? 'export function isSupabaseConfigured() { return true; }'
            : args.path.endsWith('/auth') ? 'import {HttpError} from "@/lib/server/http"; export function requireAdmin() { if (!fixtureOwner()) throw new HttpError(401, "Please sign in to continue."); return {client: fixtureClient()}; }'
              : 'export function createServiceSupabaseClient() { return fixtureClient(); }',
          loader: 'js', resolveDir: process.cwd(),
        }));
      } }],
    });
    const routeModule = { exports: {} as Record<'POST' | 'GET', (request?: Request) => Promise<Response>> };
    new Function('require', 'module', 'exports', 'fixtureClient', 'fixtureOwner', built.outputFiles[0].text)(createRequire(import.meta.url), routeModule, routeModule.exports, () => client, () => ownerSignedIn);
    return routeModule.exports;
  }
  const submissions = await loadRoute('src/app/api/enquiries/route.ts');
  const dashboard = await loadRoute('src/app/api/admin/enquiries/route.ts');
  const entry: Entry = { name: 'Test Customer', email: 'customer@example.com', phone: '', service: 'Not sure yet', message: 'Please discuss a garden project with me.' };
  const submit = (changes: Partial<Entry> = {}) => submissions.POST(new Request('http://localhost/api/enquiries', {
    method: 'POST', headers: { 'Content-Type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify({ ...entry, ...changes, website: '', startedAt: Date.now() - 3000 }),
  }));

  await t.test('successful submissions persist and appear in the admin list without an email request', async () => {
    const response = await submit();
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { ok: true });
    assert.equal(saved.length, 1);
    assert.deepEqual(saved[0], { ...entry, id: saved[0].id, created_at: saved[0].created_at });
    await submit({ name: 'Second Customer', email: '', phone: '+44 7700 900123' });
    const adminResponse = await dashboard.GET();
    assert.equal(adminResponse.status, 200);
    assert.match(adminResponse.headers.get('cache-control') || '', /private, no-store/);
    assert.deepEqual((await adminResponse.json()).enquiries, saved.slice().reverse());
    assert.equal(outgoingRequests, 0, 'Configured email credentials must never cause notification delivery');
  });
  await t.test('a failed save does not report success or send email', async () => {
    saveFails = true;
    const response = await submit();
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /could not be saved/);
    assert.equal(saved.length, 2);
    assert.equal(outgoingRequests, 0);
    saveFails = false;
  });
  await t.test('rate-limited and invalid entries are not saved', async () => {
    allowed = false;
    assert.equal((await submit()).status, 429);
    allowed = true;
    assert.equal((await submit({ email: '', phone: '' })).status, 400);
    assert.equal(saved.length, 2);
    assert.equal(outgoingRequests, 0);
  });
  await t.test('enquiries remain accessible only to the authenticated owner', async () => {
    ownerSignedIn = false;
    assert.equal((await dashboard.GET()).status, 401);
  });
});
