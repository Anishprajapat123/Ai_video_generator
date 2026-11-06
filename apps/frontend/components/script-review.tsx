'use client';
import { CollaborationSummary } from './collaboration-summary';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, RotateCw } from 'lucide-react';
import { api, type Project, type Script, type Storyboard } from '../lib/api';
import { useStudio } from './studio';
import { allowLeavingEditor } from '../lib/leave-guard';

const words = (text: string) => text.trim().split(/\s+/u).filter(Boolean).length;
const contentKey = (script: Script) => JSON.stringify({ title: script.title, sections: script.sections });

export function ScriptReview({ scriptId }: { scriptId: string }) {
  const router = useRouter();
  const { memberships, refreshProjects, registerLeaveGuard } = useStudio();
  const [saved, setSaved] = useState<Script | null>(null);
  const [draft, setDraft] = useState<Script | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<'save' | 'approve' | 'storyboard' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const busy = useRef(false);
  const dirty = Boolean(draft && saved && contentKey(draft) !== contentKey(saved));
  const membership = memberships.find(m => m.workspace._id === draft?.workspaceId);
  const current = Boolean(project && project.scriptId === saved?._id && saved?.status !== 'superseded');
  const canEdit = Boolean(membership && membership.role !== 'viewer' && current);
  const totalWords = draft?.sections.reduce((sum, section) => sum + words(section.narration), 0) || 0;
  const duration = draft?.sections.reduce((sum, section) => sum + section.estimatedDuration, 0) || 0;
  useEffect(() => registerLeaveGuard(() => allowLeavingEditor(dirty, Boolean(pending), message => window.confirm(message))), [dirty, pending, registerLeaveGuard]);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setNotice('');
    api<{ script: Script }>('/scripts/' + encodeURIComponent(scriptId)).then(async result => {
      const data = await api<{ project: Project }>('/projects/' + result.script.projectId);
      if (active) { setSaved(result.script); setDraft(result.script); setProject(data.project); setSelected(result.script.sections[0]?.sectionId || ''); }
    }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [scriptId]);

  useEffect(() => {
    if (!dirty && !pending) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const navigate = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest?.('a[href]');
      if (!anchor || event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0) return;
      const target = new URL(anchor.getAttribute('href')!, window.location.href);
      if (target.pathname === window.location.pathname && target.search === window.location.search) return;
      if (!allowLeavingEditor(dirty, Boolean(pending), message => window.confirm(message))) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', navigate, true);
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', navigate, true); };
  }, [dirty, pending]);

  function editSection(index: number, key: 'heading' | 'narration', value: string) {
    setNotice('');
    setDraft(previous => {
      if (!previous) return previous;
      return { ...previous, sections: previous.sections.map((section, position) => {
        if (position !== index) return section;
        const baseline = saved?.sections.find(item => item.sectionId === section.sectionId);
        const rate = baseline ? Math.max(.75, Math.min(4, words(baseline.narration) / baseline.estimatedDuration)) : 2.2;
        return { ...section, [key]: value, ...(key === 'narration' ? { estimatedDuration: baseline?.narration === value ? baseline.estimatedDuration : Math.max(1, Math.round(words(value) / rate)) } : {}) };
      }) };
    });
  }
  async function persist() {
    if (!draft || !saved) throw new Error('Script has not loaded.');
    if (duration > 600) throw new Error('Keep the script within the 10-minute project limit.');
    if (!draft.title.trim() || draft.sections.some(section => !section.heading.trim() || !section.narration.trim())) throw new Error('Each section needs a heading and narration.');
    if (!dirty) return saved;
    const result = await api<{ script: Script }>('/scripts/' + saved._id, { method: 'PATCH', body: JSON.stringify({ title: draft.title, sections: draft.sections, expectedRevision: saved.__v || 0 }) });
    setSaved(result.script); setDraft(result.script); setProject(previous => previous ? { ...previous, scriptId: result.script._id, storyboardId: undefined, status: 'draft' } : previous);
    return result.script;
  }
  async function submit(action: 'save' | 'approve') {
    if (busy.current || !canEdit) return;
    busy.current = true; setPending(action); setError(''); setNotice('');
    try {
      let result = await persist();
      if (action === 'approve') {
        result = (await api<{ script: Script }>('/scripts/' + result._id + '/approve', { method: 'POST', body: JSON.stringify({ expectedRevision: result.__v || 0 }) })).script;
        setSaved(result); setDraft(result); setNotice('Script approved. It is ready for storyboard creation.');
      } else setNotice('Draft saved.');
      // Avoid losing a successful save if refreshing the overview fails.
      void refreshProjects().catch(() => {});
      if (result._id !== scriptId) router.replace('/scripts/' + result._id);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save your script.'); }
    finally { busy.current = false; setPending(null); }
  }
  async function openStoryboard() {
    if (busy.current || !project || !saved || dirty || saved.status !== 'approved' || !current) return;
    busy.current = true; setPending('storyboard'); setError('');
    try {
      const latest = (await api<{ project: Project }>('/projects/' + project._id)).project;
      if (latest.scriptId !== saved._id) throw new Error('The project script has changed. Reload before continuing.');
      if (latest.storyboardId) { router.push('/storyboards/' + latest.storyboardId); return; }
      if (!canEdit) throw new Error('You need editing access to create a storyboard.');
      const result = await api<{ storyboard: Storyboard }>(`/projects/${project._id}/storyboards/generate`, {
        method: 'POST', body: JSON.stringify({ scriptId: saved._id, reuseExisting: true }),
      });
      void refreshProjects().catch(() => {});
      router.push('/storyboards/' + result.storyboard._id);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to open the storyboard.'); }
    finally { busy.current = false; setPending(null); }
  }
  if (loading) return <div className="state-panel" role="status">Opening your script…</div>;
  if (!draft || !project) return <div className="state-panel"><p className="error" role="alert">{error || 'Script not found.'}</p><Link className="secondary-button" href="/">Back to overview</Link></div>;
  const approved = saved?.status === 'approved' && !dirty;
  return <div className="script-review">
    <CollaborationSummary review={saved?.providerMetadata?.collaboration} />
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Overview</Link><span>/</span><span>{project.title}</span><span>/</span><span aria-current="page">Script review</span></nav>
    <header className="review-header"><div><div className="review-title"><h1>Shape your story.</h1><span className="badge"><span className="dot" />{approved ? 'Approved' : saved?.status === 'superseded' ? 'Previous version' : 'Draft'}</span></div><p>Review your narration before bringing each scene to life.</p></div>
      {canEdit && <Link className="secondary-button regenerate-button" href={`/create?project=${project._id}&regenerate=1`}><RotateCw size={17} />Regenerate script</Link>}
    </header>
    {!current && <p className="provider-notice">This is a previous script version. {project.scriptId && <Link className="text-link" href={'/scripts/' + project.scriptId}>Open the current script <ArrowRight size={15} /></Link>}</p>}
    {membership?.role === 'viewer' && <p className="provider-notice">You have view-only access to this script.</p>}
    <div className="review-grid">
      <aside className="section-navigation"><div className="section-navigation-heading"><h2>Script sections</h2><small>{draft.sections.length} total</small></div><nav aria-label="Script sections">{draft.sections.map((section, index) => <button type="button" key={section.sectionId} className={selected === section.sectionId ? 'section-nav-item selected' : 'section-nav-item'} aria-current={selected === section.sectionId ? 'true' : undefined} onClick={() => { setSelected(section.sectionId); document.getElementById('script-section-' + index)?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'center' }); }}><span>{String(index + 1).padStart(2, '0')}</span><span>{section.heading || 'Untitled section'}</span><i /></button>)}</nav><div className="section-navigation-footer"><span>{draft.sections.length} sections</span><span>About {Math.round(duration)} seconds</span></div></aside>
      <div className="review-editor" aria-label="Script editor">{draft.sections.map((section, index) => <section id={'script-section-' + index} key={section.sectionId} className={selected === section.sectionId ? 'review-section selected' : 'review-section'} onFocus={() => setSelected(section.sectionId)}>
        <div className="review-section-meta"><span>Section {String(index + 1).padStart(2, '0')}</span><span className="section-duration">About {section.estimatedDuration}s</span></div>
        <label className="sr-only" htmlFor={'section-heading-' + index}>Section {index + 1} heading</label><input id={'section-heading-' + index} className="section-heading-input" value={section.heading} disabled={!canEdit || Boolean(pending)} onChange={event => editSection(index, 'heading', event.target.value)} maxLength={300} required />
        <label className="sr-only" htmlFor={'section-narration-' + index}>Section {index + 1} narration</label><textarea id={'section-narration-' + index} className="section-narration-input" value={section.narration} disabled={!canEdit || Boolean(pending)} onChange={event => editSection(index, 'narration', event.target.value)} maxLength={10000} rows={Math.max(3, Math.ceil(section.narration.length / 85))} required />
        <small className="section-word-count">{words(section.narration)} words · Estimated narration duration</small>
      </section>)}</div>
    </div>
    <footer className="review-footer"><div className="review-totals"><strong>{totalWords} words</strong><span>·</span><span>Estimated total duration: <strong>{Math.round(duration)}s</strong></span></div><div className="review-footer-actions"><div className="review-buttons"><button className="secondary-button" disabled={!canEdit || !dirty || Boolean(pending)} onClick={() => submit('save')}>{pending === 'save' ? 'Saving…' : 'Save draft'}</button><button className="primary-button" disabled={!canEdit || approved || Boolean(pending)} onClick={() => submit('approve')}>{approved ? <Check size={17} /> : null}{pending === 'approve' ? 'Approving…' : approved ? 'Script approved' : 'Approve script'}{!approved && <ArrowRight size={17} />}</button></div><p>Approve this script to continue to storyboard creation.</p></div></footer>
    <div className="review-feedback" aria-live="polite">{notice && <p className="success-message" role="status"><Check size={16} />{notice}</p>}{dirty && <p className="muted">Unsaved changes{saved?.status === 'approved' ? ' · Saving creates a new draft version.' : ''}</p>}{error && <p className="error" role="alert">{error}</p>}</div>
    {approved && current && <div className="storyboard-next-step"><p>Your script is approved. Continue to plan and review its scenes.</p><button className="primary-button" disabled={Boolean(pending) || (!canEdit && !project.storyboardId)} onClick={openStoryboard}>{pending === 'storyboard' ? 'Opening storyboard…' : project.storyboardId ? 'Review storyboard' : 'Create storyboard'}<ArrowRight size={17} /></button></div>}
  </div>;
}
