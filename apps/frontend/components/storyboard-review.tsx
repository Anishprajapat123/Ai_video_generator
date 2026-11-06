'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronDown, FileText, Shapes } from 'lucide-react';
import { api, type Project, type Scene, type Storyboard } from '../lib/api';
import { allowLeavingEditor } from '../lib/leave-guard';
import { useStudio } from './studio';

type SceneDraft = { title: string; narration: string; visualDescription: string; duration: string; transition: Scene['transition']['type'] };
const asDraft = (scene: Scene): SceneDraft => ({ title: scene.title, narration: scene.narration || '', visualDescription: scene.visualDescription || '', duration: String(scene.duration), transition: scene.transition.type });

export function StoryboardReview({ storyboardId }: { storyboardId: string }) {
  const { memberships, registerLeaveGuard, refreshProjects } = useStudio();
  const [board, setBoard] = useState<Storyboard | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState<SceneDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<'save' | 'approve' | 'delete' | null>(null);
  const [needsReload, setNeedsReload] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const busy = useRef(false);
  const selection = useRef('');
  const selected = scenes.find(scene => scene._id === selectedId);
  const dirty = Boolean(draft && selected && JSON.stringify(draft) !== JSON.stringify(asDraft(selected)));
  const membership = memberships.find(item => item.workspace._id === board?.workspaceId);
  const isCurrent = project?.storyboardId === board?._id && board?.status !== 'superseded';
  const canEdit = Boolean(membership && membership.role !== 'viewer' && isCurrent && !needsReload);
  const total = scenes.reduce((sum, scene) => sum + (scene._id === selectedId && draft && Number.isFinite(Number(draft.duration)) ? Number(draft.duration) : scene.duration), 0);

  const load = useCallback(async () => {
    // Read the approval revision before the scenes. Later edits then cause an approval conflict.
    const result = await api<{ storyboard: Storyboard }>('/storyboards/' + encodeURIComponent(storyboardId));
    const owner = await api<{ project: Project }>('/projects/' + result.storyboard.projectId);
    const active = owner.project.storyboardId === storyboardId;
    const list = active ? await api<{ scenes: Scene[] }>('/projects/' + owner.project._id + '/scenes') : { scenes: [] };
    if (list.scenes.some(scene => scene.storyboardId !== storyboardId)) throw new Error('The storyboard changed. Reload to open the current version.');
    return { board: result.storyboard, project: owner.project, scenes: list.scenes };
  }, [storyboardId]);
  function apply(data: Awaited<ReturnType<typeof load>>) {
    setBoard(data.board); setProject(data.project); setScenes(data.scenes); setNeedsReload(false);
    const scene = data.scenes.find(item => item._id === selection.current) || data.scenes[0];
    selection.current = scene?._id || '';
    setSelectedId(selection.current); setDraft(scene ? asDraft(scene) : null);
  }
  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setNotice(''); setBoard(null); setProject(null); setScenes([]); setDraft(null); selection.current = '';
    load().then(data => { if (active) apply(data); }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]);
  useEffect(() => registerLeaveGuard(() => allowLeavingEditor(dirty, Boolean(pending), message => window.confirm(message), 'scene')), [dirty, pending, registerLeaveGuard]);
  useEffect(() => {
    if (!dirty && !pending) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const navigate = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest?.('a[href]');
      if (!anchor || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const target = new URL(anchor.getAttribute('href')!, window.location.href);
      if (target.pathname === window.location.pathname && target.search === window.location.search) return;
      if (!allowLeavingEditor(dirty, Boolean(pending), message => window.confirm(message), 'scene')) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', unload); document.addEventListener('click', navigate, true);
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', navigate, true); };
  }, [dirty, pending]);
  function select(scene: Scene) {
    if (scene._id === selectedId) return;
    if (!allowLeavingEditor(dirty, Boolean(pending), message => window.confirm(message), 'scene')) return;
    selection.current = scene._id; setSelectedId(scene._id); setDraft(asDraft(scene)); setNotice(''); setError('');
  }
  function change<K extends keyof SceneDraft>(key: K, value: SceneDraft[K]) {
    setDraft(previous => previous ? { ...previous, [key]: value } : previous); setNotice('');
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current || !canEdit || !selected || !draft || !dirty) return;
    const duration = Number(draft.duration);
    if (!draft.title.trim() || !Number.isFinite(duration) || duration <= 0 || duration > 600 || total > 600) { setError('Enter a scene title and a positive duration. The storyboard must stay within 600 seconds.'); return; }
    busy.current = true; setPending('save'); setError(''); setNotice('');
    try {
      const result = await api<{ scene: Scene }>('/scenes/' + selected._id, { method: 'PATCH', body: JSON.stringify({
        title: draft.title.trim(), narration: draft.narration, visualDescription: draft.visualDescription, duration,
        transition: { type: draft.transition, duration: draft.transition === 'none' ? 0 : Math.min(selected.transition.duration || 1, duration) }, expectedUpdatedAt: selected.updatedAt,
      }) });
      setScenes(previous => previous.map(scene => scene._id === result.scene._id ? result.scene : scene));
      setDraft(asDraft(result.scene)); setBoard(previous => previous ? { ...previous, status: 'draft' } : previous);
      setNeedsReload(true);
      try { apply(await load()); setNotice('Scene saved. The storyboard is now a draft.'); }
      catch { setError('Scene saved, but the latest storyboard could not be loaded. Reload before continuing.'); }
      void refreshProjects().catch(() => {});
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save the scene.'); }
    finally { busy.current = false; setPending(null); }
  }
  async function removeScene() {
    if (busy.current || !canEdit || !selected) return;
    if (!window.confirm((dirty ? 'Unsaved changes to this scene will be lost. ' : '') + 'Delete scene ' + selected.sceneNumber + ' "' + selected.title + '"? Its video and narration files will also be removed.')) return;
    busy.current = true; setPending('delete'); setError(''); setNotice('');
    try {
      await api('/scenes/' + selected._id, { method: 'DELETE' });
      apply(await load());
      setNotice('Scene deleted. The storyboard is now a draft.');
      void refreshProjects().catch(() => {});
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to delete the scene.'); }
    finally { busy.current = false; setPending(null); }
  }
  async function approve() {
    if (busy.current || !canEdit || dirty || !board || !scenes.length) return;
    busy.current = true; setPending('approve'); setError(''); setNotice('');
    try {
      const result = await api<{ storyboard: Storyboard }>('/storyboards/' + board._id + '/approve', { method: 'POST', body: JSON.stringify({ expectedRevision: board.__v || 0 }) });
      setBoard(result.storyboard); setNotice('Storyboard approved. Your visual plan is ready for the next step.');
      void refreshProjects().catch(() => {});
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to approve the storyboard.'); }
    finally { busy.current = false; setPending(null); }
  }
  async function reload() {
    if (busy.current || !allowLeavingEditor(dirty, false, message => window.confirm(message), 'scene')) return;
    busy.current = true; setPending('save'); setError('');
    try { apply(await load()); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to reload.'); }
    finally { busy.current = false; setPending(null); }
  }
  if (loading) return <div className="state-panel" role="status">Opening your storyboard…</div>;
  if (!board || !project) return <div className="state-panel"><p className="error" role="alert">{error || 'Storyboard not found.'}</p><Link className="secondary-button" href="/">Back to overview</Link></div>;
  const approved = board.status === 'approved' && !dirty;
  return <div className="storyboard-review">
    <div className="storyboard-breadcrumb-row"><nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Overview</Link><span>/</span><span>{project.title}</span><span>/</span><span aria-current="page">Storyboard</span></nav><Link className="text-link" href={'/scripts/' + board.scriptId}><FileText size={16} />View approved script<ArrowRight size={16} /></Link></div>
    <header className="storyboard-header"><div className="review-title"><h1>Give your story a direction.</h1><span className="badge">{dirty ? 'Draft storyboard' : approved ? 'Approved storyboard' : isCurrent ? 'Draft storyboard' : 'Previous storyboard'}</span></div><p>Refine each scene before creating your visuals and narration.</p></header>
    {!isCurrent && <p className="provider-notice">This storyboard is no longer current. {project.storyboardId ? <Link className="text-link" href={'/storyboards/' + project.storyboardId}>Open current storyboard <ArrowRight size={15} /></Link> : <Link className="text-link" href={'/scripts/' + project.scriptId}>Review the current script</Link>}</p>}
    {membership?.role === 'viewer' && <p className="provider-notice">You have view-only access to this storyboard.</p>}
    {isCurrent && <div className="storyboard-grid"><aside className="scene-navigation"><div className="scene-navigation-heading"><h2>Scenes</h2><span>{String(scenes.length).padStart(2, '0')} total</span></div><nav aria-label="Storyboard scenes">{scenes.map(scene => <button key={scene._id} className={scene._id === selectedId ? 'scene-nav-item selected' : 'scene-nav-item'} disabled={Boolean(pending)} onClick={() => select(scene)} aria-current={scene._id === selectedId ? 'true' : undefined}><span className="scene-placeholder"><Shapes size={21} strokeWidth={1.5} /></span><span className="scene-nav-content"><span><strong>{String(scene.sceneNumber).padStart(2, '0')}</strong><small>{scene.duration}s</small></span><span title={scene.title}>{scene.title}</span></span></button>)}</nav><div className="scene-navigation-footer"><span>{scenes.length} scenes</span><span>About {Math.round(total)} seconds</span></div></aside>
      {selected && draft ? <form className="scene-editor" onSubmit={save} aria-busy={Boolean(pending)}><div className="scene-editor-heading"><div><h2>Scene {String(selected.sceneNumber).padStart(2, '0')}</h2><span className="badge">Draft</span></div><small>Index · {String(selected.sceneNumber).padStart(2, '0')} / {String(scenes.length).padStart(2, '0')}</small></div>
        <fieldset disabled={!canEdit || Boolean(pending)}><label htmlFor="scene-title">Scene title</label><input id="scene-title" value={draft.title} onChange={e => change('title', e.target.value)} required maxLength={300} />
          <label htmlFor="scene-narration">Narration<span>Spoken script line</span></label><textarea id="scene-narration" value={draft.narration} onChange={e => change('narration', e.target.value)} rows={4} maxLength={10000} />
          <label htmlFor="scene-visual">Visual direction<span>Production guidelines</span></label><textarea id="scene-visual" value={draft.visualDescription} onChange={e => change('visualDescription', e.target.value)} rows={4} maxLength={5000} /><p className="scene-guidance">Visual direction describes what this scene should show. Media will be created in a later step.</p>
          <div className="scene-timing"><div><label htmlFor="scene-duration">Duration <span>seconds</span></label><input id="scene-duration" type="number" min="0.1" max="600" step="0.1" required value={draft.duration} onChange={e => change('duration', e.target.value)} /></div><div><label htmlFor="scene-transition">Transition</label><span className="select-wrapper"><select id="scene-transition" value={draft.transition} onChange={e => change('transition', e.target.value as SceneDraft['transition'])}><option value="fade">Fade</option><option value="slide-left">Slide left</option><option value="slide-right">Slide right</option><option value="wipe">Wipe</option><option value="none">None</option></select><ChevronDown size={16} /></span></div></div>
          <div className="scene-save-row"><div className="scene-save-actions"><button className="secondary-button" type="submit" disabled={!dirty || Boolean(pending)}>{pending === 'save' ? 'Saving…' : 'Save scene'}</button><button className="text-button danger" type="button" disabled={!canEdit || Boolean(pending) || scenes.length <= 1} onClick={() => void removeScene()}>{pending === 'delete' ? 'Deleting…' : 'Delete scene'}</button></div><p>Scene changes return the storyboard to draft.</p></div></fieldset>
      </form> : <div className="scene-editor"><p>No scenes were found in this storyboard.</p></div>}
    </div>}
    {isCurrent && <footer className="storyboard-footer"><div><span className="dot" /><strong>{scenes.length} scenes</strong><span>·</span><span>Estimated total duration: <strong>{Math.round(total)}s</strong></span></div><div><button className="primary-button" disabled={!canEdit || dirty || approved || Boolean(pending) || !scenes.length} onClick={approve}>{approved ? <Check size={17} /> : null}{pending === 'approve' ? 'Approving…' : approved ? 'Storyboard approved' : 'Approve storyboard'}{!approved && <ArrowRight size={17} />}</button><p>Approve this visual plan before generating scene media.</p></div></footer>}
    {approved && isCurrent && !needsReload && <div className="storyboard-next-step"><p>Your storyboard is approved. Add visuals and narration to each scene.</p><Link className="primary-button" href={'/storyboards/' + storyboardId + '/media'}>Add media &amp; narration <ArrowRight size={16} /></Link></div>}
    <div className="storyboard-feedback" aria-live="polite">{dirty && <p className="muted">Unsaved scene changes. Save this scene before approving the storyboard.</p>}{notice && <p className="success-message" role="status"><Check size={16} />{notice}</p>}{error && <p className="error" role="alert">{error}</p>}{(error || needsReload) && <button className="text-button" disabled={Boolean(pending)} onClick={reload}>Reload storyboard</button>}</div>
  </div>;
}
