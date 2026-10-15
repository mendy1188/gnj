-- Run after all migrations as postgres. All fixtures are rolled back.
begin;
insert into auth.users(id) values
  ('11000000-0000-4000-8000-000000000001'), ('11000000-0000-4000-8000-000000000002');
insert into public.admin_users(user_id) values ('11000000-0000-4000-8000-000000000001');
insert into public.projects(id, slug, title, category, published) values
  ('21000000-0000-4000-8000-000000000001', 'video-security-draft', 'Private video draft', 'Flooring', false),
  ('21000000-0000-4000-8000-000000000002', 'video-security-public', 'Public video project', 'Flooring', true);
insert into public.project_videos(id, project_id, path, is_pending) values
  ('31000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001/31000000-0000-4000-8000-000000000001.mov', false),
  ('31000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000002/31000000-0000-4000-8000-000000000002.mov', false),
  ('31000000-0000-4000-8000-000000000003', '21000000-0000-4000-8000-000000000002', '21000000-0000-4000-8000-000000000002/31000000-0000-4000-8000-000000000003.mp4', true);
insert into storage.objects(bucket_id, name) select 'project-videos', path from public.project_videos;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  if (select count(*) from public.project_videos) <> 1 then raise exception 'Anonymous users must see only the saved published video'; end if;
  if not exists(select 1 from public.project_videos where id = '31000000-0000-4000-8000-000000000002') then raise exception 'Published video is inaccessible'; end if;
  if (select count(*) from storage.objects where bucket_id = 'project-videos') <> 1 then raise exception 'Anonymous users can sign draft or pending videos'; end if;
  if not exists(select 1 from storage.objects where name = '21000000-0000-4000-8000-000000000002/31000000-0000-4000-8000-000000000002.mov') then raise exception 'Published video object is inaccessible'; end if;
  begin
    insert into public.project_videos(id, project_id, path) values ('31000000-0000-4000-8000-000000000004', '21000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001/31000000-0000-4000-8000-000000000004.mp4');
    raise exception 'Anonymous user can insert videos';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects(bucket_id, name) values ('project-videos', '21000000-0000-4000-8000-000000000001/31000000-0000-4000-8000-000000000004.mp4');
    raise exception 'Anonymous user can upload videos';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_project('21000000-0000-4000-8000-000000000002', '{}');
    raise exception 'Anonymous user can save projects';
  exception when insufficient_privilege then null; end;
end; $$;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"11000000-0000-4000-8000-000000000002","user_metadata":{"is_admin":true}}', true);
do $$ declare affected integer; begin
  if (select count(*) from public.project_videos) <> 1 then raise exception 'Non-owner can read private videos'; end if;
  if (select count(*) from storage.objects where bucket_id = 'project-videos') <> 1 then raise exception 'Non-owner can sign private videos'; end if;
  begin
    insert into public.project_videos(id, project_id, path) values ('31000000-0000-4000-8000-000000000004', '21000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001/31000000-0000-4000-8000-000000000004.mp4');
    raise exception 'Non-owner can insert videos';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects(bucket_id, name) values ('project-videos', '21000000-0000-4000-8000-000000000001/31000000-0000-4000-8000-000000000004.mp4');
    raise exception 'Non-owner can upload videos';
  exception when insufficient_privilege then null; end;
  begin
    perform public.save_project('21000000-0000-4000-8000-000000000002', '{"videos":[]}');
    raise exception 'Non-owner can save projects';
  exception when insufficient_privilege then null; end;
  update public.project_videos set caption = 'Unauthorised';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Non-owner can update videos'; end if;
  delete from public.project_videos;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Non-owner can delete videos'; end if;
  update storage.objects set name = 'Unauthorised' where bucket_id = 'project-videos';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Non-owner can update video objects'; end if;
  delete from storage.objects where bucket_id = 'project-videos';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Non-owner can delete video objects'; end if;
end; $$;

select set_config('request.jwt.claims', '{"role":"authenticated","sub":"11000000-0000-4000-8000-000000000001"}', true);
do $$ begin
  if (select count(*) from public.project_videos) <> 3 then raise exception 'Owner cannot read all videos'; end if;
  if (select count(*) from storage.objects where bucket_id = 'project-videos') <> 3 then raise exception 'Owner cannot sign private videos'; end if;
  insert into public.project_videos(id, project_id, path) values ('31000000-0000-4000-8000-000000000004', '21000000-0000-4000-8000-000000000001', '21000000-0000-4000-8000-000000000001/31000000-0000-4000-8000-000000000004.mp4');
  insert into storage.objects(bucket_id, name) values ('project-videos', '21000000-0000-4000-8000-000000000001/31000000-0000-4000-8000-000000000004.mp4');
  update public.project_videos set caption = 'Owner edit' where id = '31000000-0000-4000-8000-000000000004';
  if not exists(select 1 from public.project_videos where caption = 'Owner edit') then raise exception 'Owner cannot edit videos'; end if;
  update storage.objects set name = name where name = '21000000-0000-4000-8000-000000000001/31000000-0000-4000-8000-000000000004.mp4';
  delete from public.project_videos where id = '31000000-0000-4000-8000-000000000004';
  delete from storage.objects where name = '21000000-0000-4000-8000-000000000001/31000000-0000-4000-8000-000000000004.mp4';
  if exists(select 1 from public.project_videos where id = '31000000-0000-4000-8000-000000000004') then raise exception 'Owner cannot delete videos'; end if;
  if exists(select 1 from storage.objects where name = '21000000-0000-4000-8000-000000000001/31000000-0000-4000-8000-000000000004.mp4') then raise exception 'Owner cannot delete video objects'; end if;
  begin
    insert into storage.objects(bucket_id, name) values ('project-videos', 'missing-project/unattached.mp4');
    raise exception 'Owner can upload outside an existing project folder';
  exception when insufficient_privilege then null; end;
end; $$;
reset role;
rollback;
