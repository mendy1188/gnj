import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireAdmin } from '@/lib/server/auth';
import { assertSameOrigin, errorResponse, HttpError, json } from '@/lib/server/http';
import { validateProjectVideo } from '@/lib/server/videos';
import { MAX_PROJECT_VIDEOS, MAX_VIDEO_UPLOAD_BYTES, ALLOWED_VIDEO_TYPES } from '@/lib/videos';
import { PROJECT_VIDEO_BUCKET, SIGNED_URL_SECONDS } from '@/lib/supabase/config';
import { isMissingProjectVideos, VIDEO_SETUP_MESSAGE } from '@/lib/server/video-schema';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const { client } = await requireAdmin();
    if (Number(request.headers.get('content-length') || 0) > MAX_VIDEO_UPLOAD_BYTES + 65_536) throw new HttpError(413, 'Choose a video no larger than 50 MB.');
    const form = await request.formData();
    const projectId = z.uuid().parse(form.get('projectId'));
    const file = form.get('file');
    if (!(file instanceof File)) throw new HttpError(400, 'Choose a video to upload.');
    if (file.size > MAX_VIDEO_UPLOAD_BYTES) throw new HttpError(413, 'Choose a video no larger than 50 MB.');
    if (file.type && !ALLOWED_VIDEO_TYPES.some((type) => type === file.type)) throw new HttpError(415, 'Choose an MP4 or WebM video.');
    const { data: project, error: projectError } = await client.from('projects').select('id').eq('id', projectId).maybeSingle();
    if (projectError) throw projectError;
    if (!project) throw new HttpError(404, 'Save this project before uploading videos.');
    const { count, error: countError } = await client.from('project_videos').select('id', { count: 'exact' }).eq('project_id', projectId);
    if (countError && isMissingProjectVideos(countError)) throw new HttpError(503, VIDEO_SETUP_MESSAGE);
    if (countError) throw countError;
    if ((count || 0) >= MAX_PROJECT_VIDEOS) throw new HttpError(400, 'A project can contain up to 2 videos. Save any removals before uploading another.');
    const bytes = Buffer.from(await file.arrayBuffer());
    let format: ReturnType<typeof validateProjectVideo>;
    try { format = validateProjectVideo(bytes, file.type); } catch (error) { throw new HttpError(400, (error as Error).message); }
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
