import sharp from 'sharp';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function optimiseProjectImage(bytes: Buffer) {
  if (!bytes.length || bytes.length > MAX_UPLOAD_BYTES) throw new Error('Choose a photograph smaller than 10 MB.');
  const pipeline = sharp(bytes, { limitInputPixels: 40_000_000, failOn: 'error', animated: false });
  let metadata;
  try { metadata = await pipeline.metadata(); } catch { throw new Error('This photograph could not be read. Choose a valid JPEG, PNG or WebP image.'); }
  if (!metadata.format || !['jpeg', 'png', 'webp'].includes(metadata.format)) throw new Error('Choose a JPEG, PNG or WebP photograph. Convert HEIC photographs to JPEG first.');
  if ((metadata.pages || 1) > 1) throw new Error('Choose a still photograph, rather than an animated image.');
  if (!metadata.width || !metadata.height || metadata.width * metadata.height > 40_000_000) throw new Error('Choose a photograph with fewer than 40 million pixels.');
  try {
    // rotate() applies phone orientation; output strips EXIF (including GPS) by default.
    return await pipeline.rotate().resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
  } catch { throw new Error('This photograph could not be processed. Please try another image.'); }
}
