import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/server/auth';
import { assertSameOrigin, errorResponse, HttpError, json, readJson } from '@/lib/server/http';
import { validateProjectVideo } from '@/lib/server/videos';
import { MAX_PROJECT_VIDEOS, MAX_VIDEO_UPLOAD_BYTES, ALLOWED_VIDEO_TYPES, VIDEO_EXTENSIONS, getVideoContentType } from '@/lib/videos';
import { PROJECT_VIDEO_BUCKET, SIGNED_URL_SECONDS } from '@/lib/supabase/config';
import { isMissingProjectVideos, VIDEO_SETUP_MESSAGE } from '@/lib/server/video-schema';

export const runtime = 'nodejs';
export const maxDuration = 60;

const uploadSchema = z.object({
  projectId: z.uuid(),
  contentType: z.enum(ALLOWED_VIDEO_TYPES),
  size: z.number().int().positive().max(MAX_VIDEO_UPLOAD_BYTES, 'Choose a video no larger than 50 MB.'),
});
const completionSchema = uploadSchema.omit({ size: true }).extend({ id: z.uuid() });
const limitMessage = 'A project can contain up to 2 videos. Save any removals before uploading another.';

async function assertVideoSlot(client: SupabaseClient, projectId: string) {
  const { data: project, error: projectError } = await client.from('projects').select('id').eq('id', projectId).maybeSingle();
  if (projectError) throw projectError;
  if (!project) throw new HttpError(404, 'Save this project before uploading videos.');
  const { count, error } = await client.from('project_videos').select('id', { count: 'exact' }).eq('project_id', projectId);
  if (error && isMissingProjectVideos(error)) throw new HttpError(503, VIDEO_SETUP_MESSAGE);
  if (error) throw error;
  if ((count || 0) >= MAX_PROJECT_VIDEOS) throw new HttpError(409, limitMessage);
  return count || 0;
}

async function videoPreview(client: SupabaseClient, video: { id: string; path: string; caption: string; sort_order: number }) {
  const { data, error } = await client.storage.from(PROJECT_VIDEO_BUCKET).createSignedUrl(video.path, SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) throw new HttpError(503, 'The video could not be prepared. Please try again.');
  return { ...video, url: data.signedUrl };
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { client } = await requireAdmin();
    if (request.headers.get('content-type')?.includes('application/json')) {
      const input = uploadSchema.parse(await readJson(request));
      await assertVideoSlot(client, input.projectId);
      const id = randomUUID();
      const extension = VIDEO_EXTENSIONS[input.contentType];
      const path = `${input.projectId}/${id}.${extension}`;
      const { data, error } = await client.storage.from(PROJECT_VIDEO_BUCKET).createSignedUploadUrl(path, { upsert: false });
      if (error || !data?.signedUrl) {
        console.error('Video upload authorization failed:', error?.message || 'No signed upload URL returned');
        throw new HttpError(503, 'Video storage could not be reached. Please try again.');
      }
      return json({ upload: { id, path, signedUrl: data.signedUrl } }, 201);
    }
    if (Number(request.headers.get('content-length') || 0) > MAX_VIDEO_UPLOAD_BYTES + 65_536) throw new HttpError(413, 'Choose a video no larger than 50 MB.');
    const form = await request.formData();
    const projectId = z.uuid().parse(form.get('projectId'));
    const file = form.get('file');
    if (!(file instanceof File)) throw new HttpError(400, 'Choose a video to upload.');
    if (file.size > MAX_VIDEO_UPLOAD_BYTES) throw new HttpError(413, 'Choose a video no larger than 50 MB.');
    const contentType = getVideoContentType(file);
    if (!contentType) throw new HttpError(415, 'Choose an MP4, WebM or MOV video.');
    const { data: project, error: projectError } = await client.from('projects').select('id').eq('id', projectId).maybeSingle();
    if (projectError) throw projectError;
    if (!project) throw new HttpError(404, 'Save this project before uploading videos.');
    const { count, error: countError } = await client.from('project_videos').select('id', { count: 'exact' }).eq('project_id', projectId);
    if (countError && isMissingProjectVideos(countError)) throw new HttpError(503, VIDEO_SETUP_MESSAGE);
    if (countError) throw countError;
    if ((count || 0) >= MAX_PROJECT_VIDEOS) throw new HttpError(400, 'A project can contain up to 2 videos. Save any removals before uploading another.');
    const bytes = Buffer.from(await file.arrayBuffer());
    let format: ReturnType<typeof validateProjectVideo>;
    try { format = validateProjectVideo(bytes, contentType); } catch (error) { throw new HttpError(400, (error as Error).message); }
    const id = randomUUID();
    const path = `${projectId}/${id}.${format.extension}`;
    const bucket = client.storage.from(PROJECT_VIDEO_BUCKET);
    const { error: uploadError } = await bucket.upload(path, bytes, { contentType: format.contentType, cacheControl: '300', upsert: false });
    if (uploadError) throw uploadError;
    // Sign before inserting so an unavailable preview never leaves an invisible occupied slot.
    const { data: signed, error: signedError } = await bucket.createSignedUrl(path, SIGNED_URL_SECONDS);
    if (signedError || !signed?.signedUrl) {
      const { error: cleanupError } = await bucket.remove([path]);
      if (cleanupError) console.error('Video upload failed; storage cleanup failed:', cleanupError.message);
      throw new HttpError(503, 'The video could not be prepared. Please try again.');
    }
    const { data: video, error: insertError } = await client.from('project_videos').insert({ id, project_id: projectId, path, caption: '', sort_order: count || 0 }).select('id, path, caption, sort_order').single();
    if (insertError) {
      const { error: cleanupError } = await bucket.remove([path]);
      if (cleanupError) console.error('Video upload failed; storage cleanup failed:', cleanupError.message);
      if (insertError.message.includes('A project can contain up to 2 videos.') || insertError.message.includes('project_videos_project_slot_key')) throw new HttpError(409, 'A project can contain up to 2 videos. Save any removals before uploading another.');
      throw insertError;
    }
    return json({ video: { ...video, url: signed.signedUrl } }, 201);
  } catch (error) { return errorResponse(error); }
}

