export const MAX_PROJECT_VIDEOS = 2;
export const MAX_VIDEO_UPLOAD_BYTES = 50 * 1024 * 1024;
export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;
export type VideoContentType = typeof ALLOWED_VIDEO_TYPES[number];
export const VIDEO_EXTENSIONS = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' } as const;

export function getVideoContentType(file: { name: string; type: string }): VideoContentType | null {
  const knownType = ALLOWED_VIDEO_TYPES.find(type => type === file.type);
  if (knownType) return knownType;
  // Some browsers provide no MIME type for MOV files. The server still checks
  // the container bytes before attaching an upload to a project.
  if (!file.type || file.type === 'application/octet-stream') {
    const extension = file.name.split('.').pop()?.toLowerCase();
    return ALLOWED_VIDEO_TYPES.find(type => VIDEO_EXTENSIONS[type] === extension) || null;
  }
  return null;
}
