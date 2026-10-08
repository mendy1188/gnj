import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';

// Real PostgreSQL execution with minimal stand-ins for Supabase-owned auth/storage
// tables. This verifies our migration/RLS/RPCs, not GoTrue, PostgREST or Storage HTTP.
const supabaseSchemas = `
  create role anon noinherit;
  create role authenticated noinherit;
  create role service_role noinherit bypassrls;
  create schema auth;
  create schema storage;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb, created_at timestamptz, updated_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claims', true)::jsonb->>'sub', '')::uuid;
  $$;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text);
  alter table storage.objects enable row level security;
  grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1)-1];
  $$;
`;

test('database migration, privacy policies and persistence RPCs execute in PostgreSQL', { timeout: 30000 }, async (t) => {
  const db = new PGlite();
  try {
    await db.exec(supabaseSchemas);
    await db.exec(await readFile('supabase/migrations/202609260001_initial.sql', 'utf8'));
    await t.test('anonymous visitors and non-owners cannot access drafts, pending photos or enquiries, or escalate privileges', async () => {
      await db.exec(await readFile('supabase/tests/security.sql', 'utf8'));
      assert.equal((await db.query<{ count: number }>('select count(*)::integer as count from public.projects')).rows[0].count, 0);
    });

    await t.test('saving atomically persists publication, gallery order and comparisons, and rolls back invalid pairs', async () => {
      const ownerId = randomUUID(); const projectId = randomUUID();
      const ids = [randomUUID(), randomUUID()];
      await db.query('insert into auth.users(id) values ($1)', [ownerId]);
      await db.query('insert into public.admin_users(user_id) values ($1)', [ownerId]);
      await db.query("insert into public.projects(id, slug, title, category) values ($1, 'database-save-test', 'Test project', 'Flooring')", [projectId]);
      for (const [index, id] of ids.entries()) {
        await db.query('insert into public.project_images(id, project_id, path, sort_order) values ($1, $2, $3, $4)', [id, projectId, `${projectId}/${id}.webp`, index]);
      }
      const data = { title: 'Finished project', category: 'Flooring', description: 'A completed flooring project.', location: '', published: true, featured: true, sort_order: 4, cover_image_id: ids[1], images: ids.map((id, index) => ({ id, path: `${projectId}/${id}.webp`, alt: `Flooring photograph ${index + 1}`, caption: '', sort_order: 1 - index })), comparisons: [{ id: randomUUID(), before_id: ids[0], after_id: ids[1], label: 'Kitchen floor', aligned: true }] };
      await db.exec('set role authenticated');
      await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ role: 'authenticated', sub: ownerId })]);
      await db.query('select public.save_project($1, $2::jsonb)', [projectId, JSON.stringify(data)]);
      const saved = (await db.query<{ published: boolean; cover_image_id: string }>('select published, cover_image_id from public.projects where id = $1', [projectId])).rows[0];
      assert.equal(saved.published, true); assert.equal(saved.cover_image_id, ids[1]);
      const photos = (await db.query<{ id: string; is_pending: boolean }>('select id, is_pending from public.project_images where project_id = $1 order by sort_order', [projectId])).rows;
      assert.equal(photos[0].id, ids[1]); assert.ok(photos.every((image) => !image.is_pending));
      assert.equal((await db.query<{ label: string }>('select label from public.project_comparisons where project_id = $1', [projectId])).rows[0].label, 'Kitchen floor');
      await assert.rejects(() => db.query('select public.save_project($1, $2::jsonb)', [projectId, JSON.stringify({ ...data, title: 'Should be rolled back', comparisons: [{ ...data.comparisons[0], after_id: randomUUID() }] })]), /foreign key/);
      assert.equal((await db.query<{ title: string }>('select title from public.projects where id = $1', [projectId])).rows[0].title, 'Finished project', 'A failed pair update must roll back the title update');
      await db.query('select public.reorder_projects($1::uuid[])', [[projectId]]);
      assert.equal((await db.query<{ sort_order: number }>('select sort_order from public.projects where id = $1', [projectId])).rows[0].sort_order, 0);
      await db.query('select public.save_project($1, $2::jsonb)', [projectId, JSON.stringify({ ...data, published: false, images: [data.images[1]], comparisons: [] })]);
      assert.equal((await db.query<{ count: number }>('select count(*)::integer as count from public.project_images where project_id = $1', [projectId])).rows[0].count, 1);
      await db.query('delete from public.projects where id = $1', [projectId]);
      assert.equal((await db.query<{ count: number }>('select count(*)::integer as count from public.project_images where project_id = $1', [projectId])).rows[0].count, 0, 'Project deletion cascades to its gallery');
      await db.exec('reset role');
    });

    await t.test('rate limits are durable, atomic and callable only by the server role', async () => {
      await db.exec('set role service_role');
      const key = 'd'.repeat(64);
      assert.equal((await db.query<{ allowed: boolean }>('select public.consume_rate_limit($1, 1, 3600) as allowed', [key])).rows[0].allowed, true);
      assert.equal((await db.query<{ allowed: boolean }>('select public.consume_rate_limit($1, 1, 3600) as allowed', [key])).rows[0].allowed, false);
      await db.exec('reset role');
    });
  } finally { await db.close(); }
});
