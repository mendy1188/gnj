import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
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
    for (const migration of (await readdir('supabase/migrations')).filter((name) => name.endsWith('.sql')).sort()) {
      await db.exec(await readFile(`supabase/migrations/${migration}`, 'utf8'));
    }
    await t.test('anonymous visitors and non-owners cannot access drafts, pending photos or enquiries, or escalate privileges', async () => {
      await db.exec(await readFile('supabase/tests/security.sql', 'utf8'));
      assert.equal((await db.query<{ count: number }>('select count(*)::integer as count from public.projects')).rows[0].count, 0);
    });

    await t.test('draft and pending videos and their storage objects stay private, and only owners can change videos', async () => {
      await db.exec(await readFile('supabase/tests/video-security.sql', 'utf8'));
      assert.equal((await db.query<{ count: number }>('select count(*)::integer as count from public.projects')).rows[0].count, 0);
      const bucket = (await db.query<{ public: boolean; file_size_limit: number; allowed_mime_types: string[] }>("select public, file_size_limit::integer, allowed_mime_types from storage.buckets where id = 'project-videos'")).rows[0];
      assert.equal(bucket.public, false);
      assert.equal(bucket.file_size_limit, 50 * 1024 * 1024);
      assert.deepEqual(bucket.allowed_mime_types, ['video/mp4', 'video/webm', 'video/quicktime']);
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

    await t.test('video saves persist order and captions, enforce ownership, preserve legacy saves and remove deleted videos', async () => {
      const ownerId = randomUUID(); const projectId = randomUUID(); const otherProjectId = randomUUID();
      const imageId = randomUUID(); const ids = [randomUUID(), randomUUID()]; const otherId = randomUUID();
      await db.query('insert into auth.users(id) values ($1)', [ownerId]);
      await db.query('insert into public.admin_users(user_id) values ($1)', [ownerId]);
      await db.query("insert into public.projects(id, slug, title, category) values ($1, 'video-save-test', 'Video project', 'Flooring'), ($2, 'other-video-test', 'Other project', 'Flooring')", [projectId, otherProjectId]);
      await db.query('insert into public.project_images(id, project_id, path) values ($1, $2, $3)', [imageId, projectId, `${projectId}/${imageId}.webp`]);
      const videos = ids.map((id, index) => ({ id, path: `${projectId}/${id}.${index ? 'webm' : 'mov'}`, caption: `Finished floor ${index + 1}`, sort_order: 1 - index }));
      for (const video of videos) await db.query('insert into public.project_videos(id, project_id, path) values ($1, $2, $3)', [video.id, projectId, video.path]);
      await db.query('insert into public.project_videos(id, project_id, path) values ($1, $2, $3)', [otherId, otherProjectId, `${otherProjectId}/${otherId}.mp4`]);
      const data = { title: 'Finished video project', category: 'Flooring', description: 'A completed flooring project.', location: '', published: true, featured: false, sort_order: 0, cover_image_id: imageId, images: [{ id: imageId, path: `${projectId}/${imageId}.webp`, alt: 'Finished flooring', caption: '', sort_order: 0 }], comparisons: [] };
      await db.exec('set role authenticated');
      await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ role: 'authenticated', sub: ownerId })]);
      await db.query('select public.save_project($1, $2::jsonb)', [projectId, JSON.stringify(data)]);
      assert.equal((await db.query<{ count: number }>('select count(*)::integer as count from public.project_videos where project_id = $1 and is_pending', [projectId])).rows[0].count, 2, 'Legacy saves preserve pending videos without publishing them');
      await db.query('select public.save_project($1, $2::jsonb)', [projectId, JSON.stringify({ ...data, videos })]);
      const saved = (await db.query<{ id: string; caption: string; sort_order: number; is_pending: boolean }>('select id, caption, sort_order, is_pending from public.project_videos where project_id = $1 order by sort_order', [projectId])).rows;
      assert.deepEqual(saved, [...videos].reverse().map(({ id, caption, sort_order }) => ({ id, caption, sort_order, is_pending: false })));
      await db.query('select public.save_project($1, $2::jsonb)', [projectId, JSON.stringify(data)]);
      assert.deepEqual((await db.query('select id, caption, sort_order, is_pending from public.project_videos where project_id = $1 order by sort_order', [projectId])).rows, saved, 'Legacy saves preserve already saved videos and their metadata');
      const saveInvalid = (invalidVideos: unknown) => db.query('select public.save_project($1, $2::jsonb)', [projectId, JSON.stringify({ ...data, title: 'Should roll back', videos: invalidVideos })]);
      await assert.rejects(() => saveInvalid([...videos, videos[0]]), /up to 2 videos/);
      await assert.rejects(() => saveInvalid([videos[0], videos[0]]), /Duplicate videos/);
      await assert.rejects(() => saveInvalid(null), /Videos must be an array/);
      await assert.rejects(() => saveInvalid([{ ...videos[0], id: otherId, path: `${otherProjectId}/${otherId}.mp4` }]), /Video does not belong/);
      await assert.rejects(() => saveInvalid([{ ...videos[0], path: videos[1].path }]), /Video does not belong/);
      await assert.rejects(() => saveInvalid([{ ...videos[0], caption: 'x'.repeat(501) }]), /check constraint/);
      assert.equal((await db.query<{ title: string }>('select title from public.projects where id = $1', [projectId])).rows[0].title, data.title);
      assert.deepEqual((await db.query('select id, caption, sort_order, is_pending from public.project_videos where project_id = $1 order by sort_order', [projectId])).rows, saved, 'Invalid videos roll back all project and video edits');
      await db.query('select public.save_project($1, $2::jsonb)', [projectId, JSON.stringify({ ...data, videos: [videos[1]] })]);
      assert.deepEqual((await db.query<{ id: string }>('select id from public.project_videos where project_id = $1', [projectId])).rows.map((row) => row.id), [videos[1].id]);
      await db.query('select public.save_project($1, $2::jsonb)', [projectId, JSON.stringify({ ...data, videos: [] })]);
      assert.equal((await db.query<{ count: number }>('select count(*)::integer as count from public.project_videos where project_id = $1', [projectId])).rows[0].count, 0);
      await db.query('delete from public.projects where id = $1', [otherProjectId]);
      assert.equal((await db.query<{ count: number }>('select count(*)::integer as count from public.project_videos where project_id = $1', [otherProjectId])).rows[0].count, 0, 'Project deletion cascades to its videos');
      await db.exec('reset role');
    });

    await t.test('database slots enforce a hard two-video limit on inserts and project moves', async () => {
      const projectId = randomUUID(); const otherProjectId = randomUUID();
      const ids = [randomUUID(), randomUUID(), randomUUID()];
      await db.query("insert into public.projects(id, slug, title, category) values ($1, 'video-limit-test', 'Video limit', 'Flooring'), ($2, 'video-move-test', 'Moving video', 'Flooring')", [projectId, otherProjectId]);
      const insert = (id: string, targetId = projectId) => db.query('insert into public.project_videos(id, project_id, path) values ($1, $2, $3)', [id, targetId, `${targetId}/${id}.mp4`]);
      await insert(ids[0]); await insert(ids[1]);
      await assert.rejects(() => insert(ids[2]), /A project can contain up to 2 videos/);
      await insert(ids[2], otherProjectId);
      await assert.rejects(() => db.query('update public.project_videos set project_id = $1, path = $2 where id = $3', [projectId, `${projectId}/${ids[2]}.mp4`, ids[2]]), /up to 2 videos/);
      await assert.rejects(() => db.query('update public.project_videos set slot = 3 where id = $1', [ids[0]]), /check constraint/);
      await assert.rejects(() => db.query('update public.project_videos set slot = null where id = $1', [ids[0]]), /not-null constraint/);
      await assert.rejects(() => db.query('update public.project_videos set slot = 2 where id = $1', [ids[0]]), /project_videos_project_slot_key/);
      // PostgreSQL's unique constraint, rather than a count check, is the final
      // concurrency guard even if two transactions select the same free slot.
      await db.exec('alter table public.project_videos disable trigger project_videos_assign_slot');
      try {
        const conflictingId = randomUUID();
        await assert.rejects(() => db.query('insert into public.project_videos(id, project_id, path, slot) values ($1, $2, $3, 1)', [conflictingId, projectId, `${projectId}/${conflictingId}.mp4`]), /project_videos_project_slot_key/);
      } finally {
        await db.exec('alter table public.project_videos enable trigger project_videos_assign_slot');
      }
      await db.query('delete from public.project_videos where id = $1', [ids[0]]);
      await db.query('update public.project_videos set project_id = $1, path = $2 where id = $3', [projectId, `${projectId}/${ids[2]}.mp4`, ids[2]]);
      assert.equal((await db.query<{ slot: number }>('select slot from public.project_videos where id = $1', [ids[2]])).rows[0].slot, 1, 'A deleted slot is reusable when moving a video');
      await assert.rejects(() => db.query('update public.project_videos set path = $1 where id = $2', [`${projectId}/${ids[2]}.avi`, ids[2]]), /check constraint/);
      await assert.rejects(() => db.query('update public.project_videos set path = $1 where id = $2', [`${otherProjectId}/${ids[2]}.mp4`, ids[2]]), /check constraint/);
      await assert.rejects(() => db.query('update public.project_videos set sort_order = -1 where id = $1', [ids[2]]), /check constraint/);
      assert.equal((await db.query<{ count: number }>('select count(*)::integer as count from public.project_videos where project_id = $1', [projectId])).rows[0].count, 2);
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
