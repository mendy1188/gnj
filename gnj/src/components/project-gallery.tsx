/* eslint-disable @next/next/no-img-element -- Project image URLs are optimised by the upload service. */
'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Expand, X } from 'lucide-react';
import type { ProjectImage } from '@/lib/types';
import './gallery.css';

export function ProjectGallery({ images, projectTitle = 'Completed project' }: { images: ProjectImage[]; projectTitle?: string }) {
  const photographs = images.filter((image) => Boolean(image.url)).sort((a, b) => a.sort_order - b.sort_order);
  const dialog = useRef<HTMLDialogElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const visibleIndex = photographs.length ? currentIndex % photographs.length : 0;
  const currentImage = photographs[visibleIndex];

  useEffect(() => {
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isOpen]);

  if (!photographs.length) return null;

  function move(direction: number) {
    setCurrentIndex((index) => (index + direction + photographs.length) % photographs.length);
  }

  function open(index: number) {
    setCurrentIndex(index);
    dialog.current?.showModal();
    setIsOpen(true);
  }

  return (
    <div className="gal-gallery">
      <div className="gal-grid">
        {photographs.map((image, index) => (
          <figure className="gal-item" key={image.id}>
            <button className="gal-open" type="button" onClick={() => open(index)} aria-label={`Enlarge photograph ${index + 1}: ${image.alt || image.caption || 'Project photograph'}`} aria-haspopup="dialog">
              <img src={image.url} alt={image.alt || image.caption || `${projectTitle} — photograph ${index + 1}`} loading={index === 0 ? "eager" : "lazy"} fetchPriority={index === 0 ? "high" : "auto"} decoding="async" />
              <span className="gal-expand" aria-hidden="true"><Expand size={19} strokeWidth={1.5} /></span>
            </button>
            {image.caption && <figcaption className="gal-caption">{image.caption}</figcaption>}
          </figure>
        ))}
      </div>

      <dialog
        ref={dialog}
        className="gal-dialog"
        aria-label="Project photograph viewer"
        onClose={() => setIsOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
        onKeyDown={(event) => {
          if (event.altKey || event.ctrlKey || event.metaKey) return;
          if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
          if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
        }}
      >
        <div className="gal-viewer">
          <div className="gal-toolbar">
            <p className="gal-counter" aria-live="polite" aria-atomic="true">Photograph {visibleIndex + 1} of {photographs.length}</p>
            <button className="gal-icon-button" type="button" aria-label="Close photograph viewer" onClick={() => dialog.current?.close()} autoFocus><X size={23} strokeWidth={1.5} /></button>
          </div>
          <figure className="gal-full-figure">
            <img className="gal-full-image" src={currentImage.url} alt={currentImage.alt || currentImage.caption || `${projectTitle} — photograph ${visibleIndex + 1}`} decoding="async" />
            <figcaption className="gal-full-caption">{currentImage.caption || currentImage.alt || 'Project photograph'}</figcaption>
          </figure>
          {photographs.length > 1 && (
            <div className="gal-navigation">
              <button className="gal-nav-button" type="button" onClick={() => move(-1)} aria-label="Previous photograph"><ArrowLeft size={20} strokeWidth={1.5} /><span>Previous</span></button>
              <p className="gal-keyboard-hint">Use arrow keys to explore</p>
              <button className="gal-nav-button" type="button" onClick={() => move(1)} aria-label="Next photograph"><span>Next</span><ArrowRight size={20} strokeWidth={1.5} /></button>
            </div>
          )}
        </div>
      </dialog>
    </div>
  );
}
