-- Run AFTER the migration as postgres: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/security.sql
-- All fixtures and checks run in a transaction and are rolled back.
begin;
insert into auth.users(id, email, raw_user_meta_data, created_at, updated_at) values
  ('10000000-0000-4000-8000-000000000001', 'gnj-security-owner@example.invalid', '{}', now(), now()),
  ('10000000-0000-4000-8000-000000000002', 'gnj-security-outsider@example.invalid', '{"role":"admin","is_admin":true}', now(), now());
insert into public.admin_users(user_id) values ('10000000-0000-4000-8000-000000000001');
insert into public.projects(id, slug, title, category, published) values
  ('20000000-0000-4000-8000-000000000001', 'security-test-draft', 'Private draft', 'Flooring', false),
  ('20000000-0000-4000-8000-000000000002', 'security-test-public', 'Public project', 'Flooring', true);
insert into public.project_images(id, project_id, path, is_pending) values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001.webp', false),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002/30000000-0000-4000-8000-000000000002.webp', false),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002/30000000-0000-4000-8000-000000000003.webp', true);
insert into storage.objects(bucket_id, name) values
  ('project-images', '20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001.webp'),
  ('project-images', '20000000-0000-4000-8000-000000000002/30000000-0000-4000-8000-000000000002.webp'),
  ('project-images', '20000000-0000-4000-8000-000000000002/30000000-0000-4000-8000-000000000003.webp');
insert into public.enquiries(name, email, service, message) values ('Security test', 'test@example.invalid', 'Flooring', 'A private test enquiry.');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  if public.is_admin() then raise exception 'Anonymous user incorrectly has owner access'; end if;
  if exists(select 1 from public.projects where slug = 'security-test-draft') then raise exception 'Anonymous visitor can read drafts'; end if;
  if not exists(select 1 from public.projects where slug = 'security-test-public') then raise exception 'Published project is not public'; end if;
  if exists(select 1 from public.project_images where project_id = '20000000-0000-4000-8000-000000000001') then raise exception 'Anonymous visitor can read draft gallery'; end if;
  if exists(select 1 from storage.objects where name = '20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001.webp') then raise exception 'Anonymous visitor can sign draft image'; end if;
  if not exists(select 1 from storage.objects where name = '20000000-0000-4000-8000-000000000002/30000000-0000-4000-8000-000000000002.webp') then raise exception 'Published image is inaccessible'; end if;
  if exists(select 1 from public.project_images where id = '30000000-0000-4000-8000-000000000003') then raise exception 'Pending photo on a published project is public'; end if;
  if exists(select 1 from storage.objects where name = '20000000-0000-4000-8000-000000000002/30000000-0000-4000-8000-000000000003.webp') then raise exception 'Pending photo can be signed publicly'; end if;
  begin
    perform 1 from public.enquiries;
    raise exception 'Anonymous visitor can read enquiries';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.enquiries(name, email, service, message) values ('Bypass test', 'test@example.invalid', 'Flooring', 'Bypass the server validation.');
    raise exception 'Anonymous visitor can bypass enquiry validation';
  exception when insufficient_privilege then null; end;
  begin
    perform public.consume_rate_limit(repeat('a', 64), 1, 3600);
    raise exception 'Anonymous visitor can change rate limits';
  exception when insufficient_privilege then null; end;
end; $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000002","user_metadata":{"role":"admin","is_admin":true}}', true);
do $$ declare affected integer; begin
  if public.is_admin() then raise exception 'User metadata granted owner access'; end if;
  if exists(select 1 from public.projects where slug = 'security-test-draft') then raise exception 'Non-owner can read drafts'; end if;
  if exists(select 1 from public.enquiries) then raise exception 'Non-owner can read enquiries'; end if;
  begin
    insert into public.admin_users(user_id) values ('10000000-0000-4000-8000-000000000002');
    raise exception 'User can promote themselves to owner';
  exception when insufficient_privilege then null; end;
  update public.projects set title = 'Unauthorised change' where slug = 'security-test-public';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Non-owner can modify projects'; end if;
  begin
    insert into public.projects(slug, title, category) values ('security-unwanted-project', 'Unauthorised project', 'Flooring');
    raise exception 'Non-owner can create projects';
  exception when insufficient_privilege then null; end;
end; $$;

select set_config('request.jwt.claims', '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000001"}', true);
do $$ begin
  if not public.is_admin() then raise exception 'Owner is not recognised'; end if;
  if not exists(select 1 from public.projects where slug = 'security-test-draft') then raise exception 'Owner cannot read drafts'; end if;
  if not exists(select 1 from public.enquiries where name = 'Security test') then raise exception 'Owner cannot read enquiries'; end if;
  if not exists(select 1 from storage.objects where name = '20000000-0000-4000-8000-000000000001/30000000-0000-4000-8000-000000000001.webp') then raise exception 'Owner cannot read draft image'; end if;
  update public.projects set description = 'An authorised change.' where slug = 'security-test-draft';
end; $$;
reset role;
do $$ begin
  if (select public from storage.buckets where id = 'project-images') then raise exception 'Project image bucket must be private'; end if;
end; $$;
rollback;
