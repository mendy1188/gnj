begin;

-- Keep existing videos and the two-slot cap while allowing QuickTime paths.
alter table public.project_videos drop constraint project_videos_check;
alter table public.project_videos add constraint project_videos_check check (
  path = project_id::text || '/' || id::text || '.mp4'
  or path = project_id::text || '/' || id::text || '.webm'
  or path = project_id::text || '/' || id::text || '.mov'
);

update storage.buckets
set allowed_mime_types = array['video/mp4', 'video/webm', 'video/quicktime']
where id = 'project-videos';

commit;
