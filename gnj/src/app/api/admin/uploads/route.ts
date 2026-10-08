import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireAdmin } from '@/lib/server/auth';
import { ALLOWED_IMAGE_TYPES, MAX_UPLOAD_BYTES, optimiseProjectImage } from '@/lib/server/images';
import { assertSameOrigin, errorResponse, HttpError, json } from '@/lib/server/http';
import { PROJECT_BUCKET, SIGNED_URL_SECONDS } from '@/lib/supabase/config';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { client } = await requireAdmin();
    if (Number(request.headers.get('content-length') || 0) > MAX_UPLOAD_BYTES + 65_536) throw new HttpError(413, 'Choose a photograph smaller than 10 MB.');
    const form = await request.formData();
    const projectId = z.uuid().parse(form.get('projectId'));
    const file = form.get('file');
    if (!(file instanceof File)) throw new HttpError(400, 'Choose a photograph to upload.');
    if (file.size > MAX_UPLOAD_BYTES) throw new HttpError(413, 'Choose a photograph smaller than 10 MB.');
    if (file.type && !ALLOWED_IMAGE_TYPES.includes(file.type)) throw new HttpError(415, 'Choose a JPEG, PNG or WebP photograph. Convert HEIC photographs to JPEG first.');
    const { data: project, error: projectError } = await client.from('projects').select('id').eq('id', projectId).maybeSingle();
    if (projectError) throw projectError;
    if (!project) throw new HttpError(404, 'Save this project before uploading photographs.');
    const { count, error: countError } = await client.from('project_images').select('id', { count: 'exact', head: true }).eq('project_id', projectId);
    if (countError) throw countError;
    if ((count || 0) >= 60) throw new HttpError(400, 'A project can contain up to 60 photographs.');
    let imageBytes: Buffer;
    try { imageBytes = await optimiseProjectImage(Buffer.from(await file.arrayBuffer())); } catch (error) { throw new HttpError(400, (error as Error).message); }
    const id = randomUUID();
    const path = `${projectId}/${id}.webp`;
    const { error: uploadError } = await client.storage.from(PROJECT_BUCKET).upload(path, imageBytes, { contentType: 'image/webp', cacheControl: '300', upsert: false });
    if (uploadError) throw uploadError;
    const { data: image, error: insertError } = await client.from('project_images').insert({ id, project_id: projectId, path, alt: '', caption: '', sort_order: count || 0 }).select('id, path, alt, caption, sort_order').single();
    if (insertError) {
      await client.storage.from(PROJECT_BUCKET).remove([path]);
      throw insertError;
    }
    const { data: signed } = await client.storage.from(PROJECT_BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
    return json({ image: { ...image, url: signed?.signedUrl || '' } }, 201);
  } catch (error) { return errorResponse(error); }
}
