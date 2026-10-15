'use client';

/* eslint-disable @next/next/no-img-element -- Uploads use private signed or local blob URLs; the server optimises stored photographs. */

import { useEffect, useRef, useState, type RefObject } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, Check, Eye, ImagePlus, Plus, Save, Star, Trash2, UploadCloud, Video, X } from 'lucide-react';
import { categories, type ComparisonPair, type Project, type ProjectImage, type ProjectVideo } from '@/lib/types';
import { createUUID } from '@/lib/uuid';
import { ALLOWED_VIDEO_TYPES, MAX_PROJECT_VIDEOS, MAX_VIDEO_UPLOAD_BYTES, getVideoContentType } from '@/lib/videos';
import { adminRequest } from './api';
import { ProjectPreview } from './ProjectPreview';

type UploadItem = { id: string; file: File; preview: string; progress: number; error?: string };
type VideoUploadItem = Omit<UploadItem, 'preview'>;

export function ProjectEditor({ initialProject, navigationGuard, onClose, onSaved }: { initialProject: Project; navigationGuard: RefObject<(() => boolean) | null>; onClose: () => void; onSaved: (project: Project) => void }) {
  const [project, setProject] = useState<Project>(() => ({ ...initialProject, images: [...initialProject.images].sort((a, b) => a.sort_order - b.sort_order), videos: [...initialProject.videos].sort((a, b) => a.sort_order - b.sort_order) }));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [videoUploads, setVideoUploads] = useState<VideoUploadItem[]>([]);
  const [videoUploading, setVideoUploading] = useState(false);
  const [storedVideoIds, setStoredVideoIds] = useState(() => new Set(initialProject.videos.map(video => video.id)));
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState(false);
  const [dragging, setDragging] = useState(false);
  const uploadInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const uploadLock = useRef(false);
  const mediaRevision = useRef(0);
  const previewUrls = useRef(new Set<string>());
  const videoUploadsEnabled = project.video_uploads_enabled !== false;
  const availableVideoSlots = Math.max(0, MAX_PROJECT_VIDEOS - storedVideoIds.size);
  const hasRemovedVideos = [...storedVideoIds].some(id => !project.videos.some(video => video.id === id));

  useEffect(() => {
    function guard(event: BeforeUnloadEvent) { if (dirty || uploading || saving) event.preventDefault(); }
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [dirty, uploading, saving]);

  useEffect(() => {
    let active = true;
    function renewMedia() {
      const revision = mediaRevision.current;
      void adminRequest<{ project: Project }>(`/api/admin/projects/${project.id}`).then(({ project: stored }) => {
        if (!active || uploadLock.current || revision !== mediaRevision.current) return;
        const urls = new Map(stored.images.map(image => [image.id, image.url]));
        const videoUrls = new Map(stored.videos.map(video => [video.id, video.url]));
        setProject(current => ({ ...current, images: current.images.map(image => ({ ...image, url: urls.get(image.id) || image.url })), videos: current.videos.map(video => ({ ...video, url: videoUrls.get(video.id) || video.url })) }));
        setStoredVideoIds(current => new Set([...current, ...stored.videos.map(video => video.id)]));
      }).catch(() => {
        // Keep local edits intact during a temporary connection failure. Saving reports errors.
      });
    }
    renewMedia();
    const interval = window.setInterval(renewMedia, 4 * 60 * 1000);
    return () => { active = false; window.clearInterval(interval); };
  }, [project.id]);

  useEffect(() => {
    navigationGuard.current = () => {
      if (uploading || saving) {
        window.alert('Please wait for the current upload or save to finish before leaving.');
        return false;
      }
      return !dirty || window.confirm('Leave without saving your changes? Photographs and videos already uploaded are stored, but unsaved project details will be discarded.');
    };
    return () => { navigationGuard.current = null; };
  }, [dirty, uploading, saving, navigationGuard]);

  useEffect(() => {
    const urls = previewUrls.current;
    return () => { urls.forEach(url => URL.revokeObjectURL(url)); };
  }, []);

  function updateProject(patch: Partial<Project>) {
    setProject(current => ({ ...current, ...patch })); setDirty(true); setNotice('');
  }

  function editImage(id: string, patch: Partial<ProjectImage>) {
    setProject(current => ({ ...current, images: current.images.map(image => image.id === id ? { ...image, ...patch } : image) }));
    setDirty(true); setNotice('');
  }

  function moveImage(index: number, direction: number) {
    const images = [...project.images];
    [images[index], images[index + direction]] = [images[index + direction], images[index]];
    updateProject({ images: images.map((image, sort_order) => ({ ...image, sort_order })) });
  }

  function removeImage(image: ProjectImage) {
    if (!window.confirm('Remove this photograph from the project? This also removes comparison pairs that use it. The change takes effect when you save.')) return;
    const images = project.images.filter(item => item.id !== image.id).map((item, sort_order) => ({ ...item, sort_order }));
    updateProject({ images, cover_image_id: project.cover_image_id === image.id ? (images[0]?.id ?? null) : project.cover_image_id, comparisons: project.comparisons.filter(pair => pair.before_id !== image.id && pair.after_id !== image.id) });
  }

  function editVideo(id: string, patch: Partial<ProjectVideo>) {
    setProject(current => ({ ...current, videos: current.videos.map(video => video.id === id ? { ...video, ...patch } : video) }));
    setDirty(true); setNotice('');
  }

  function moveVideo(index: number, direction: number) {
    const videos = [...project.videos];
    [videos[index], videos[index + direction]] = [videos[index + direction], videos[index]];
    updateProject({ videos: videos.map((video, sort_order) => ({ ...video, sort_order })) });
  }

  function removeVideo(id: string) {
    if (!window.confirm('Remove this video from the project? Save your changes to confirm the removal and make room for another video.')) return;
    updateProject({ videos: project.videos.filter(video => video.id !== id).map((video, sort_order) => ({ ...video, sort_order })) });
  }

  function uploadFile(item: UploadItem): Promise<ProjectImage> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/admin/uploads');
      xhr.timeout = 120000;
      xhr.upload.onprogress = event => {
        if (event.lengthComputable) setUploads(current => current.map(upload => upload.id === item.id ? { ...upload, progress: Math.round(event.loaded / event.total * 100) } : upload));
      };
      xhr.onerror = () => reject(new Error('Connection lost. Check your connection and try this photograph again.'));
      xhr.ontimeout = () => reject(new Error('This upload took too long. Please try again.'));
      xhr.onload = () => {
        try {
          const result = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && result.image) resolve(result.image);
          else reject(new Error(result.error || 'Could not upload this photograph.'));
        } catch { reject(new Error('Could not upload this photograph. Please try again.')); }
      };
      const data = new FormData();
      data.append('file', item.file); data.append('projectId', project.id);
      xhr.send(data);
    });
  }

  async function uploadFiles(files: File[]) {
    if (!files.length || uploadLock.current || saving) return;
    uploadLock.current = true;
    mediaRevision.current++;
    setError(''); setNotice('');
    const items = files.map(file => {
      const preview = URL.createObjectURL(file); previewUrls.current.add(preview);
      return { id: createUUID(), file, preview, progress: 0 };
    });
    setUploads(current => [...current, ...items]); setUploading(true);
    for (const item of items) {
      try {
        const image = await uploadFile(item);
        setProject(current => ({ ...current, images: [...current.images, { ...image, sort_order: current.images.length }], cover_image_id: current.cover_image_id ?? image.id }));
        setDirty(true);
        setUploads(current => current.filter(upload => upload.id !== item.id));
        URL.revokeObjectURL(item.preview); previewUrls.current.delete(item.preview);
      } catch (error) {
        setUploads(current => current.map(upload => upload.id === item.id ? { ...upload, error: error instanceof Error ? error.message : 'Upload failed. Please try again.' } : upload));
      }
    }
    mediaRevision.current++;
    uploadLock.current = false; setUploading(false);
    if (uploadInput.current) uploadInput.current.value = '';
  }

  function dismissUpload(id: string) {
    const item = uploads.find(upload => upload.id === id);
    if (item) { URL.revokeObjectURL(item.preview); previewUrls.current.delete(item.preview); }
    setUploads(current => current.filter(upload => upload.id !== id));
  }

  async function uploadVideo(item: VideoUploadItem): Promise<ProjectVideo> {
    const contentType = getVideoContentType(item.file);
    if (!contentType) throw new Error('Choose an MP4, WebM or MOV video.');
    const { upload } = await adminRequest<{ upload: { id: string; path: string; signedUrl: string } }>('/api/admin/video-uploads', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: project.id, contentType, size: item.file.size }),
    });
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', upload.signedUrl);
      xhr.setRequestHeader('x-upsert', 'false');
      xhr.timeout = 300000;
      xhr.upload.onprogress = event => {
        if (event.lengthComputable) setVideoUploads(current => current.map(upload => upload.id === item.id ? { ...upload, progress: Math.round(event.loaded / event.total * 100) } : upload));
      };
      xhr.onerror = () => reject(new Error('Connection lost. Check your connection and try this video again.'));
      xhr.ontimeout = () => reject(new Error('This upload took too long. Please try again.'));
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) { resolve(); return; }
        if (xhr.status === 413) { reject(new Error('Choose a video no larger than 50 MB.')); return; }
        if (xhr.status === 401 || xhr.status === 403) { reject(new Error('The upload permission expired. Please choose this video again.')); return; }
        try {
          const result = JSON.parse(xhr.responseText);
          reject(new Error(result.message || result.error || 'Video storage could not accept this file. Please try again.'));
        } catch { reject(new Error('Video storage could not accept this file. Please try again.')); }
      };
      const data = new FormData();
      data.append('cacheControl', '300');
      const file = item.file.type === contentType ? item.file : new File([item.file], item.file.name, { type: contentType });
      data.append('', file);
      xhr.send(data);
    });
    const { video } = await adminRequest<{ video: ProjectVideo }>('/api/admin/video-uploads', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: project.id, id: upload.id, contentType }),
    });
    return video;
  }

  async function uploadVideos(files: File[]) {
    if (videoInput.current) videoInput.current.value = '';
    if (!videoUploadsEnabled || !files.length || uploadLock.current || saving) return;
    setError(''); setNotice('');
    if (files.length > availableVideoSlots) {
      setError(hasRemovedVideos ? 'Save your video removals before adding more videos. Each project can have up to two videos.' : 'Each project can have up to two videos. Choose only as many videos as there are spaces available.');
      return;
    }
    if (files.some(file => !getVideoContentType(file))) {
      setError('Choose MP4, WebM or MOV videos. Other video formats are not supported.'); return;
    }
    if (files.some(file => !file.size || file.size > MAX_VIDEO_UPLOAD_BYTES)) {
      setError('Each video must be a non-empty file up to 50 MB.'); return;
    }
    uploadLock.current = true;
    mediaRevision.current++;
    setUploading(true); setVideoUploading(true);
    const items = files.map(file => ({ id: createUUID(), file, progress: 0 }));
    setVideoUploads(current => [...current, ...items]);
    for (const item of items) {
      try {
        const video = await uploadVideo(item);
        setStoredVideoIds(current => new Set([...current, video.id]));
        setProject(current => ({ ...current, videos: [...current.videos, { ...video, sort_order: current.videos.length }] }));
        setDirty(true);
        setVideoUploads(current => current.filter(upload => upload.id !== item.id));
      } catch (error) {
        setVideoUploads(current => current.map(upload => upload.id === item.id ? { ...upload, error: error instanceof Error ? error.message : 'Upload failed. Please try again.' } : upload));
      }
    }
    mediaRevision.current++;
    uploadLock.current = false;
    setUploading(false); setVideoUploading(false);
  }

  async function save(published = project.published) {
    if (uploadLock.current || saving) return;
    setError(''); setNotice('');
    if (project.title.trim().length < 2) { setError('Add a project title with at least two characters.'); return; }
    if (published && (!project.description.trim() || !project.images.length || project.images.some(image => !image.alt.trim()))) {
      setError('Before publishing, add a description, at least one photograph, and descriptive alternative text for every photograph.'); return;
    }
    if (published && !project.cover_image_id) { setError('Choose a cover photograph before publishing.'); return; }
    if (project.comparisons.some(pair => !pair.before_id || !pair.after_id || pair.before_id === pair.after_id)) {
      setError('Choose two different photographs for each before-and-after pair, or remove the unfinished pair.'); return;
    }
    mediaRevision.current++;
    setSaving(true);
    try {
      const { project: saved } = await adminRequest<{ project: Project }>(`/api/admin/projects/${project.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: project.title.trim(), category: project.category, description: project.description.trim(), location: project.location.trim(), featured: project.featured, published, sort_order: project.sort_order, cover_image_id: project.cover_image_id, images: project.images.map(({ id, path, alt, caption }, sort_order) => ({ id, path, alt, caption, sort_order })), ...(videoUploadsEnabled ? { videos: project.videos.map(({ id, path, caption }, sort_order) => ({ id, path, caption, sort_order })) } : {}), comparisons: project.comparisons }),
      });
      setProject(saved); setStoredVideoIds(new Set(saved.videos.map(video => video.id))); setDirty(false); onSaved(saved);
      setNotice(published ? 'Your project is saved and visible on the website.' : 'Your draft is saved. Only you can see it.');
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not save your project. Your changes are still here.'); }
    finally { mediaRevision.current++; setSaving(false); }
  }

  function addPair() {
    updateProject({ comparisons: [...project.comparisons, { id: createUUID(), before_id: '', after_id: '', label: '', aligned: false }] });
  }

  function editPair(id: string, patch: Partial<ComparisonPair>) {
    updateProject({ comparisons: project.comparisons.map(pair => pair.id === id ? { ...pair, ...patch } : pair) });
  }

  function close() {
    if (navigationGuard.current && !navigationGuard.current()) return;
    onClose();
  }

  return (
    <div className="admin-content admin-editor">
      <button className="admin-back" onClick={close} disabled={uploading || saving}><ArrowLeft size={16} /> Back to projects</button>
      <div className="admin-editor-heading"><div><p className="admin-eyebrow">THE DETAILS MAKE THE DIFFERENCE</p><h1>Edit your project.</h1><div className="admin-project-labels"><span className={`admin-status ${project.published ? 'is-published' : ''}`}>{project.published ? 'Published' : 'Draft'}</span><span className="admin-muted">{dirty ? 'Unsaved changes' : 'All changes saved'}</span></div></div><div className="admin-editor-actions"><button className="admin-button admin-button-secondary" onClick={() => setPreview(true)}><Eye size={17} /> Preview</button><button className="admin-button" onClick={() => save()} disabled={saving || uploading}><Save size={16} />{saving ? 'Saving…' : project.published ? 'Save changes' : 'Save draft'}</button></div></div>
      {error && <div className="admin-error" role="alert">{error}</div>}
      {notice && <div className="admin-success" role="status"><Check size={17} />{notice}</div>}
      <fieldset className="admin-editor-grid" disabled={saving}>
        <div className="admin-editor-main">
          <section className="admin-editor-section"><div className="admin-section-title"><span>01</span><div><h2>Tell the story</h2><p>A few thoughtful details help customers imagine their own project.</p></div></div>
            <div className="admin-form"><label>Project title<input value={project.title} onChange={event => updateProject({ title: event.target.value })} maxLength={140} placeholder="A welcoming garden in bloom" required /></label><div className="admin-field-row"><label>Service category<select value={project.category} onChange={event => updateProject({ category: event.target.value as Project['category'] })}>{categories.map(category => <option key={category}>{category}</option>)}</select></label><label>Location <span className="admin-optional">(optional)</span><input value={project.location} onChange={event => updateProject({ location: event.target.value })} maxLength={160} placeholder="Town or neighbourhood" /></label></div><label>Project description<textarea value={project.description} onChange={event => updateProject({ description: event.target.value })} rows={5} maxLength={6000} placeholder="What did the work involve? Describe the materials, practical improvements, and finishing touches." /></label></div>
          </section>
          <section className="admin-editor-section"><div className="admin-section-title"><span>02</span><div><h2>Let the photographs speak</h2><p>Add real photographs of your work. Choose a cover and arrange the gallery.</p></div></div>
            <div className={`admin-upload-zone ${dragging ? 'is-dragging' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); void uploadFiles(Array.from(event.dataTransfer.files)); }}>
              <UploadCloud size={31} strokeWidth={1.3} /><h3>Bring your project into focus.</h3><p>Choose photographs from your phone or computer, or drop them here.</p><input ref={uploadInput} id="admin-photo-upload" className="admin-visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={uploading || saving} onChange={event => void uploadFiles(Array.from(event.target.files ?? []))} /><button className="admin-button admin-button-secondary" onClick={() => uploadInput.current?.click()} disabled={uploading || saving}><ImagePlus size={17} />{uploading && !videoUploading ? 'Uploading photographs…' : 'Choose photographs'}</button><small>JPEG, PNG or WebP · up to 10 MB each · 60 photographs per project. Export HEIC photos as JPEG first.</small>
            </div>
            {uploads.length > 0 && <div className="admin-upload-list" aria-live="polite">{uploads.map(upload => <div className="admin-upload-item" key={upload.id}><img src={upload.preview} alt="Selected upload preview" /><div><strong>{upload.file.name}</strong>{upload.error ? <p className="admin-error-text">{upload.error}</p> : <><progress value={upload.progress} max={100} aria-label={`Uploading ${upload.file.name}`} /><span>{upload.progress === 100 ? 'Processing photograph…' : `${upload.progress}% uploaded`}</span></>}</div>{upload.error && <button className="admin-icon-button" onClick={() => dismissUpload(upload.id)} aria-label={`Dismiss failed upload ${upload.file.name}`}><X size={16} /></button>}</div>)}</div>}
            {project.images.length > 0 && <div className="admin-image-list">{project.images.map((image, index) => <article className="admin-image-editor" key={image.id}><div className="admin-image-preview"><img src={image.url} alt={image.alt || 'Project photograph awaiting alternative text'} loading="lazy" />{project.cover_image_id === image.id && <span className="admin-cover-label"><Star size={12} fill="currentColor" /> Cover</span>}</div><div className="admin-image-fields"><div className="admin-image-heading"><span className="admin-eyebrow">PHOTOGRAPH {String(index + 1).padStart(2, '0')}</span><div className="admin-row-actions"><button className="admin-icon-button" onClick={() => moveImage(index, -1)} aria-label={`Move photograph ${index + 1} up`} disabled={index === 0}><ArrowUp size={15} /></button><button className="admin-icon-button" onClick={() => moveImage(index, 1)} aria-label={`Move photograph ${index + 1} down`} disabled={index === project.images.length - 1}><ArrowDown size={15} /></button><button className="admin-icon-button admin-danger" onClick={() => removeImage(image)} aria-label={`Remove photograph ${index + 1}`}><Trash2 size={15} /></button></div></div><label>Alternative text<input value={image.alt} maxLength={240} onChange={event => editImage(image.id, { alt: event.target.value })} placeholder="Describe what is visible in the photograph" /></label><label>Caption <span className="admin-optional">(optional)</span><input value={image.caption} maxLength={500} onChange={event => editImage(image.id, { caption: event.target.value })} placeholder="A detail you’d like to share" /></label><button className="admin-text-link" onClick={() => updateProject({ cover_image_id: image.id })} disabled={project.cover_image_id === image.id}>{project.cover_image_id === image.id ? <><Check size={14} /> Cover photograph</> : <><Star size={14} /> Use as cover</>}</button></div></article>)}</div>}
            <p className="admin-help">Alternative text makes photographs accessible to visitors using screen readers. Photographs upload immediately. Save changes to update the gallery, photo order, and removals.</p>
          </section>
          <section className="admin-editor-section" aria-labelledby="admin-videos-title">
            <div className="admin-section-title"><span>03</span><div><h2 id="admin-videos-title">Bring your work to life</h2><p>Add up to two videos to share a walkthrough or show your work in motion. This section is optional.</p></div></div>
            {!videoUploadsEnabled && <p className="admin-help">Video uploads are not available yet. You can still edit and save the rest of this project.</p>}
            <div className="admin-upload-zone">
              <Video size={31} strokeWidth={1.3} /><h3>A different view of your work.</h3>
              <p className="admin-video-count" aria-live="polite">{project.videos.length} of {MAX_PROJECT_VIDEOS} videos added</p>
              <input ref={videoInput} id="admin-video-upload" className="admin-visually-hidden" type="file" accept={[...ALLOWED_VIDEO_TYPES, '.mp4', '.webm', '.mov'].join(',')} multiple disabled={!videoUploadsEnabled || uploading || saving || !availableVideoSlots} onChange={event => void uploadVideos(Array.from(event.target.files ?? []))} />
              <button className="admin-button admin-button-secondary" onClick={() => videoInput.current?.click()} disabled={!videoUploadsEnabled || uploading || saving || !availableVideoSlots}><Video size={17} />{!videoUploadsEnabled ? 'Video setup pending' : videoUploading ? 'Uploading videos…' : !availableVideoSlots ? 'Two-video limit reached' : 'Choose videos'}</button>
              <small>MP4, WebM or MOV · up to 50 MB each · maximum two videos per project.</small>
            </div>
            {hasRemovedVideos && <p className="admin-help" role="status">Save your changes to finish removing videos and make room for replacements.</p>}
            {videoUploads.length > 0 && <div className="admin-upload-list" aria-live="polite">{videoUploads.map(upload => <div className="admin-upload-item admin-video-upload-item" key={upload.id}><Video size={28} aria-hidden="true" /><div><strong>{upload.file.name}</strong>{upload.error ? <p className="admin-error-text" role="alert">{upload.error}</p> : <><progress value={upload.progress} max={100} aria-label={`Uploading ${upload.file.name}`} /><span>{upload.progress === 100 ? 'Processing video…' : `${upload.progress}% uploaded`}</span></>}</div>{upload.error && <button className="admin-icon-button" onClick={() => setVideoUploads(current => current.filter(item => item.id !== upload.id))} aria-label={`Dismiss failed upload ${upload.file.name}`}><X size={16} /></button>}</div>)}</div>}
            {project.videos.length > 0 && <div className="admin-video-list">{project.videos.map((video, index) => <article className="admin-video-editor" key={video.id}>
              <video src={video.url} controls playsInline preload="metadata" aria-label={video.caption || `Project video ${index + 1}`}>Your browser does not support embedded videos.</video>
              <div className="admin-image-fields"><div className="admin-image-heading"><span className="admin-eyebrow">VIDEO {String(index + 1).padStart(2, '0')}</span><div className="admin-row-actions"><button className="admin-icon-button" onClick={() => moveVideo(index, -1)} aria-label={`Move video ${index + 1} up`} disabled={index === 0}><ArrowUp size={15} /></button><button className="admin-icon-button" onClick={() => moveVideo(index, 1)} aria-label={`Move video ${index + 1} down`} disabled={index === project.videos.length - 1}><ArrowDown size={15} /></button><button className="admin-icon-button admin-danger" onClick={() => removeVideo(video.id)} aria-label={`Remove video ${index + 1}`}><Trash2 size={15} /></button></div></div>
                <label>Video caption <span className="admin-optional">(optional)</span><input value={video.caption} maxLength={500} onChange={event => editVideo(video.id, { caption: event.target.value })} placeholder="Describe what this video shows" /></label>
              </div>
            </article>)}</div>}
            <p className="admin-help">Videos upload immediately. Save changes to update the videos, captions, order, and removals. Videos play only when a visitor chooses to watch.</p>
          </section>
          <section className="admin-editor-section"><div className="admin-section-title"><span>04</span><div><h2>Show the transformation</h2><p>Pair genuine before-and-after photographs of the same space. This section is optional.</p></div></div>
            <div className="admin-pair-list">{project.comparisons.map((pair, index) => <div className="admin-pair-editor" key={pair.id}><div className="admin-image-heading"><h3>Comparison {index + 1}</h3><button className="admin-icon-button admin-danger" onClick={() => updateProject({ comparisons: project.comparisons.filter(item => item.id !== pair.id) })} aria-label={`Remove comparison ${index + 1}`}><Trash2 size={16} /></button></div><label>Comparison label <span className="admin-optional">(optional)</span><input value={pair.label} onChange={event => editPair(pair.id, { label: event.target.value })} maxLength={160} placeholder="The garden terrace" /></label><div className="admin-field-row">{(['before_id', 'after_id'] as const).map(key => {
              const image = project.images.find(image => image.id === pair[key]);
              return <div className="admin-pair-select" key={key}><label>{key === 'before_id' ? 'Before' : 'After'}<select value={pair[key]} onChange={event => editPair(pair.id, { [key]: event.target.value })}><option value="">Choose a photograph</option>{project.images.map((image, i) => <option key={image.id} value={image.id} disabled={image.id === pair[key === 'before_id' ? 'after_id' : 'before_id']}>Photo {i + 1}{image.caption || image.alt ? ` — ${(image.caption || image.alt).slice(0, 65)}` : ''}</option>)}</select></label>{image && <img src={image.url} alt={image.alt || (key === 'before_id' ? 'Selected before photograph' : 'Selected after photograph')} />}</div>;
            })}</div><label className="admin-checkbox"><input type="checkbox" checked={pair.aligned} onChange={event => editPair(pair.id, { aligned: event.target.checked })} /><span><strong>These photographs are suitably aligned</strong><small>Enable the comparison slider when the angle and framing match. Visitors can always view full photographs side by side.</small></span></label></div>)}</div>
            <button className="admin-button admin-button-secondary" onClick={addPair} disabled={project.images.length < 2 || project.comparisons.length >= 20}><Plus size={17} /> Add a before-and-after pair</button>{project.images.length < 2 && <p className="admin-help">Upload at least two photographs to create a comparison.</p>}
          </section>
        </div>
        <aside className="admin-editor-sidebar"><div className="admin-publish-panel"><p className="admin-eyebrow">READY WHEN YOU ARE</p><h2>A place in your portfolio.</h2><p>{project.published ? 'This project is live on your website. Save changes to update what visitors see.' : 'Drafts are private. Preview your work and publish when every detail feels right.'}</p><label className="admin-checkbox"><input type="checkbox" checked={project.featured} onChange={event => updateProject({ featured: event.target.checked })} /><span><strong>Feature this project</strong><small>Give it a prominent place in your portfolio.</small></span></label><div className="admin-publish-checklist"><p><span className={project.title.trim().length > 1 ? 'is-ready' : ''}><Check size={13} /></span> Project title</p><p><span className={project.description.trim() ? 'is-ready' : ''}><Check size={13} /></span> Project description</p><p><span className={project.images.length ? 'is-ready' : ''}><Check size={13} /></span> Photographs uploaded</p><p><span className={project.cover_image_id ? 'is-ready' : ''}><Check size={13} /></span> Cover photograph chosen</p><p><span className={project.images.length && project.images.every(image => image.alt.trim()) ? 'is-ready' : ''}><Check size={13} /></span> Alternative text added</p></div><button className="admin-button" disabled={saving || uploading} onClick={() => save(!project.published)}>{saving ? 'Saving…' : project.published ? 'Unpublish project' : 'Publish project'}</button><p className="admin-help">{project.published ? 'Unpublishing makes this project a private draft.' : 'Publishing saves your changes and makes the project visible to everyone.'}</p></div></aside>
      </fieldset>
      {preview && <ProjectPreview project={project} onClose={() => setPreview(false)} />}
    </div>
  );
}
