import { z } from 'zod';
import { requireAdmin } from '@/lib/server/auth';
import { readProject } from '@/lib/server/projects';
import { assertSameOrigin, errorResponse, HttpError, json } from '@/lib/server/http';
import { projectSchema, validateProjectRelations } from '@/lib/validation';
import { PROJECT_BUCKET } from '@/lib/supabase/config';

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const { client } = await requireAdmin();
    const id = z.uuid().parse((await context.params).id);
    const { data: image, error: imageError } = await client.from('project_images').select('project_id, path').eq('id', id).maybeSingle();
    if (imageError) throw imageError;
    if (!image) throw new HttpError(404, 'Photograph not found.');
    const current = await readProject(client, image.project_id);
    if (!current) throw new HttpError(404, 'Project not found.');
    const images = current.images.filter((entry) => entry.id !== id);
    const project = projectSchema.parse({ ...current, images, cover_image_id: current.cover_image_id === id ? (images[0]?.id || null) : current.cover_image_id, comparisons: current.comparisons.filter((pair) => pair.before_id !== id && pair.after_id !== id) });
    try { validateProjectRelations(project); } catch (error) { throw new HttpError(400, (error as Error).message); }
    const { error } = await client.rpc('save_project', { p_project_id: current.id, p_data: project });
    if (error) throw error;
    const { error: cleanupError } = await client.storage.from(PROJECT_BUCKET).remove([image.path]);
    if (cleanupError) console.error('Photograph removed; storage cleanup failed:', cleanupError.message);
    return json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
