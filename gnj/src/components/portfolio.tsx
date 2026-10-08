'use client';
/* eslint-disable @next/next/no-img-element */
import { useState } from 'react';
import Link from 'next/link';
import { ArrowDown, ArrowUpRight, Sprout } from 'lucide-react';
import { categories, type Project } from '@/lib/types';

const shortLabels = ['Gardens & Outdoors', 'Flooring', 'Bathrooms', 'Plumbing'];
export function Portfolio({ projects, unavailable = false }: { projects: Project[]; unavailable?: boolean }) {
  const [filter, setFilter] = useState('All projects');
  const [expanded, setExpanded] = useState(false);
  const filtered = projects
    .filter(p => filter === 'All projects' || p.category === filter)
    .sort((a, b) => Number(b.featured) - Number(a.featured));
  const visible = expanded ? filtered : filtered.slice(0, 3);
  return <><div className="portfolio-filters" role="group" aria-label="Filter projects by service"><button type="button" aria-pressed={filter === 'All projects'} onClick={() => { setFilter('All projects'); setExpanded(false); }}>All projects</button>{categories.map((c, i) => <button type="button" key={c} aria-pressed={filter === c} onClick={() => { setFilter(c); setExpanded(false); }}>{shortLabels[i]}</button>)}</div><div aria-live="polite" aria-atomic="true" className="sr-only">{filtered.length} {filtered.length === 1 ? 'project' : 'projects'}{filter !== 'All projects' ? ` in ${filter}` : ''}</div>
    {visible.length ? <div className="project-grid">{visible.map((project, i) => { const cover = project.images.find(im => im.id === project.cover_image_id) || project.images[0]; return <Link href={`/projects/${project.slug}`} className="project-card" key={project.id}><div className="project-cover">{cover ? <img src={cover.url} alt={cover.alt || project.title} loading="lazy" width="400" height="460" /> : <div className="project-no-image"><Sprout size={40}/><span>Project details</span></div>}<span className="project-number">0{i + 1}</span><span className="project-open" aria-hidden="true"><ArrowUpRight size={21}/></span></div><p className="project-category">{project.category}</p><h3>{project.title}</h3><p className="project-summary">{project.description}</p></Link>; })}</div> : <div className="portfolio-empty"><Sprout size={34}/><h3>{unavailable ? 'Our gallery will be back soon.' : 'Your next project could be here.'}</h3><p>{unavailable ? 'You can still get in touch to discuss your plans and ask about our work.' : 'We’re gathering more photographs of our work. Get in touch to discuss what you have in mind.'}</p><a href="#contact" className="text-link">Let’s talk about your project <ArrowUpRight size={17}/></a></div>}
    {!expanded && filtered.length > 3 && <div className="portfolio-more"><button className="button button-outline" onClick={() => setExpanded(true)}>View all {filtered.length} projects <ArrowDown size={16}/></button></div>}
  </>;
}
