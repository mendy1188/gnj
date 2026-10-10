export const VIDEO_SETUP_MESSAGE = 'Video uploads are not available yet. Complete the video database setup and try again.';

export function isMissingProjectVideos(error: { code?: string; message?: string }) {
  return (error.code === 'PGRST205' || error.code === '42P01')
    && /\b(?:public\.)?project_videos\b/.test(error.message || '');
}
