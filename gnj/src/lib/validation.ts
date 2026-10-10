import { z } from 'zod';
import { categories } from './types';
import { MAX_PROJECT_VIDEOS } from './videos';

const boundedText = (max: number) => z.string().trim().max(max);
export const imageSchema = z.object({
  id: z.uuid(),
  path: boundedText(400),
  alt: boundedText(240).default(''),
  caption: boundedText(500).default(''),
  sort_order: z.number().int().min(0).max(10000),
});
export const videoSchema = z.object({
  id: z.uuid(),
  path: boundedText(400).min(1),
  caption: boundedText(500).default(''),
  sort_order: z.number().int().min(0).max(10000),
});
export const comparisonSchema = z.object({
  id: z.uuid(), before_id: z.uuid(), after_id: z.uuid(),
  label: boundedText(160).default(''), aligned: z.boolean().default(false),
}).refine((pair) => pair.before_id !== pair.after_id, { message: 'Choose two different photographs for a comparison.' });

export const projectSchema = z.object({
  title: boundedText(140).min(2, 'Please enter a project title of at least two characters.'),
  category: z.enum(categories),
  description: boundedText(6000),
  location: boundedText(160),
  published: z.boolean(), featured: z.boolean(),
  sort_order: z.number().int().min(0).max(10000),
  cover_image_id: z.uuid().nullable(),
  images: z.array(imageSchema).max(60, 'A project can contain up to 60 photographs.'),
  videos: z.array(videoSchema).max(MAX_PROJECT_VIDEOS, 'A project can contain up to two videos.').default([]),
  comparisons: z.array(comparisonSchema).max(20),
});
// A partial update must not clear saved videos when this field is omitted.
export const projectPatchSchema = projectSchema.partial().extend({ videos: projectSchema.shape.videos.unwrap().optional() });
export const projectCreateSchema = projectSchema.partial().extend({ title: projectSchema.shape.title, category: projectSchema.shape.category });

export function validateProjectRelations(project: z.infer<typeof projectSchema>) {
  const ids = new Set(project.images.map((image) => image.id));
  if (ids.size !== project.images.length) throw new Error('Each photograph must appear only once.');
  if (new Set(project.videos.map((video) => video.id)).size !== project.videos.length || new Set(project.videos.map((video) => video.path)).size !== project.videos.length) throw new Error('Each video must appear only once.');
  if (new Set(project.comparisons.map((pair) => pair.id)).size !== project.comparisons.length) throw new Error('Each comparison must appear only once.');
  if (project.cover_image_id && !ids.has(project.cover_image_id)) throw new Error('Choose a cover photograph from this project.');
  if (project.comparisons.some((pair) => !ids.has(pair.before_id) || !ids.has(pair.after_id))) throw new Error('Both comparison photographs must belong to this project.');
  if (project.published) {
    if (!project.description) throw new Error('Add a description before publishing.');
    if (!project.images.length) throw new Error('Upload at least one photograph before publishing.');
    if (!project.cover_image_id) throw new Error('Choose a cover photograph before publishing.');
    if (project.images.some((image) => !image.alt)) throw new Error('Add descriptive alternative text to each photograph before publishing.');
  }
}

export const enquirySchema = z.object({
  name: boundedText(100).min(2, 'Please enter your name.'),
  email: boundedText(254).default('').refine((value) => value === '' || z.email().safeParse(value).success, 'Please enter a valid email address.'),
  phone: boundedText(40).default('').refine((value) => value === '' || (/^[+\d\s().-]+$/.test(value) && value.replace(/\D/g, '').length >= 7), 'Please enter a valid phone number.'),
  service: z.enum([...categories, 'Not sure yet'], { error: 'Please choose a service.' }),
  message: boundedText(5000).min(10, 'Please tell us a little more about your project (at least 10 characters).'),
  website: boundedText(300).default(''),
  startedAt: z.number().finite(),
}).refine((data) => Boolean(data.email || data.phone), { message: 'Please provide an email address or phone number.', path: ['email'] });

export function validateEnquiryTiming(startedAt: number, now = Date.now()): boolean {
  const elapsed = now - startedAt;
  return elapsed >= 1500 && elapsed <= 24 * 60 * 60 * 1000;
}

export function slugify(title: string) {
  return title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90) || 'project';
}
