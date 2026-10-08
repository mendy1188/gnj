begin;

create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admin_users enable row level security;
revoke all on public.admin_users from anon, authenticated;
grant select on public.admin_users to authenticated;
grant all on public.admin_users to service_role;
create policy "Owners can see their own membership" on public.admin_users for select to authenticated using (user_id = (select auth.uid()));

-- Membership is server-managed, never user metadata or a client-writable profile field.
create function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.admin_users where user_id = (select auth.uid())); $$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(trim(title)) between 2 and 140),
  category text not null check (category in ('Garden & Outdoor Improvements', 'Flooring', 'Bathroom Renovations', 'Plumbing')),
  description text not null default '' check (char_length(description) <= 6000),
  location text not null default '' check (char_length(location) <= 160),
  published boolean not null default false,
  featured boolean not null default false,
  sort_order integer not null default 0 check (sort_order between 0 and 10000),
  cover_image_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_images (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  path text not null unique,
  alt text not null default '' check (char_length(alt) <= 240),
  caption text not null default '' check (char_length(caption) <= 500),
  is_pending boolean not null default true,
  sort_order integer not null default 0 check (sort_order between 0 and 10000),
  created_at timestamptz not null default now(),
  unique (id, project_id),
  check (path = project_id::text || '/' || id::text || '.webp')
);

-- A cover must belong to this very project. Deferred checking permits atomic gallery edits.
alter table public.projects add constraint projects_cover_belongs_to_project
  foreign key (cover_image_id, id) references public.project_images(id, project_id)
  deferrable initially deferred;

create table public.project_comparisons (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  before_id uuid not null,
  after_id uuid not null,
  label text not null default '' check (char_length(label) <= 160),
  aligned boolean not null default false,
  created_at timestamptz not null default now(),
  check (before_id <> after_id),
  foreign key (before_id, project_id) references public.project_images(id, project_id) on delete cascade,
  foreign key (after_id, project_id) references public.project_images(id, project_id) on delete cascade
);

create index projects_portfolio_order on public.projects (published, sort_order, created_at desc);
create index project_images_project_order on public.project_images (project_id, sort_order);
create index project_comparisons_project on public.project_comparisons (project_id);

create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger projects_updated_at before update on public.projects for each row execute function public.set_updated_at();

alter table public.projects enable row level security;
alter table public.project_images enable row level security;
alter table public.project_comparisons enable row level security;
revoke all on public.projects, public.project_images, public.project_comparisons from anon, authenticated;
grant select on public.projects, public.project_images, public.project_comparisons to anon, authenticated;
grant insert, update, delete on public.projects, public.project_images, public.project_comparisons to authenticated;
grant all on public.projects, public.project_images, public.project_comparisons to service_role;

create policy "Published projects or owner" on public.projects for select to anon, authenticated using (published or (select public.is_admin()));
create policy "Owner creates projects" on public.projects for insert to authenticated with check ((select public.is_admin()));
create policy "Owner updates projects" on public.projects for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Owner deletes projects" on public.projects for delete to authenticated using ((select public.is_admin()));

create policy "Published project images or owner" on public.project_images for select to anon, authenticated
  using ((select public.is_admin()) or (not is_pending and exists(select 1 from public.projects p where p.id = project_id and p.published)));
create policy "Owner creates images" on public.project_images for insert to authenticated with check ((select public.is_admin()));
create policy "Owner updates images" on public.project_images for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Owner deletes images" on public.project_images for delete to authenticated using ((select public.is_admin()));

create policy "Published project comparisons or owner" on public.project_comparisons for select to anon, authenticated
  using ((select public.is_admin()) or exists(select 1 from public.projects p where p.id = project_id and p.published));
create policy "Owner creates comparisons" on public.project_comparisons for insert to authenticated with check ((select public.is_admin()));
create policy "Owner updates comparisons" on public.project_comparisons for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "Owner deletes comparisons" on public.project_comparisons for delete to authenticated using ((select public.is_admin()));

