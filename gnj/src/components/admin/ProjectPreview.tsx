'use client';

/* eslint-disable @next/next/no-img-element -- Private draft photographs use signed URLs and are already optimised on upload. */

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { Project, ProjectImage } from '@/lib/types';

function PreviewComparison({ before, after, aligned, label }: { before: ProjectImage; after: ProjectImage; aligned: boolean; label: string }) {
  const [slider, setSlider] = useState(aligned);
  const [position, setPosition] = useState(50);
  return <div className="admin-preview-comparison"><div className="admin-comparison-heading"><h3>{label || 'Before & after'}</h3>{aligned && <div className="admin-view-toggle"><button onClick={() => setSlider(true)} aria-pressed={slider}>Slider</button><button onClick={() => setSlider(false)} aria-pressed={!slider}>Full photographs</button></div>}</div>{slider ? <><div className="admin-comparison-slider"><img src={after.url} alt={`After: ${after.alt}`} /><img src={before.url} alt={`Before: ${before.alt}`} style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }} /><span className="admin-comparison-label before">Before</span><span className="admin-comparison-label after">After</span><span className="admin-comparison-line" style={{ left: `${position}%` }} /></div><label className="admin-slider-control">Reveal the transformation<input type="range" min={0} max={100} value={position} onChange={event => setPosition(Number(event.target.value))} aria-label={`Before and after comparison${label ? `: ${label}` : ''}`} aria-valuetext={`${position}% before, ${100 - position}% after`} /><small>Drag the control or use the left and right arrow keys.</small></label></> : <div className="admin-comparison-full"><figure><figcaption>Before</figcaption><img src={before.url} alt={before.alt} /></figure><figure><figcaption>After</figcaption><img src={after.url} alt={after.alt} /></figure></div>}</div>;
}

export function ProjectPreview({ project, onClose }: { project: Project; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { element?.close(); document.body.style.overflow = originalOverflow; };
  }, []);
  const cover = project.images.find(image => image.id === project.cover_image_id) ?? project.images[0];
  return <dialog ref={dialog} className="admin-preview-dialog" onCancel={onClose} aria-labelledby="admin-preview-title"><div className="admin-preview-toolbar"><span>Private preview · includes unsaved changes</span><button className="admin-icon-button" onClick={onClose} aria-label="Close project preview"><X size={20} /></button></div><div className="admin-preview-content"><p className="admin-eyebrow">{project.category}{project.location ? ` · ${project.location}` : ''}</p><h1 id="admin-preview-title">{project.title || 'Your project title'}</h1><p className="admin-preview-description">{project.description || 'Your project description will appear here.'}</p>{cover ? <img className="admin-preview-cover" src={cover.url} alt={cover.alt || 'Project cover photograph'} /> : <div className="admin-empty">Your cover photograph will appear here.</div>}{project.comparisons.map(pair => {
    const before = project.images.find(image => image.id === pair.before_id);
    const after = project.images.find(image => image.id === pair.after_id);
    return before && after ? <PreviewComparison key={pair.id} before={before} after={after} aligned={pair.aligned} label={pair.label} /> : null;
  })}{project.images.length > 0 && <><h2>A closer look</h2><div className="admin-preview-gallery">{project.images.map(image => <figure key={image.id}><img src={image.url} alt={image.alt || 'Project photograph'} loading="lazy" />{image.caption && <figcaption>{image.caption}</figcaption>}</figure>)}</div></>}{project.videos.length > 0 && <section className="admin-preview-videos" aria-labelledby="admin-preview-videos-title"><h2 id="admin-preview-videos-title">Our work in motion.</h2><div className="admin-preview-video-grid">{project.videos.map((video, index) => <figure key={video.id}><video src={video.url} controls playsInline preload="metadata" aria-label={video.caption || `Project video ${index + 1}`}>Your browser does not support embedded videos.</video>{video.caption && <figcaption>{video.caption}</figcaption>}</figure>)}</div></section>}</div></dialog>;
}
