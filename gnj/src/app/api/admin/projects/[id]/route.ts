import { z } from 'zod';
import { requireAdmin } from '@/lib/server/auth';
import { readProject } from '@/lib/server/projects';
import { assertSameOrigin, errorResponse, HttpError, json, readJson } from '@/lib/server/http';
import { projectPatchSchema, projectSchema, validateProjectRelations } from '@/lib/validation';
import { PROJECT_BUCKET, PROJECT_VIDEO_BUCKET } from '@/lib/supabase/config';

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { client } = await requireAdmin();
    const id = z.uuid().parse((await context.params).id);
    const project = await readProject(client, id);
    if (!project) throw new HttpError(404, 'Project not found.');
    return json({ project });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const { client } = await requireAdmin();
    const id = z.uuid().parse((await context.params).id);
    const input = projectPatchSchema.parse(await readJson(request));
    const current = await readProject(client, id);
    if (!current) throw new HttpError(404, 'Project not found.');
    const project = projectSchema.parse({ ...current, ...input });
    try { validateProjectRelations(project); } catch (error) { throw new HttpError(400, (error as Error).message); }
    for (const image of project.images) {
      if (!current.images.some((saved) => saved.id === image.id && saved.path === image.path)) throw new HttpError(400, 'Photographs must be uploaded to this project first.');
    }
    for (const video of project.videos) {
      if (!current.videos.some((saved) => saved.id === video.id && saved.path === video.path)) throw new HttpError(400, 'Videos must be uploaded to this project first.');
    }
    const saveData: Record<string, unknown> = { ...project };
    // Detail-only or older clients must not publish pending video uploads.
    if (input.videos === undefined) delete saveData.videos;
    const { error } = await client.rpc('save_project', { p_project_id: id, p_data: saveData });
    if (error) throw error;
    const removedPaths = current.images.filter((saved) => !project.images.some((image) => image.id === saved.id)).map((image) => image.path);
    if (removedPaths.length) {
      const { error: cleanupError } = await client.storage.from(PROJECT_BUCKET).remove(removedPaths);
      if (cleanupError) console.error('Project saved; unused storage cleanup failed:', cleanupError.message);
    }
    const removedVideoPaths = current.videos.filter((saved) => !project.videos.some((video) => video.id === saved.id)).map((video) => video.path);
    if (removedVideoPaths.length) {
      const { error: cleanupError } = await client.storage.from(PROJECT_VIDEO_BUCKET).remove(removedVideoPaths);
      if (cleanupError) console.error('Project saved; unused video storage cleanup failed:', cleanupError.message);
    }
    return json({ project: await readProject(client, id) });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const { client } = await requireAdmin();
    const id = z.uuid().parse((await context.params).id);
    const current = await readProject(client, id);
    if (!current) throw new HttpError(404, 'Project not found.');
    const { error } = await client.from('projects').delete().eq('id', id);
    if (error) throw error;
    if (current.images.length) {
      const { error: cleanupError } = await client.storage.from(PROJECT_BUCKET).remove(current.images.map((image) => image.path));
      if (cleanupError) console.error('Project deleted; storage cleanup failed:', cleanupError.message);
    }
    if (current.videos.length) {
      const { error: cleanupError } = await client.storage.from(PROJECT_VIDEO_BUCKET).remove(current.videos.map((video) => video.path));
      if (cleanupError) console.error('Project deleted; video storage cleanup failed:', cleanupError.message);
    }
    return json({ ok: true });
  } catch (error) { return errorResponse(error); }
}
