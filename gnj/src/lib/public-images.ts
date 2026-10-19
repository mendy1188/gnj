import type { ProjectImage } from './types';

export function imageFileName(title: string, image: Pick<ProjectImage, 'alt' | 'caption'>) {
  const label = image.alt.trim() || image.caption.trim() || title;
  const stem = label.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90).replace(/-$/, '');
  return `${stem || 'project-photograph'}.webp`;
}

export function publicImageUrl(project: { id: string; title: string }, image: Pick<ProjectImage, 'id' | 'path' | 'alt' | 'caption'>) {
  if (image.path.startsWith('/images/')) return image.path;
  return `/project-images/${encodeURIComponent(project.id)}/${encodeURIComponent(image.id)}/${imageFileName(project.title, image)}`;
}
