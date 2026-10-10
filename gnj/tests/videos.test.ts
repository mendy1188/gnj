import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_VIDEO_UPLOAD_BYTES } from '../src/lib/videos';
import { validateProjectVideo } from '../src/lib/server/videos';

function mp4(brand = 'isom') {
  const bytes = Buffer.alloc(24);
  bytes.writeUInt32BE(bytes.length, 0);
  bytes.write('ftyp', 4);
  bytes.write(brand, 8);
  bytes.write('isommp42', 16);
  return bytes;
}

function webm(docType = 'webm') {
  const header = Buffer.concat([Buffer.from([0x42, 0x86, 0x81, 0x01, 0x42, 0x82, 0x80 | docType.length]), Buffer.from(docType)]);
  return Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x80 | header.length]), header]);
}

test('video validation identifies MP4 and WebM container headers', () => {
  assert.deepEqual(validateProjectVideo(mp4(), 'video/mp4'), { contentType: 'video/mp4', extension: 'mp4' });
  assert.deepEqual(validateProjectVideo(mp4('mp42'), 'video/mp4'), { contentType: 'video/mp4', extension: 'mp4' });
  assert.deepEqual(validateProjectVideo(webm(), 'video/webm'), { contentType: 'video/webm', extension: 'webm' });
});

test('container signatures support extended MP4 sizes and multi-byte EBML sizes', () => {
  const extendedMp4 = Buffer.alloc(32);
  extendedMp4.writeUInt32BE(1);
  extendedMp4.write('ftyp', 4);
  extendedMp4.writeUInt32BE(extendedMp4.length, 12);
  mp4().copy(extendedMp4, 16, 8);
  assert.equal(validateProjectVideo(extendedMp4, 'video/mp4').extension, 'mp4');
  const header = webm();
  const multiByteSize = Buffer.concat([header.subarray(0, 4), Buffer.from([0x40, header[4] & 0x7f]), header.subarray(5)]);
  assert.equal(validateProjectVideo(multiByteSize, 'video/webm').extension, 'webm');
});

test('video uploads reject unrelated bytes, containers and mismatched MIME types', () => {
  assert.throws(() => validateProjectVideo(Buffer.from('<html>not a video</html>'), 'video/mp4'), /valid MP4 or WebM/);
  assert.throws(() => validateProjectVideo(mp4('heic'), 'video/mp4'), /valid MP4 or WebM/);
  assert.throws(() => validateProjectVideo(mp4('qt  '), 'video/mp4'), /valid MP4 or WebM/);
  assert.throws(() => validateProjectVideo(webm('matroska'), 'video/webm'), /valid MP4 or WebM/);
  assert.throws(() => validateProjectVideo(mp4(), 'application/octet-stream'), /Choose an MP4 or WebM/);
  assert.throws(() => validateProjectVideo(mp4(), 'video/webm'), /does not match/);
  assert.throws(() => validateProjectVideo(webm(), 'video/mp4'), /does not match/);
});

test('container checks reject truncated and malformed headers', () => {
  assert.throws(() => validateProjectVideo(mp4().subarray(0, 20), 'video/mp4'), /could not be read/);
  const invalidSize = mp4();
  invalidSize.writeUInt32BE(10, 0);
  assert.throws(() => validateProjectVideo(invalidSize, 'video/mp4'), /could not be read/);
  assert.throws(() => validateProjectVideo(webm().subarray(0, -1), 'video/webm'), /could not be read/);
  const unknownHeaderSize = webm();
  unknownHeaderSize[4] = 0xff;
  assert.throws(() => validateProjectVideo(unknownHeaderSize, 'video/webm'), /could not be read/);
  const fakeDocType = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x84, 0x77, 0x65, 0x62, 0x6d]);
  assert.throws(() => validateProjectVideo(fakeDocType, 'video/webm'), /could not be read/);
  const spoofedBrand = mp4();
  spoofedBrand[8] |= 0x80;
  assert.throws(() => validateProjectVideo(spoofedBrand, 'video/mp4'), /could not be read/);
  const spoofedDocType = webm();
  spoofedDocType[spoofedDocType.length - 1] |= 0x80;
  assert.throws(() => validateProjectVideo(spoofedDocType, 'video/webm'), /could not be read/);
});

test('videos must be nonempty and no larger than 50 MB', () => {
  assert.throws(() => validateProjectVideo(Buffer.alloc(0), 'video/mp4'), /50 MB/);
  const maxSizeVideo = Buffer.alloc(MAX_VIDEO_UPLOAD_BYTES);
  mp4().copy(maxSizeVideo);
  assert.doesNotThrow(() => validateProjectVideo(maxSizeVideo, 'video/mp4'));
  assert.throws(() => validateProjectVideo(Buffer.alloc(MAX_VIDEO_UPLOAD_BYTES + 1), 'video/mp4'), /50 MB/);
});
