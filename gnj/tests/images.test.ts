import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { MAX_UPLOAD_BYTES, optimiseProjectImage } from '../src/lib/server/images';

test('uploaded photographs become orientation-safe, compact WebP images without EXIF', async () => {
  const input = await sharp({ create: { width: 2300, height: 1500, channels: 3, background: '#78834b' } }).jpeg().withMetadata().toBuffer();
  const result = await optimiseProjectImage(input);
  const metadata = await sharp(result).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 1920);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.icc, undefined);
});

test('server checks actual bytes rather than trusting a filename or MIME type', async () => {
  await assert.rejects(() => optimiseProjectImage(Buffer.from('This is not really a photograph')), /could not be read/);
  await assert.rejects(() => optimiseProjectImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>')), /JPEG, PNG or WebP/);
  await assert.rejects(() => optimiseProjectImage(Buffer.alloc(MAX_UPLOAD_BYTES + 1)), /10 MB/);
});
