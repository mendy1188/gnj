import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { enquirySchema, projectPatchSchema, projectSchema, slugify, validateEnquiryTiming, validateProjectRelations } from '../src/lib/validation';

const enquiry = { name: 'Alex Smith', email: 'alex@example.com', phone: '', service: 'Flooring', message: 'Please help replace the kitchen floor.', website: '', startedAt: Date.now() - 5000 };

test('an enquiry requires a real contact method and accepts phone-only requests', () => {
  assert.equal(enquirySchema.safeParse(enquiry).success, true);
  assert.equal(enquirySchema.safeParse({ ...enquiry, email: '', phone: '+44 7878 079245' }).success, true);
  assert.equal(enquirySchema.safeParse({ ...enquiry, email: '', phone: '' }).success, false);
  assert.equal(enquirySchema.safeParse({ ...enquiry, email: 'invalid' }).success, false);
  assert.equal(enquirySchema.safeParse({ ...enquiry, email: '', phone: '123' }).success, false);
});

test('enquiries validate service, meaningful description and text limits', () => {
  assert.equal(enquirySchema.safeParse({ ...enquiry, service: 'Not sure yet' }).success, true);
  assert.equal(enquirySchema.safeParse({ ...enquiry, service: 'Unlisted specialist service' }).success, false);
  assert.equal(enquirySchema.safeParse({ ...enquiry, message: 'short' }).success, false);
  assert.equal(enquirySchema.safeParse({ ...enquiry, name: 'a'.repeat(101) }).success, false);
  assert.equal(enquirySchema.parse({ ...enquiry, name: '  Alex Smith  ' }).name, 'Alex Smith');
});

test('submission timing rejects automated, stale and future timestamps', () => {
  const now = 100_000_000;
  assert.equal(validateEnquiryTiming(now - 1500, now), true);
  assert.equal(validateEnquiryTiming(now, now), false);
  assert.equal(validateEnquiryTiming(now + 1, now), false);
  assert.equal(validateEnquiryTiming(now - 86_400_001, now), false);
});

function draft() {
  const id = randomUUID();
  return projectSchema.parse({ title: 'A new garden', category: 'Garden & Outdoor Improvements', description: '', location: '', published: false, featured: false, sort_order: 0, cover_image_id: null, images: [{ id, path: `${randomUUID()}/${id}.webp`, alt: '', caption: '', sort_order: 0 }], comparisons: [] });
}

test('drafts can be incomplete, while publication requires content and accessible photographs', () => {
  const project = draft();
  assert.doesNotThrow(() => validateProjectRelations(project));
  assert.throws(() => validateProjectRelations({ ...project, published: true }), /description/);
  project.published = true; project.description = 'A considered garden improvement.';
  assert.throws(() => validateProjectRelations(project), /cover/);
  project.cover_image_id = project.images[0].id;
  assert.throws(() => validateProjectRelations(project), /alternative text/);
  project.images[0].alt = 'Green turf beside a pale gravel garden border';
  assert.doesNotThrow(() => validateProjectRelations(project));
});

test('a comparison and cover cannot reference photographs outside their project', () => {
  const project = draft();
  assert.throws(() => validateProjectRelations({ ...project, cover_image_id: randomUUID() }), /cover photograph/);
  project.comparisons = [{ id: randomUUID(), before_id: project.images[0].id, after_id: randomUUID(), aligned: false, label: '' }];
  assert.throws(() => validateProjectRelations(project), /belong/);
  assert.equal(projectSchema.safeParse({ ...project, comparisons: [{ ...project.comparisons[0], after_id: project.images[0].id }] }).success, false);
});

test('duplicate gallery references are rejected and slugs remain safe', () => {
  const project = draft();
  project.images.push(project.images[0]);
  assert.throws(() => validateProjectRelations(project), /only once/);
  assert.equal(slugify('  A garden & patio / update!  '), 'a-garden-patio-update');
  assert.equal(slugify('🌿'), 'project');
});

function video(sort_order = 0) {
  const id = randomUUID();
  return { id, path: `${randomUUID()}/${id}.mp4`, caption: '', sort_order };
}

test('projects accept up to two videos and default older inputs to an empty list', () => {
  const project = draft();
  assert.deepEqual(project.videos, []);
  assert.equal(projectSchema.safeParse({ ...project, videos: [video()] }).success, true);
  assert.equal(projectSchema.safeParse({ ...project, videos: [video(), video(1)] }).success, true);
  const tooMany = projectSchema.safeParse({ ...project, videos: [video(), video(1), video(2)] });
  assert.equal(tooMany.success, false);
  if (!tooMany.success) assert.match(tooMany.error.issues[0].message, /two videos/);
});

test('partial project updates preserve existing videos unless explicitly changed', () => {
  assert.deepEqual(projectPatchSchema.parse({ title: 'Updated' }), { title: 'Updated' });
  assert.deepEqual(projectPatchSchema.parse({ videos: [] }), { videos: [] });
  assert.equal(projectPatchSchema.safeParse({ videos: [video(), video(1), video(2)] }).success, false);
});

test('video metadata validates captions, paths and ordering', () => {
  const project = draft();
  const uploaded = video();
  const parsed = projectSchema.parse({ ...project, videos: [{ ...uploaded, caption: '  A finished garden  ', url: 'https://example.com/untrusted.mp4' }] });
  assert.equal(parsed.videos[0].caption, 'A finished garden');
  assert.equal('url' in parsed.videos[0], false);
  assert.equal(projectSchema.safeParse({ ...project, videos: [{ ...uploaded, caption: 'a'.repeat(501) }] }).success, false);
  assert.equal(projectSchema.safeParse({ ...project, videos: [{ ...uploaded, path: '' }] }).success, false);
  assert.equal(projectSchema.safeParse({ ...project, videos: [{ ...uploaded, sort_order: -1 }] }).success, false);
});

test('a project cannot attach the same video ID or storage path twice', () => {
  const project = draft();
  const uploaded = video();
  assert.throws(() => validateProjectRelations({ ...project, videos: [uploaded, { ...video(1), id: uploaded.id }] }), /Each video must appear only once/);
  assert.throws(() => validateProjectRelations({ ...project, videos: [uploaded, { ...video(1), path: uploaded.path }] }), /Each video must appear only once/);
  assert.doesNotThrow(() => validateProjectRelations({ ...project, videos: [uploaded, video(1)] }));
});