create table public.enquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 100),
  email text not null default '' check (char_length(email) <= 254),
  phone text not null default '' check (char_length(phone) <= 40),
  service text not null check (service in ('Garden & Outdoor Improvements', 'Flooring', 'Bathroom Renovations', 'Plumbing', 'Not sure yet')),
  message text not null check (char_length(trim(message)) between 10 and 5000),
  created_at timestamptz not null default now(),
  check (email <> '' or phone <> '')
);
create index enquiries_newest on public.enquiries(created_at desc);
alter table public.enquiries enable row level security;
revoke all on public.enquiries from anon, authenticated;
grant select on public.enquiries to authenticated;
grant all on public.enquiries to service_role;
create policy "Only owners read enquiries" on public.enquiries for select to authenticated using ((select public.is_admin()));
-- No public INSERT: the server validates and rate-limits before using its service key.

create table public.enquiry_rate_limits (
  key text primary key check (key ~ '^[a-f0-9]{64}$'),
  hits integer not null,
  window_start timestamptz not null
);
alter table public.enquiry_rate_limits enable row level security;
revoke all on public.enquiry_rate_limits from anon, authenticated;
grant all on public.enquiry_rate_limits to service_role;

create function public.consume_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_hits integer;
begin
  if p_key !~ '^[a-f0-9]{64}$' or p_limit not between 1 and 100 or p_window_seconds not between 1 and 86400 then
    raise exception 'Invalid rate limit arguments';
  end if;
  delete from public.enquiry_rate_limits where window_start < now() - interval '1 day';
  insert into public.enquiry_rate_limits as limits (key, hits, window_start) values (p_key, 1, now())
  on conflict (key) do update set
    hits = case when limits.window_start <= now() - make_interval(secs => p_window_seconds) then 1 else least(limits.hits + 1, 1000000) end,
    window_start = case when limits.window_start <= now() - make_interval(secs => p_window_seconds) then now() else limits.window_start end
  returning hits into v_hits;
  return v_hits <= p_limit;
end;
$$;
revoke all on function public.consume_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(text, integer, integer) to service_role;

-- An invoker transaction keeps project details, gallery order and comparison pairs in sync.
create function public.save_project(p_project_id uuid, p_data jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
declare image jsonb; pair jsonb; image_ids uuid[];
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
end;
$$;
revoke all on function public.save_project(uuid, jsonb) from public, anon;
grant execute on function public.save_project(uuid, jsonb) to authenticated;

create function public.reorder_projects(p_ids uuid[]) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_admin() then raise exception 'Owner access required' using errcode = '42501'; end if;
  if cardinality(p_ids) > 1000 or cardinality(p_ids) <> (select count(distinct id) from unnest(p_ids) id) then raise exception 'Invalid project ordering'; end if;
  update public.projects p set sort_order = sorted.position - 1
  from (select id, ordinality::integer as position from unnest(p_ids) with ordinality as list(id, ordinality)) sorted
  where p.id = sorted.id;
end;
$$;
revoke all on function public.reorder_projects(uuid[]) from public, anon;
grant execute on function public.reorder_projects(uuid[]) to authenticated;

-- The bucket must stay PRIVATE: a public bucket bypasses its read policies.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-images', 'project-images', false, 10485760, array['image/webp'])
on conflict (id) do update set public = false, file_size_limit = 10485760, allowed_mime_types = array['image/webp'];

create policy "Read published project objects or owner" on storage.objects for select to anon, authenticated
using (bucket_id = 'project-images' and (
  (select public.is_admin()) or exists (
    select 1 from public.project_images i join public.projects p on p.id = i.project_id
    where i.path = name and p.published and not i.is_pending
  )
));
create policy "Owner uploads project objects" on storage.objects for insert to authenticated
with check (bucket_id = 'project-images' and (select public.is_admin()) and exists (
  select 1 from public.projects p where p.id::text = (storage.foldername(name))[1]
));
create policy "Owner updates project objects" on storage.objects for update to authenticated
using (bucket_id = 'project-images' and (select public.is_admin()))
with check (bucket_id = 'project-images' and (select public.is_admin()));
create policy "Owner deletes project objects" on storage.objects for delete to authenticated
using (bucket_id = 'project-images' and (select public.is_admin()));

commit;
