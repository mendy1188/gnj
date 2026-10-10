begin;

create table public.project_videos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  path text not null unique,
  caption text not null default '' check (char_length(caption) <= 500),
  sort_order integer not null default 0 check (sort_order between 0 and 10000),
  is_pending boolean not null default true,
  created_at timestamptz not null default now(),
  -- Two unique slots enforce the cap even for concurrent writes or project moves.
  -- Clients omit this internal field; the trigger assigns the available slot.
  slot smallint not null check (slot in (1, 2)),
  constraint project_videos_project_slot_key unique (project_id, slot),
  check (path = project_id::text || '/' || id::text || '.mp4'
    or path = project_id::text || '/' || id::text || '.webm')
);
create index project_videos_project_order on public.project_videos (project_id, sort_order);

create function public.assign_project_video_slot() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.project_id = old.project_id then return new; end if;
  perform 1 from public.projects where id = new.project_id for update;
  select candidate into new.slot from generate_series(1, 2) as candidate
  where not exists (
    select 1 from public.project_videos v where v.project_id = new.project_id and v.slot = candidate
  ) order by candidate limit 1;
  if new.slot is null then
    raise exception 'A project can contain up to 2 videos.' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.assign_project_video_slot() from public;
create trigger project_videos_assign_slot before insert or update of project_id on public.project_videos
  for each row execute function public.assign_project_video_slot();

alter table public.project_videos enable row level security;
revoke all on public.project_videos from anon, authenticated;
grant select on public.project_videos to anon, authenticated;
grant insert, update, delete on public.project_videos to authenticated;
grant all on public.project_videos to service_role;

create policy "Published project videos or owner" on public.project_videos for select to anon, authenticated
  using ((select public.is_admin()) or (not is_pending and exists(select 1 from public.projects p where p.id = project_id and p.published)));
create policy "Owner creates videos" on public.project_videos for insert to authenticated with check ((select public.is_admin()));
create policy "Owner updates videos" on public.project_videos for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Owner deletes videos" on public.project_videos for delete to authenticated using ((select public.is_admin()));

-- Keep the existing atomic photo/comparison save, extending it with optional videos.
-- Older callers that omit videos must not remove or publish pending video uploads.
create or replace function public.save_project(p_project_id uuid, p_data jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare image jsonb; pair jsonb; video jsonb; image_ids uuid[]; video_ids uuid[];
begin
  if not public.is_admin() then raise exception 'Owner access required' using errcode = '42501'; end if;
  perform 1 from public.projects where id = p_project_id for update;
  if not found then raise exception 'Project not found'; end if;
  if jsonb_array_length(p_data->'images') > 60 or jsonb_array_length(p_data->'comparisons') > 20 then raise exception 'Too many images or comparisons'; end if;
  select coalesce(array_agg((value->>'id')::uuid), '{}'::uuid[]) into image_ids from jsonb_array_elements(p_data->'images');
  if cardinality(image_ids) <> (select count(distinct id) from unnest(image_ids) id) then raise exception 'Duplicate images'; end if;
  for image in select value from jsonb_array_elements(p_data->'images') loop
    if not exists(select 1 from public.project_images where id = (image->>'id')::uuid and project_id = p_project_id and path = image->>'path') then
      raise exception 'Image does not belong to this project';
    end if;
  end loop;
  if p_data ? 'videos' then
    if jsonb_typeof(p_data->'videos') is distinct from 'array' then raise exception 'Videos must be an array'; end if;
    if jsonb_array_length(p_data->'videos') > 2 then
      raise exception 'A project can contain up to 2 videos.' using errcode = '23514';
    end if;
    select coalesce(array_agg((value->>'id')::uuid), '{}'::uuid[]) into video_ids from jsonb_array_elements(p_data->'videos');
    if cardinality(video_ids) <> (select count(distinct id) from unnest(video_ids) id) then raise exception 'Duplicate videos'; end if;
    for video in select value from jsonb_array_elements(p_data->'videos') loop
      if not exists(select 1 from public.project_videos where id = (video->>'id')::uuid and project_id = p_project_id and path = video->>'path') then
        raise exception 'Video does not belong to this project';
      end if;
    end loop;
  end if;
  if (p_data->>'published')::boolean then
    if char_length(trim(p_data->>'description')) = 0 or cardinality(image_ids) = 0 or p_data->>'cover_image_id' is null then raise exception 'Add a description and cover photograph before publishing'; end if;
    if exists(select 1 from jsonb_array_elements(p_data->'images') where char_length(trim(value->>'alt')) = 0) then raise exception 'Add alternative text before publishing'; end if;
  end if;
  if p_data->>'cover_image_id' is not null and not ((p_data->>'cover_image_id')::uuid = any(image_ids)) then raise exception 'The cover must belong to this project'; end if;
  update public.projects set
    title = p_data->>'title', category = p_data->>'category', description = p_data->>'description', location = p_data->>'location',
    published = (p_data->>'published')::boolean, featured = (p_data->>'featured')::boolean, sort_order = (p_data->>'sort_order')::integer,
    cover_image_id = (p_data->>'cover_image_id')::uuid
  where id = p_project_id;
  delete from public.project_comparisons where project_id = p_project_id;
  delete from public.project_images where project_id = p_project_id and not (id = any(image_ids));
  for image in select value from jsonb_array_elements(p_data->'images') loop
    update public.project_images set alt = image->>'alt', caption = image->>'caption', sort_order = (image->>'sort_order')::integer, is_pending = false
    where id = (image->>'id')::uuid and project_id = p_project_id;
  end loop;
  for pair in select value from jsonb_array_elements(p_data->'comparisons') loop
    insert into public.project_comparisons (id, project_id, before_id, after_id, label, aligned)
    values ((pair->>'id')::uuid, p_project_id, (pair->>'before_id')::uuid, (pair->>'after_id')::uuid, pair->>'label', (pair->>'aligned')::boolean);
  end loop;
  if p_data ? 'videos' then
    delete from public.project_videos where project_id = p_project_id and not (id = any(video_ids));
    for video in select value from jsonb_array_elements(p_data->'videos') loop
      update public.project_videos set caption = video->>'caption', sort_order = (video->>'sort_order')::integer, is_pending = false
      where id = (video->>'id')::uuid and project_id = p_project_id;
    end loop;
  end if;
end;
$$;

-- Private objects follow the project's draft/public status and pending upload state.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-videos', 'project-videos', false, 52428800, array['video/mp4', 'video/webm'])
on conflict (id) do update set public = false, file_size_limit = 52428800, allowed_mime_types = array['video/mp4', 'video/webm'];

create policy "Read published project video objects or owner" on storage.objects for select to anon, authenticated
using (bucket_id = 'project-videos' and (
  (select public.is_admin()) or exists (
    select 1 from public.project_videos v join public.projects p on p.id = v.project_id
    where v.path = name and p.published and not v.is_pending
  )
));
create policy "Owner uploads project video objects" on storage.objects for insert to authenticated
with check (bucket_id = 'project-videos' and (select public.is_admin()) and exists (
  select 1 from public.projects p where p.id::text = (storage.foldername(name))[1]
));
create policy "Owner updates project video objects" on storage.objects for update to authenticated
using (bucket_id = 'project-videos' and (select public.is_admin()))
with check (bucket_id = 'project-videos' and (select public.is_admin()));
create policy "Owner deletes project video objects" on storage.objects for delete to authenticated
using (bucket_id = 'project-videos' and (select public.is_admin()));

commit;
