'use client';

/* eslint-disable @next/next/no-img-element -- Private signed photographs are optimised on upload and should not enter the public image cache. */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpRight, FolderOpen, Inbox, LogOut, Plus, RefreshCw, Star, Trash2 } from 'lucide-react';
import type { Enquiry, Project } from '@/lib/types';
import { categories } from '@/lib/types';
import { ProjectEditor } from './ProjectEditor';
import { adminRequest } from './api';

export function AdminDashboard({ email }: { email: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<'projects' | 'enquiries'>('projects');
  const [projects, setProjects] = useState<Project[]>([]);
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [editing, setEditing] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const loadSequence = useRef(0);
  const editorNavigationGuard = useRef<(() => boolean) | null>(null);

  const load = useCallback(() => {
    const sequence = ++loadSequence.current;
    const request = tab === 'projects'
      ? adminRequest<{ projects: Project[] }>('/api/admin/projects')
      : adminRequest<{ enquiries: Enquiry[] }>('/api/admin/enquiries');
    return request.then(result => {
      if (sequence !== loadSequence.current) return;
      if ('projects' in result) setProjects(result.projects.sort((a, b) => a.sort_order - b.sort_order));
      else setEnquiries(result.enquiries);
    }).catch(error => {
      if (sequence === loadSequence.current) setError(error instanceof Error ? error.message : 'Could not load your dashboard.');
    }).finally(() => {
      if (sequence === loadSequence.current) setLoading(false);
    });
  }, [tab]);

  useEffect(() => { void load(); }, [load]);

  function refresh() { setLoading(true); setError(''); void load(); }

  function selectTab(next: 'projects' | 'enquiries') {
    if (next === tab) return;
    setLoading(true); setError(''); setTab(next);
  }

  async function createProject() {
    setBusy(true); setError('');
    try {
      const { project } = await adminRequest<{ project: Project }>('/api/admin/projects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Untitled project', category: categories[0], description: '', location: '', published: false, sort_order: projects.length }),
      });
      setEditing(project);
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not create your project.'); }
    finally { setBusy(false); }
  }

  async function deleteProject(project: Project) {
    if (!window.confirm(`Delete “${project.title}” and all its photographs? This cannot be undone.`)) return;
    setBusy(true); setError('');
    try {
      await adminRequest(`/api/admin/projects/${project.id}`, { method: 'DELETE' });
      setProjects(current => current.filter(item => item.id !== project.id));
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not delete this project.'); }
    finally { setBusy(false); }
  }

  async function moveProject(index: number, direction: number) {
    const reordered = [...projects];
    [reordered[index], reordered[index + direction]] = [reordered[index + direction], reordered[index]];
    setBusy(true); setError('');
    try {
      await adminRequest('/api/admin/projects/reorder', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: reordered.map(project => project.id) }),
      });
      setProjects(reordered.map((project, sort_order) => ({ ...project, sort_order })));
    } catch (error) {
      await load();
      setError(error instanceof Error ? error.message : 'Could not save the project order.');
    } finally { setBusy(false); }
  }

  async function logout() {
    if (editorNavigationGuard.current && !editorNavigationGuard.current()) return;
    setBusy(true); setError('');
    try { await adminRequest('/api/admin/logout', { method: 'POST' }); router.refresh(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not sign out.'); setBusy(false); }
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <Link href="/" className="admin-wordmark" onClick={event => { if (editorNavigationGuard.current && !editorNavigationGuard.current()) event.preventDefault(); }}>GNJ<span>OWNER DASHBOARD</span></Link>
        <div className="admin-header-actions"><Link href="/" className="admin-text-link" onClick={event => { if (editorNavigationGuard.current && !editorNavigationGuard.current()) event.preventDefault(); }}>View website <ArrowUpRight size={16} /></Link><button className="admin-icon-button" onClick={logout} disabled={busy} aria-label="Sign out"><LogOut size={19} /></button></div>
      </header>
      {editing ? <ProjectEditor initialProject={editing} navigationGuard={editorNavigationGuard} onClose={() => { setEditing(null); refresh(); }} onSaved={project => setEditing(project)} /> : (
        <div className="admin-content">
          <div className="admin-page-intro"><div><p className="admin-eyebrow">YOUR BUSINESS, BEAUTIFULLY PRESENTED</p><h1>A little care. A lasting impression.</h1><p className="admin-muted">Manage your work and keep every new opportunity in sight.</p></div><span className="admin-account">{email}</span></div>
          <nav className="admin-tabs" aria-label="Dashboard sections">
            <button className={tab === 'projects' ? 'is-active' : ''} onClick={() => selectTab('projects')} aria-current={tab === 'projects' ? 'page' : undefined}><FolderOpen size={17} /> Your projects</button>
            <button className={tab === 'enquiries' ? 'is-active' : ''} onClick={() => selectTab('enquiries')} aria-current={tab === 'enquiries' ? 'page' : undefined}><Inbox size={17} /> Enquiries</button>
          </nav>
          {error && <div className="admin-error" role="alert">{error} <button className="admin-text-link" onClick={refresh}>Try again</button></div>}
          <div className="admin-section-heading"><div><h2>{tab === 'projects' ? 'Your project collection' : 'New conversations'}</h2><p className="admin-muted">{tab === 'projects' ? 'Share the details that make your work special.' : 'Enquiries sent through your website, all in one place.'}</p></div><div className="admin-row-actions"><button className="admin-icon-button" aria-label="Refresh dashboard" onClick={refresh} disabled={loading}><RefreshCw size={17} /></button>{tab === 'projects' && <button className="admin-button" onClick={createProject} disabled={busy}><Plus size={17} /> New project</button>}</div></div>
          {loading ? <div className="admin-empty" role="status">Loading your {tab}…</div> : tab === 'projects' ? (
            projects.length ? <div className="admin-project-list">{projects.map((project, index) => {
              const cover = project.images.find(image => image.id === project.cover_image_id) ?? project.images[0];
              return <article className="admin-project-row" key={project.id}>
                <button className="admin-project-thumbnail" onClick={() => setEditing(project)} aria-label={`Edit ${project.title}`}>{cover ? <img src={cover.url} alt="" loading="lazy" /> : <FolderOpen size={27} strokeWidth={1.3} />}</button>
                <div className="admin-project-summary"><div className="admin-project-labels"><span className={`admin-status ${project.published ? 'is-published' : ''}`}>{project.published ? 'Published' : 'Draft'}</span>{project.featured && <span className="admin-featured"><Star size={12} fill="currentColor" /> Featured</span>}</div><button className="admin-project-title" onClick={() => setEditing(project)}>{project.title}</button><p>{project.category} <span aria-hidden="true">·</span> {project.images.length} {project.images.length === 1 ? 'photo' : 'photos'}</p></div>
                <div className="admin-project-actions"><div className="admin-order-controls"><button className="admin-icon-button" aria-label={`Move ${project.title} up`} disabled={index === 0 || busy} onClick={() => moveProject(index, -1)}><ArrowUp size={16} /></button><button className="admin-icon-button" aria-label={`Move ${project.title} down`} disabled={index === projects.length - 1 || busy} onClick={() => moveProject(index, 1)}><ArrowDown size={16} /></button></div><button className="admin-button admin-button-secondary" onClick={() => setEditing(project)}>Edit project</button><button className="admin-icon-button admin-danger" onClick={() => deleteProject(project)} disabled={busy} aria-label={`Delete ${project.title}`}><Trash2 size={17} /></button></div>
              </article>;
            })}</div> : <div className="admin-empty"><FolderOpen size={33} strokeWidth={1.2} /><h3>Your next project starts here.</h3><p>Add photographs, tell the story, and publish when you’re ready.</p><button className="admin-button" disabled={busy} onClick={createProject}><Plus size={16} /> Add your first project</button></div>
          ) : enquiries.length ? <div className="admin-enquiry-list">{enquiries.map(enquiry => <article className="admin-enquiry" key={enquiry.id}><div className="admin-enquiry-heading"><div><span className="admin-eyebrow">{enquiry.service || 'GENERAL ENQUIRY'}</span><h3>{enquiry.name}</h3></div><time dateTime={enquiry.created_at}>{new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(enquiry.created_at))}</time></div><p className="admin-enquiry-message">{enquiry.message}</p><div className="admin-enquiry-contacts">{enquiry.email && <a href={`mailto:${enquiry.email}`}>{enquiry.email}<ArrowUpRight size={14} /></a>}{enquiry.phone && <a href={`tel:${enquiry.phone.replace(/[^+\d]/g, '')}`}>{enquiry.phone}<ArrowUpRight size={14} /></a>}</div></article>)}</div> : <div className="admin-empty"><Inbox size={33} strokeWidth={1.2} /><h3>A home for new conversations.</h3><p>Customer enquiries will appear here when they arrive.</p></div>}
          <footer className="admin-footer"><Link href="/" className="admin-back"><ArrowLeft size={15} /> Back to GNJ</Link><span>Thoughtful improvements, inside and out.</span></footer>
        </div>
      )}
    </main>
  );
}
