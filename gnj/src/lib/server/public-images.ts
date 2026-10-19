import 'server-only';
import { createPublicSupabaseClient } from '@/lib/supabase/server';
import { isSupabaseConfigured, PROJECT_BUCKET } from '@/lib/supabase/config';
import { imageFileName } from '@/lib/public-images';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' };

export async function serveProjectImage(request: Request, params: { projectId: string; imageId: string; filename: string }) {
  if (!uuid.test(params.projectId) || !uuid.test(params.imageId) || !isSupabaseConfigured()) return new Response('Not found', { status: 404, headers });
  // No owner cookie or service-role key: the public RLS policies apply to metadata and bytes.
  const client = createPublicSupabaseClient();
  const { data, error } = await client.from('project_images')
    .select('id, project_id, path, alt, caption, is_pending, project:projects!project_images_project_id_fkey!inner(id, title, published)')
    .eq('id', params.imageId).eq('project_id', params.projectId).eq('is_pending', false).eq('project.published', true).maybeSingle();
  if (error) return new Response('Image temporarily unavailable', { status: 503, headers });
  const image = data as unknown as { id: string; project_id: string; path: string; alt: string; caption: string; is_pending: boolean; project: { id: string; title: string; published: boolean } } | null;
  if (!image || image.is_pending || !image.project?.published || image.project.id !== params.projectId || image.project_id !== params.projectId || image.id !== params.imageId || !image.path.startsWith(`${params.projectId}/`) || !image.path.endsWith('.webp') || image.path.split('/').some(part => part === '..' || part === '.')) return new Response('Not found', { status: 404, headers });
  const filename = imageFileName(image.project.title, image);
  if (params.filename !== filename) {
    const url = new URL(request.url);
    url.pathname = `/project-images/${params.projectId}/${params.imageId}/${filename}`;
    url.search = '';
    return new Response(null, { status: 308, headers: { ...headers, Location: url.href } });
  }
  const { data: bytes, error: downloadError } = await client.storage.from(PROJECT_BUCKET).download(image.path);
  if (downloadError || !bytes) return new Response('Image temporarily unavailable', { status: 503, headers });
  if (bytes.type !== 'image/webp' || bytes.size > 10 * 1024 * 1024) return new Response('Image unavailable', { status: 503, headers });
  return new Response(bytes, { headers: { ...headers, 'Content-Type': 'image/webp', 'Content-Length': String(bytes.size) } });
}
