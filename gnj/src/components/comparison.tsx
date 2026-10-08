/* eslint-disable @next/next/no-img-element -- Project image URLs are optimised by the upload service. */
'use client';

import { useId, useState } from 'react';
import { ArrowLeftRight, Columns2, GripVertical } from 'lucide-react';
import type { ComparisonPair, ProjectImage } from '@/lib/types';
import './gallery.css';

export function Comparison({ pair, images }: { pair: ComparisonPair; images: ProjectImage[] }) {
  const [mode, setMode] = useState<'slider' | 'full'>('slider');
  const [position, setPosition] = useState(50);
  const identifier = useId();
  const before = images.find((image) => image.id === pair.before_id);
  const after = images.find((image) => image.id === pair.after_id);

  if (!before?.url || !after?.url || before.id === after.id) return null;

  const label = pair.label.trim() || 'Before & after';
  const showSlider = pair.aligned && mode === 'slider';

  return (
    <section className="cmp-comparison" aria-labelledby={`${identifier}-title`}>
      <div className="cmp-heading-row">
        <h3 id={`${identifier}-title`} className="cmp-title">{label}</h3>
        {pair.aligned && (
          <div className="cmp-view-options" role="group" aria-label={`Choose comparison view for ${label}`}>
            <button type="button" className="cmp-view-button" aria-pressed={showSlider} onClick={() => setMode('slider')}><ArrowLeftRight size={16} strokeWidth={1.5} aria-hidden="true" />Slider</button>
            <button type="button" className="cmp-view-button" aria-pressed={!showSlider} onClick={() => setMode('full')}><Columns2 size={16} strokeWidth={1.5} aria-hidden="true" />Full photographs</button>
          </div>
        )}
      </div>

      {showSlider ? (
        <div className="cmp-slider-view">
          <div className="cmp-stage">
            <img className="cmp-slide-photo" src={after.url} alt={`After: ${after.alt || after.caption || label}`} loading="lazy" decoding="async" />
            <div className="cmp-before-layer" style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}>
              <img className="cmp-slide-photo" src={before.url} alt={`Before: ${before.alt || before.caption || label}`} loading="lazy" decoding="async" />
            </div>
            <span className="cmp-photo-label cmp-label-before" aria-hidden="true">Before</span>
            <span className="cmp-photo-label cmp-label-after" aria-hidden="true">After</span>
            <div className="cmp-divider" style={{ left: `${position}%` }} aria-hidden="true"><span className="cmp-grip"><GripVertical size={24} strokeWidth={1.5} /></span></div>
            <input className="cmp-range" type="range" min={0} max={100} step={1} value={position} onChange={(event) => setPosition(Number(event.target.value))} aria-label={`Before and after image divider: ${label}`} aria-valuetext={`${position}% before photograph, ${100 - position}% after photograph`} aria-describedby={`${identifier}-instructions`} />
          </div>
          <div className="cmp-slider-details">
            <p id={`${identifier}-instructions`}>Drag the divider or use the arrow keys to compare. Choose full photographs to see every detail.</p>
            {(before.caption || after.caption) && <div className="cmp-caption-pair">{before.caption && <p><strong>Before</strong>{before.caption}</p>}{after.caption && <p><strong>After</strong>{after.caption}</p>}</div>}
          </div>
        </div>
      ) : (
        <div className="cmp-full-grid">
          {[{ image: before, stage: 'Before' }, { image: after, stage: 'After' }].map(({ image, stage }) => (
            <figure key={stage} className="cmp-full-figure">
              <div className="cmp-full-photo-wrap"><img src={image.url} alt={`${stage}: ${image.alt || image.caption || label}`} loading="lazy" decoding="async" /><span className="cmp-photo-label">{stage}</span></div>
              <figcaption className="cmp-full-caption"><span className="cmp-stage-name">{stage}</span>{image.caption && <span>{image.caption}</span>}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}
