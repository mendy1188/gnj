/* eslint-disable @next/next/no-img-element -- Uploads are already resized; the public route checks publication on every request. */
import Link from 'next/link';
import type { Project } from '@/lib/types';

export function ProjectCards({ projects }: { projects: Project[] }) {
  return <div className="project-grid">{projects.map(project => {
    const image = project.images.find(photo => photo.id === project.cover_image_id) || project.images[0];
    return <article key={project.id} className="project-card"><Link href={`/projects/${project.slug}`}>
      <div className="project-cover">{image && <img src={image.url} alt={image.alt || `${project.title} — ${project.category}`} width={400} height={460} loading="lazy" decoding="async" />}</div>
      <p className="project-category">{project.category}</p><h3>{project.title}</h3>
    </Link><p className="project-summary">{project.description}</p>{project.location && <p>{project.location}</p>}</article>;
  })}</div>;
}
