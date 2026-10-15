import { ALLOWED_VIDEO_TYPES, MAX_VIDEO_UPLOAD_BYTES, type VideoContentType } from '../videos';

type VideoFormat = { contentType: VideoContentType; extension: 'mp4' | 'webm' | 'mov' };

const mp4Brands = new Set(['isom', 'iso2', 'iso3', 'iso4', 'iso5', 'iso6', 'iso7', 'iso8', 'iso9', 'mp41', 'mp42', 'avc1', 'dash', 'M4V ', 'M4VH', 'M4VP']);

function readAtom(bytes: Buffer, offset: number) {
  if (offset + 8 > bytes.length) return null;
  let size = bytes.readUInt32BE(offset);
  let headerSize = 8;
  if (size === 1) {
    if (offset + 16 > bytes.length || bytes.readUInt32BE(offset + 8) !== 0) return null;
    size = bytes.readUInt32BE(offset + 12);
    headerSize = 16;
  }
  if (size === 0) size = bytes.length - offset;
  if (size < headerSize || size > bytes.length - offset) return null;
  return { type: bytes.toString('latin1', offset + 4, offset + 8), start: offset + headerSize, end: offset + size };
}

function fileTypeBrand(bytes: Buffer, offset = 0) {
  const atom = readAtom(bytes, offset);
  if (!atom || atom.type !== 'ftyp' || atom.end - atom.start < 8 || (atom.end - atom.start) % 4 !== 0) return null;
  return bytes.toString('latin1', atom.start, atom.start + 4);
}

function hasQuickTimeHeader(bytes: Buffer) {
  let offset = 0;
  let movie = false;
  let media = false;
  while (offset < bytes.length) {
    const atom = readAtom(bytes, offset);
    if (!atom) return false;
    if (atom.type === 'ftyp') return fileTypeBrand(bytes, offset) === 'qt  ';
    // Older QuickTime files have no ftyp atom. Require complete top-level atoms
    // containing both movie metadata and media, rather than a stray signature.
    if (atom.type === 'moov' && atom.end > atom.start) movie = true;
    if (atom.type === 'mdat' && atom.end > atom.start) media = true;
    offset = atom.end;
  }
  return movie && media;
}

function readEbmlNumber(bytes: Buffer, offset: number, limit: number, isId = false) {
  if (offset >= limit) return null;
  let marker = 0x80;
  let length = 1;
  while (marker && !(bytes[offset] & marker)) { marker >>= 1; length++; }
  if (!marker || length > (isId ? 4 : 8) || offset + length > limit) return null;
  let value = isId ? bytes[offset] : bytes[offset] & (marker - 1);
  for (let index = 1; index < length; index++) value = value * 256 + bytes[offset + index];
  // Unknown-length elements are not valid in the EBML header.
  if (!Number.isSafeInteger(value) || (!isId && value === 2 ** (7 * length) - 1)) return null;
  return { value, length };
}

function hasWebmHeader(bytes: Buffer) {
  if (bytes.length < 5 || bytes.readUInt32BE(0) !== 0x1a45dfa3) return false;
  const size = readEbmlNumber(bytes, 4, bytes.length);
  if (!size) return false;
  let offset = 4 + size.length;
  const end = offset + size.value;
  if (end > bytes.length) return false;
  let foundDocType = false;
  while (offset < end) {
    const id = readEbmlNumber(bytes, offset, end, true);
    if (!id) return false;
    offset += id.length;
    const elementSize = readEbmlNumber(bytes, offset, end);
    if (!elementSize) return false;
    offset += elementSize.length;
    const elementEnd = offset + elementSize.value;
    if (elementEnd > end) return false;
    if (id.value === 0x4282) {
      if (foundDocType || elementSize.value !== 4 || bytes.toString('latin1', offset, elementEnd) !== 'webm') return false;
      foundDocType = true;
    }
    offset = elementEnd;
  }
  return foundDocType;
}

export function validateProjectVideo(bytes: Buffer, declaredType: string): VideoFormat {
  if (!bytes.length || bytes.length > MAX_VIDEO_UPLOAD_BYTES) throw new Error('Choose a video no larger than 50 MB.');
  if (!ALLOWED_VIDEO_TYPES.some(type => type === declaredType)) throw new Error('Choose an MP4, WebM or MOV video.');
  // Inspect container headers instead of trusting the upload MIME type. This
  // does not decode the media or guarantee that every browser supports its codec.
  const format: VideoFormat | null = mp4Brands.has(fileTypeBrand(bytes) || '')
    ? { contentType: 'video/mp4', extension: 'mp4' }
    : hasWebmHeader(bytes) ? { contentType: 'video/webm', extension: 'webm' }
      : hasQuickTimeHeader(bytes) ? { contentType: 'video/quicktime', extension: 'mov' } : null;
  if (!format) throw new Error('This video could not be read. Choose a valid MP4, WebM or MOV video.');
  if (format.contentType !== declaredType) throw new Error('The video format does not match its file type. Choose an MP4, WebM or MOV video.');
  return format;
}
