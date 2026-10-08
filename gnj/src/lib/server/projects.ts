import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { seedProjects } from '@/lib/content';
import type { Project, ProjectImage, ComparisonPair } from '@/lib/types';
import { isSupabaseConfigured, PROJECT_BUCKET, SIGNED_URL_SECONDS } from '@/lib/supabase/config';
import { createPublicSupabaseClient } from '@/lib/supabase/server';
import { requireAdmin } from './auth';
import { HttpError } from './http';

type ProjectRow = Omit<Project, 'images'> & { images: Omit<ProjectImage, 'url'>[] };
const selection = 'id, slug, title, category, description, location, published, featured, sort_order, cover_image_id, created_at, updated_at, images:project_images!project_images_project_id_fkey(id, path, alt, caption, sort_order), comparisons:project_comparisons(id, before_id, after_id, label, aligned)';

async function hydrateProjects(client: SupabaseClient, rows: ProjectRow[]): Promise<Project[]> {
  const paths = [...new Set(rows.flatMap((row) => row.images.map((image) => image.path)))];
  const signedUrls = new Map<string, string>();
  if (paths.length) {
    const { data, error } = await client.storage.from(PROJECT_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
    if (error) throw new HttpError(503, 'Project photographs could not be loaded. Please try again.');
    for (const entry of data || []) {
      if (entry.path && entry.signedUrl) signedUrls.set(entry.path, entry.signedUrl);
    }
    if (paths.some((path) => !signedUrls.has(path))) throw new HttpError(503, 'Some project photographs are unavailable. Please try again.');
  }
  return rows.map((row) => ({
    ...row,
    images: row.images.map((photo) => ({ ...photo, url: signedUrls.get(photo.path) || '' })).sort((a, b) => a.sort_order - b.sort_order),
    comparisons: (row.comparisons || []) as ComparisonPair[],
  }));
}

export async function getPublishedProjects(): Promise<Project[]> {
  if (!isSupabaseConfigured()) return seedProjects.filter((project) => project.published);
  const client = createPublicSupabaseClient();
  const { data, error } = await client.from('projects').select(selection).eq('published', true).order('sort_order').order('created_at', { ascending: false });
  if (error) throw new HttpError(503, 'The portfolio could not be loaded. Please try again.');
  return hydrateProjects(client, (data || []) as unknown as ProjectRow[]);
}

export async function getPublishedProject(slug: string): Promise<Project | null> {
  if (!isSupabaseConfigured()) return seedProjects.find((project) => project.published && project.slug === slug) || null;
  const client = createPublicSupabaseClient();
  const { data, error } = await client.from('projects').select(selection).eq('published', true).eq('slug', slug).maybeSingle();
  if (error) throw new HttpError(503, 'This project could not be loaded. Please try again.');
  if (!data) return null;
  return (await hydrateProjects(client, [data as unknown as ProjectRow]))[0];
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