// Only small JSON requests pass through the app. Video bytes go directly to the
// private bucket, then are validated here before pending metadata is attached.
export async function PATCH(request: Request) {
  try {
    assertSameOrigin(request);
    const { client } = await requireAdmin();
    const input = completionSchema.parse(await readJson(request));
    const extension = VIDEO_EXTENSIONS[input.contentType];
    const path = `${input.projectId}/${input.id}.${extension}`;
    const { data: existing, error: existingError } = await client.from('project_videos').select('id, path, caption, sort_order').eq('id', input.id).eq('project_id', input.projectId).maybeSingle();
    if (existingError && isMissingProjectVideos(existingError)) throw new HttpError(503, VIDEO_SETUP_MESSAGE);
    if (existingError) throw existingError;
    if (existing) {
      if (existing.path !== path) throw new HttpError(400, 'The uploaded video does not match this project.');
      return json({ video: await videoPreview(client, existing) });
    }
    const bucket = client.storage.from(PROJECT_VIDEO_BUCKET);
    try {
      const count = await assertVideoSlot(client, input.projectId);
      const { data: file, error: downloadError } = await bucket.download(path);
      if (downloadError || !file) {
        console.error('Video download for validation failed:', downloadError?.message || 'No file returned');
        throw new HttpError(400, 'The video upload has not finished. Please try again.');
      }
      if (file.size > MAX_VIDEO_UPLOAD_BYTES) throw new HttpError(413, 'Choose a video no larger than 50 MB.');
      let format: ReturnType<typeof validateProjectVideo>;
      try { format = validateProjectVideo(Buffer.from(await file.arrayBuffer()), file.type); } catch (error) { throw new HttpError(400, (error as Error).message); }
      if (format.contentType !== input.contentType) throw new HttpError(400, 'The uploaded video format does not match its file type.');
      const preview = await videoPreview(client, { id: input.id, path, caption: '', sort_order: count });
      const { data: video, error: insertError } = await client.from('project_videos').insert({ id: input.id, project_id: input.projectId, path, caption: '', sort_order: count }).select('id, path, caption, sort_order').single();
      if (insertError) throw insertError;
      return json({ video: { ...video, url: preview.url } }, 201);
    } catch (error) {
      // A retried completion can race the original request. Never remove an
      // object if the other request has already attached it to the project.
      const { data: attached, error: lookupError } = await client.from('project_videos').select('id, path, caption, sort_order').eq('id', input.id).eq('project_id', input.projectId).maybeSingle();
      if (attached?.path === path) return json({ video: await videoPreview(client, attached) });
      if (!lookupError) {
        const { error: cleanupError } = await bucket.remove([path]);
        if (cleanupError) console.error('Video upload failed; storage cleanup failed:', cleanupError.message);
      }
      if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' && (error.message.includes('A project can contain up to 2 videos.') || error.message.includes('project_videos_project_slot_key'))) throw new HttpError(409, limitMessage);
      throw error;
    }
  } catch (error) { return errorResponse(error); }
}
