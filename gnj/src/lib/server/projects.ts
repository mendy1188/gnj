import 'server-only';
import { cache } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { seedProjects } from '@/lib/content';
import type { Project, ProjectImage, ProjectVideo, ComparisonPair } from '@/lib/types';
import { isSupabaseConfigured, PROJECT_BUCKET, PROJECT_VIDEO_BUCKET, SIGNED_URL_SECONDS } from '@/lib/supabase/config';
import { createPublicSupabaseClient } from '@/lib/supabase/server';
import { requireAdmin } from './auth';
import { HttpError } from './http';
import { isMissingProjectVideos } from './video-schema';
import { publicImageUrl } from '@/lib/public-images';

type ProjectRow = Omit<Project, 'images' | 'videos' | 'video_uploads_enabled'> & { images: Omit<ProjectImage, 'url'>[] };
type VideoRow = Omit<ProjectVideo, 'url'> & { project_id: string };
const selection = 'id, slug, title, category, description, location, published, featured, sort_order, cover_image_id, created_at, updated_at, images:project_images!project_images_project_id_fkey(id, path, alt, caption, sort_order), comparisons:project_comparisons(id, before_id, after_id, label, aligned)';

async function loadProjectVideos(client: SupabaseClient, projectIds: string[]) {
  if (!projectIds.length) return { enabled: true, videos: [] as VideoRow[] };
  // Each project has at most two videos. Small batches avoid URL and row limits.
  const batches: string[][] = [];
  for (let index = 0; index < projectIds.length; index += 100) batches.push(projectIds.slice(index, index + 100));
  const results = await Promise.all(batches.map(ids => client.from('project_videos').select('id, project_id, path, caption, sort_order').in('project_id', ids)));
  // An app deployment may arrive before its additive database migration.
  // Only the missing video table permits fallback; other failures remain errors.
  if (results.every(result => result.error && isMissingProjectVideos(result.error))) return { enabled: false, videos: [] as VideoRow[] };
  if (results.some(result => result.error)) throw new HttpError(503, 'Project videos could not be loaded. Please try again.');
  return { enabled: true, videos: results.flatMap(result => result.data || []) as VideoRow[] };
}

async function signProjectMedia(client: SupabaseClient, bucket: string, paths: string[], label: string) {
  const signedUrls = new Map<string, string>();
  if (paths.length) {
    const { data, error } = await client.storage.from(bucket).createSignedUrls(paths, SIGNED_URL_SECONDS);
    if (error) throw new HttpError(503, `Project ${label} could not be loaded. Please try again.`);
    for (const entry of data || []) {
      if (entry.path && entry.signedUrl) signedUrls.set(entry.path, entry.signedUrl);
    }
    if (paths.some((path) => !signedUrls.has(path))) throw new HttpError(503, `Some project ${label} are unavailable. Please try again.`);
  }
  return signedUrls;
}

async function hydrateProjects(client: SupabaseClient, rows: ProjectRow[], publicImages = false): Promise<Project[]> {
  const { enabled, videos } = await loadProjectVideos(client, rows.map(row => row.id));
  const [signedUrls, videoUrls] = await Promise.all([
    publicImages ? Promise.resolve(new Map<string, string>()) : signProjectMedia(client, PROJECT_BUCKET, [...new Set(rows.flatMap((row) => row.images.map((image) => image.path)))], 'photographs'),
    signProjectMedia(client, PROJECT_VIDEO_BUCKET, [...new Set(videos.map(video => video.path))], 'videos'),
  ]);
  return rows.map((row) => ({
    ...row,
    images: row.images.map((photo) => ({ ...photo, url: publicImages ? publicImageUrl(row, photo) : signedUrls.get(photo.path) || '' })).sort((a, b) => a.sort_order - b.sort_order),
    videos: videos.filter(video => video.project_id === row.id).map(({ id, path, caption, sort_order }) => ({ id, path, caption, sort_order, url: videoUrls.get(path) || '' })).sort((a, b) => a.sort_order - b.sort_order),
    video_uploads_enabled: enabled,
    comparisons: (row.comparisons || []) as ComparisonPair[],
  }));
}

export async function getPublishedProjects(): Promise<Project[]> {
  if (!isSupabaseConfigured()) return seedProjects.filter((project) => project.published);
  const client = createPublicSupabaseClient();
  const { data, error } = await client.from('projects').select(selection).eq('published', true).order('sort_order').order('created_at', { ascending: false });
  if (error) throw new HttpError(503, 'The portfolio could not be loaded. Please try again.');
  return hydrateProjects(client, (data || []) as unknown as ProjectRow[], true);
}

export const getPublishedProject = cache(async (slug: string): Promise<Project | null> => {
  if (!isSupabaseConfigured()) return seedProjects.find((project) => project.published && project.slug === slug) || null;
  const client = createPublicSupabaseClient();
  const { data, error } = await client.from('projects').select(selection).eq('published', true).eq('slug', slug).maybeSingle();
  if (error) throw new HttpError(503, 'This project could not be loaded. Please try again.');
  if (!data) return null;
  return (await hydrateProjects(client, [data as unknown as ProjectRow], true))[0];
});

// Sitemap discovery must not depend on signed media or the optional video schema.
export async function getSitemapProjects(): Promise<Project[]> {
  if (!isSupabaseConfigured()) return seedProjects.filter(project => project.published);
  const client = createPublicSupabaseClient();
  const { data, error } = await client.from('projects').select(selection).eq('published', true).order('sort_order');
  if (error) throw new HttpError(503, 'The sitemap project list is temporarily unavailable.');
  return ((data || []) as unknown as ProjectRow[]).map(row => ({ ...row, images: row.images.map(image => ({ ...image, url: publicImageUrl(row, image) })), videos: [] }));
}

export async function getAdminProjects(): Promise<Project[]> {
  const { client } = await requireAdmin();
  const { data, error } = await client.from('projects').select(selection).order('sort_order').order('created_at', { ascending: false });
  if (error) throw new HttpError(503, 'Projects could not be loaded. Please try again.');
  return hydrateProjects(client, (data || []) as unknown as ProjectRow[]);
}

export async function readProject(client: SupabaseClient, id: string): Promise<Project | null> {
  const { data, error } = await client.from('projects').select(selection).eq('id', id).maybeSingle();
  if (error) throw new HttpError(503, 'This project could not be loaded. Please try again.');
  if (!data) return null;
  return (await hydrateProjects(client, [data as unknown as ProjectRow]))[0];
}

export async function getAdminProject(id: string): Promise<Project | null> {
  const { client } = await requireAdmin();
  return readProject(client, id);
}
