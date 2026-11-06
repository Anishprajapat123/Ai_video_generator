'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Film } from 'lucide-react';
import { api, type MediaAsset, type Project, type Scene, type Storyboard } from '../lib/api';
import { mediaUrl, sceneDuration, sceneMedia, preferredNarrationVoice } from '../lib/media';
import { useStudio } from './studio';
import { buildVideoPreview, type VideoPreviewData } from '../lib/video-preview';
import { VideoPreview } from './video-preview';
import { VoiceSamplePlayer } from './voice-sample-player';
import { SceneEditingPanel, type SceneDraft } from './scene-editing-panel';

type VideoJob = { _id: string; sceneId: string; jobType?: string; providerId?: string; status: 'processing' | 'completed' | 'failed'; progress: number; error?: string; externalJobId?: string };
type RenderJob = { _id: string; status: 'processing' | 'completed' | 'failed'; progress: number; error?: string; assetId?: string };
type BatchJob = { _id: string; status: 'processing' | 'completed' | 'failed'; progress: number; error?: string; inputReference: { storyboardId: string; reservedCredits: number; scenes: { sceneId: string; title: string; narration: string; visual: string; error?: string }[] } };

export function SceneMediaEditor({ storyboardId }: { storyboardId: string }) {
  const { memberships, providers, registerLeaveGuard } = useStudio();
  const [videoProvider, setVideoProvider] = useState<'remotion' | 'ltx-free' | 'flow-local'>('remotion');
  const [visualProviderId, setVisualProviderId] = useState('gemini');
  const visualProviderInitialized = useRef(false);
  useEffect(() => {
    if (!visualProviderInitialized.current && providers.length) {
      visualProviderInitialized.current = true;
      if (providers.some(provider => provider.id === 'studio-team' && provider.enabled)) setVisualProviderId('studio-team');
    }
  }, [providers]);
  const [allowFlowCredits, setAllowFlowCredits] = useState(false);
  const [batchApproval, setBatchApproval] = useState(false);
  const [batchJob, setBatchJob] = useState<BatchJob | null>(null);
  useEffect(() => { setBatchApproval(false); }, [videoProvider, batchJob?._id]);
  const [data, setData] = useState<{ board: Storyboard; project: Project; scenes: Scene[]; assets: MediaAsset[]; videoJob: VideoJob | null } | null>(null);
  useEffect(() => { setBatchApproval(false); }, [data?.scenes]);
  const [selectedId, setSelectedId] = useState('');
  useEffect(() => { setAllowFlowCredits(false); }, [selectedId, videoProvider]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState('');
  const [voices, setVoices] = useState<{ id: string; name: string; previewUrl?: string; language?: string }[]>([]);
  const [voiceId, setVoiceId] = useState('');
  const [voiceError, setVoiceError] = useState('');
  const [needsReload, setNeedsReload] = useState(false);
  const [preview, setPreview] = useState<VideoPreviewData | null>(null);
  const [renderJob, setRenderJob] = useState<RenderJob | null>(null);
  const lock = useRef(false);
  const [editorDirty, setEditorDirty] = useState(false);
  const autoFit = useRef('');
  const voiceDefaultsFor = useRef('');
  useEffect(() => {
    if (data && voices.length && voiceDefaultsFor.current !== data.project._id) {
      voiceDefaultsFor.current = data.project._id;
      setVoiceId(preferredNarrationVoice(voices, data.project.settings.language));
    }
  }, [data?.project._id, data?.project.settings.language, voices]);
  async function loadVoices() {
    setVoiceError('');
    try { const result = await api<{ providerId: string; voices: { id: string; name: string; previewUrl?: string; language?: string }[] }>('/narration/voices'); setVoices(result.voices); setVoiceId(previous => result.voices.some(v => v.id === previous) ? previous : preferredNarrationVoice(result.voices, 'en')); }
    catch (e) { setVoiceError(e instanceof Error ? e.message : 'Cannot load voices'); }
  }
  useEffect(() => { void loadVoices(); }, []);
  const load = useCallback(async () => {
    const { storyboard: board } = await api<{ storyboard: Storyboard }>('/storyboards/' + storyboardId);
    const { project } = await api<{ project: Project }>('/projects/' + board.projectId);
    const render = await api<{ job: RenderJob | null }>('/projects/' + project._id + '/video-render');
    setRenderJob(render.job);
    const batch = await api<{ job: BatchJob | null }>('/projects/' + project._id + '/media-batches/latest');
    setBatchJob(batch.job?.inputReference.storyboardId === storyboardId ? batch.job : null);
    if (project.storyboardId !== storyboardId || board.status !== 'approved') throw new Error('Approve the current storyboard before adding media.');
    const [list, media, videos] = await Promise.all([api<{ scenes: Scene[] }>('/projects/' + project._id + '/scenes'), api<{ assets: MediaAsset[] }>('/projects/' + project._id + '/media'), api<{ job: VideoJob | null }>('/projects/' + project._id + '/video-jobs/active')]);
    if (list.scenes.some(scene => scene.storyboardId !== storyboardId)) throw new Error('The storyboard changed. Open the current storyboard.');
    return { board, project, scenes: list.scenes, assets: media.assets, videoJob: videos.job };
  }, [storyboardId]);
  useEffect(() => {
    let active = true; setLoading(true); setData(null); setError('');
    load().then(result => { if (active) { setData(result); setSelectedId(result.scenes[0]?._id || ''); } }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [load]);
  const videoJobId = data?.videoJob?._id;
  const videoJobStatus = data?.videoJob?.status;
  useEffect(() => {
    if (batchJob?.status !== 'processing') return;
    let active = true; let timer: ReturnType<typeof setTimeout>;
    const id = batchJob._id;
    async function poll() {
      try {
        const { job } = await api<{ job: BatchJob }>('/media-batches/' + id);
        if (!active) return;
        setBatchJob(job);
        if (job.status !== 'processing') {
          const latest = await load();
          if (active) { setData(latest); setNotice(job.status === 'completed' ? 'Scenes generated. MP4 export has started.' : 'Batch finished with failures. Completed assets are saved.'); }
        } else timer = setTimeout(() => void poll(), 2000);
      } catch { if (active) setError('Cannot check batch progress. Reload media to reconnect; do not start another batch.'); }
    }
    timer = setTimeout(() => void poll(), 1000);
    return () => { active = false; clearTimeout(timer); };
  }, [batchJob?._id, batchJob?.status, load]);
  useEffect(() => {
    if (!videoJobId || videoJobStatus !== 'processing') return;
    let active = true; let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const { job } = await api<{ job: VideoJob }>('/video-jobs/' + videoJobId);
        if (!active) return;
        if (job.status === 'completed' || job.status === 'failed') {
          const latest = await load();
          if (!active) return;
          setData(latest);
          if (job.status === 'completed') setNotice('Scene video generated and saved.');
          else setError(job.error || 'Generation failed. Your previous visual is unchanged.');
          return;
        }
        setData(previous => previous ? { ...previous, videoJob: job } : previous);
        timer = setTimeout(() => void poll(), 2000);
      } catch (e) { if (active) setError('Unable to check generation progress. Reload media to reconnect.'); }
    }
    timer = setTimeout(() => void poll(), 1000);
    return () => { active = false; clearTimeout(timer); };
  }, [videoJobId, videoJobStatus, load]);
  useEffect(() => {
    if (renderJob?.status !== 'processing' || !data?.project._id) return;
    let active = true; let timer: ReturnType<typeof setTimeout>;
    const projectId = data.project._id;
    async function poll() {
      try {
        const { job } = await api<{ job: RenderJob | null }>('/projects/' + projectId + '/video-render');
        if (!active) return;
        setRenderJob(job);
        if (job?.status === 'completed') { const latest = await load(); if (active) { setData(latest); setNotice('Your final video is ready to download.'); } }
        else if (job?.status === 'failed') setError(job.error || 'Video export failed.');
        else timer = setTimeout(() => void poll(), 2000);
      } catch { if (active) setError('Unable to check video progress. Reload media to reconnect.'); }
    }
    timer = setTimeout(() => void poll(), 1000);
    return () => { active = false; clearTimeout(timer); };
  }, [renderJob?._id, renderJob?.status, data?.project._id, load]);
  useEffect(() => registerLeaveGuard(() => !lock.current && (!editorDirty || window.confirm('Discard unsaved scene edits?'))), [registerLeaveGuard, editorDirty]);
  useEffect(() => {
    if (!pending && !editorDirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    const click = (event: MouseEvent) => { if ((event.target as Element).closest?.('a[href]') && (pending || !window.confirm('Discard unsaved scene edits?'))) { event.preventDefault(); event.stopPropagation(); } };
    window.addEventListener('beforeunload', unload); document.addEventListener('click', click, true);
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', click, true); };
  }, [pending, editorDirty]);
  const selected = data?.scenes.find(scene => scene._id === selectedId);
  const member = memberships.find(item => item.workspace._id === data?.board.workspaceId);
  const videoGenerating = videoJobStatus === 'processing';
  const canEdit = Boolean(member && member.role !== 'viewer' && !needsReload && !videoGenerating && batchJob?.status !== 'processing' && renderJob?.status !== 'processing');
  // Existing projects may still carry narration from before exact fitting; align it once when the page opens.
  useEffect(() => {
    if (!data || !canEdit || pending || editorDirty || autoFit.current === data.project._id) return;
    const mismatch = data.scenes.some(scene => {
      if (scene.narrationOptional || !scene.voiceAssetId) return false;
      const duration = sceneMedia(scene, data.assets).audio?.duration;
      return Boolean(duration) && Math.abs((duration as number) - scene.duration) > 0.05;
    });
    if (!mismatch) return;
    autoFit.current = data.project._id;
    lock.current = true; setPending('Fitting saved narration');
    void (async () => {
      try {
        const result = await api<{ fitted: number; failed: number[] }>('/projects/' + data.project._id + '/media/fit-narration', { method: 'POST', body: '{}' });
        if (result.fitted) { setData(await load()); setNotice('Narration fitted to each scene length.' + (result.failed.length ? ' Some tracks could not be fitted; regenerate them.' : '')); }
      } catch (e) { setError(e instanceof Error ? e.message : 'Unable to fit narration'); }
      finally { lock.current = false; setPending(''); }
    })();
  }, [data, canEdit, pending, load, editorDirty]);
  async function saveEditing(draft: SceneDraft) {
    if (!selected || lock.current || !canEdit) return;
    lock.current = true; setPending('Saving scene edits'); setError('');
    try {
      await api('/scenes/' + selected._id + '/editor', { method: 'PATCH', body: JSON.stringify({ expectedUpdatedAt: selected.updatedAt, ...draft }) });
      setData(await load()); setEditorDirty(false); setNotice('Scene edits saved. Export MP4 to render these changes.');
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not save scene edits'); }
    finally { lock.current = false; setPending(''); }
  }
  async function editHistory(redo: boolean) {
    if (!selected || lock.current || !canEdit || editorDirty) return;
    lock.current = true; setPending(redo ? 'Restoring next edit' : 'Restoring previous edit'); setError('');
    try {
      await api('/scenes/' + selected._id + '/editor/' + (redo ? 'redo' : 'undo'), { method: 'POST', body: JSON.stringify({ expectedUpdatedAt: selected.updatedAt }) });
      setData(await load()); setNotice(redo ? 'Edit restored.' : 'Previous scene restored.');
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not restore scene'); }
    finally { lock.current = false; setPending(''); }
  }
  async function generateAll(retry = false) {
    if (!data || lock.current || !canEdit) return;
    if (data.scenes.length && data.scenes.every(scene => sceneMedia(scene, data.assets).ready)) { await generateVideo(); return; }
    const failed = retry ? new Set(batchJob?.inputReference.scenes.filter(scene => scene.narration !== 'ready' || scene.visual !== 'ready').map(scene => scene.sceneId)) : null;
    const missingVisuals = data.scenes.filter(scene => (!failed || failed.has(scene._id)) && !sceneMedia(scene, data.assets).hasVisual).length;
    const maxCredits = videoProvider === 'flow-local' ? missingVisuals * 10 : 0;
    if (maxCredits && !batchApproval) { setError('Approve the total Flow budget first.'); return; }
    lock.current = true; setPending('Starting media batch'); setError(''); setNotice('');
    // Consent is consumed even if the connection fails after the server starts the batch.
    setBatchApproval(false);
    try {
      const { job } = await api<{ job: BatchJob }>('/projects/' + data.project._id + '/media-batches', { method: 'POST', body: JSON.stringify({ storyboardId, voiceId, providerId: videoProvider, visualProviderId, maxCredits, autoExport: true, ...(retry && batchJob ? { retryJobId: batchJob._id } : {}) }) });
      setBatchJob(job);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to start batch. Reload media before retrying.'); setNeedsReload(true); }
    finally { lock.current = false; setPending(''); }
  }
  async function generateVideo() {
    if (!data || lock.current || !canEdit) return;
    lock.current = true; setPending('Starting video export'); setError(''); setNotice('');
    try { const { job } = await api<{ job: RenderJob }>('/projects/' + data.project._id + '/video-render', { method: 'POST', body: '{}' }); setRenderJob(job); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to export video'); }
    finally { lock.current = false; setPending(''); }
  }
  async function fitNarration() {
    if (!data || lock.current || !canEdit) return;
    lock.current = true; setPending('Fitting narration'); setError(''); setNotice('');
    try {
      const result = await api<{ fitted: number; failed: number[] }>('/projects/' + data.project._id + '/media/fit-narration', { method: 'POST', body: '{}' });
      setData(await load());
      setNotice(result.fitted ? `Fitted ${result.fitted} narration track${result.fitted === 1 ? '' : 's'} to the scene length.` : 'Narration already fits.');
      if (result.failed.length) setError('Could not fit narration for scene' + (result.failed.length === 1 ? ' ' : 's ') + result.failed.join(', ') + '. Regenerate them.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to fit narration'); }
    finally { lock.current = false; setPending(''); }
  }
  async function reload() {
    if (lock.current) return;
    lock.current = true; setPending('Refreshing'); setError('');
    try { setData(await load()); setNeedsReload(false); } catch (e) { setError(e instanceof Error ? e.message : 'Unable to reload'); }
    finally { lock.current = false; setPending(''); }
  }
  async function settings(change: { narrationOptional?: boolean; visualFit?: 'cover' | 'contain'; remove?: 'visual' | 'audio' }, message = 'Scene settings saved.') {
    if (!selected || lock.current || !canEdit) return;
    lock.current = true; setPending('Saving'); setError(''); setNotice('');
    try {
      const { scene } = await api<{ scene: Scene }>('/scenes/' + selected._id + '/media', { method: 'PATCH', body: JSON.stringify({ expectedUpdatedAt: selected.updatedAt, ...change }) });
      setData(previous => previous ? { ...previous, project: { ...previous.project, finalVideoAssetId: null }, scenes: previous.scenes.map(item => item._id === scene._id ? scene : item) } : previous);
      setNotice(message);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save'); setNeedsReload(true); }
    finally { lock.current = false; setPending(''); }
  }
  async function removeMedia(kind: 'visual' | 'audio') {
    if (!selected || lock.current || !canEdit) return;
    if (!window.confirm('Remove this ' + (kind === 'visual' ? 'scene video' : 'narration') + '? The exported video is cleared so you can rebuild it.')) return;
    await settings({ remove: kind }, kind === 'visual' ? 'Scene video removed. The exported video was cleared.' : 'Narration removed. The exported video was cleared.');
  }
  async function generateNarration() {
    if (!selected || !voiceId || lock.current || !canEdit) return;
    lock.current = true; setPending('Generating narration'); setError(''); setNotice('');
    try {
      await api('/scenes/' + selected._id + '/narration/generate', { method: 'POST', body: JSON.stringify({ expectedUpdatedAt: selected.updatedAt, voiceId: selected.editing?.voiceId || voiceId }) });
      setPending('Refreshing'); setData(await load()); setNotice('Narration generated and saved.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Narration failed'); setNeedsReload(true); }
    finally { lock.current = false; setPending(''); }
  }
  async function openPreview() {
    if (lock.current || needsReload || videoGenerating) return;
    lock.current = true; setPending('Preparing Remotion preview'); setError(''); setNotice('');
    try {
      const latest = await load();
      setData(latest);
      setPreview(buildVideoPreview(latest.project, latest.scenes, latest.assets));
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to open preview'); }
    finally { lock.current = false; setPending(''); }
  }
  async function generateClip() {
    if (!selected || lock.current || !canEdit) return;
    if (videoProvider === 'remotion') {
      const replaceEdits = Boolean(selected.editing?.heading);
      if (replaceEdits && !window.confirm('Ask Gemini to redesign this scene? This uses API quota and replaces saved visual edits. Narration and captions stay. Undo can restore the previous scene.')) return;
      lock.current = true; setPending('Designing custom visuals with Gemini'); setError('');
      try {
        await api('/scenes/' + selected._id + '/explainer/generate', { method: 'POST', body: JSON.stringify({ expectedUpdatedAt: selected.updatedAt, replaceEdits, visualProviderId }) });
        setData(await load()); setNotice('Custom Gemini design saved. Preview and export run locally with Remotion.');
      } catch (error) { setError(error instanceof Error ? error.message : 'Cannot prepare scene'); }
      finally { lock.current = false; setPending(''); }
      return;
    }
    if (videoProvider === 'flow-local' && !allowFlowCredits) { setError('Approve the Flow credit limit before generating this scene.'); return; }
    if (videoProvider === 'flow-local' && !['16:9', '9:16'].includes(data!.project.settings.aspectRatio)) { setError('Google Flow video supports landscape (16:9) and portrait (9:16) projects.'); return; }
    lock.current = true; setPending('Starting free video generation'); setError(''); setNotice('');
    try {
      const { job } = await api<{ job: VideoJob }>('/scenes/' + selected._id + '/video/generate', { method: 'POST', body: JSON.stringify({ expectedUpdatedAt: selected.updatedAt, providerId: videoProvider, maxCredits: videoProvider === 'flow-local' ? 10 : 0 }) });
      setData(previous => previous ? { ...previous, videoJob: job } : previous);
      setAllowFlowCredits(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to start video generation'); }
    finally { lock.current = false; setPending(''); }
  }
  if (loading) return <div className="state-panel" role="status">Opening scene media…</div>;
  if (!data) return <div className="state-panel"><p className="error" role="alert">{error}</p><Link className="secondary-button" href={'/storyboards/' + storyboardId}>Back to storyboard</Link></div>;
  const total = data.scenes.reduce((sum, scene) => sum + sceneDuration(scene, data.assets), 0);
  const count = data.scenes.filter(scene => sceneMedia(scene, data.assets).ready).length;
  const current = selected ? sceneMedia(selected, data.assets) : null;
  const disabled = !canEdit || Boolean(pending) || editorDirty;
  const flowEnabled = providers.some(provider => provider.id === 'flow-local' && provider.enabled);
  const failedIds = new Set(batchJob?.inputReference.scenes.filter(scene => scene.narration !== 'ready' || scene.visual !== 'ready').map(scene => scene.sceneId));
  const batchMissing = data.scenes.filter(scene => batchJob?.status !== 'failed' || failedIds.has(scene._id));
  const batchCredits = videoProvider === 'flow-local' ? batchMissing.filter(scene => !sceneMedia(scene, data.assets).hasVisual).length * 10 : 0;
  const hasMissing = batchMissing.some(scene => { const media = sceneMedia(scene, data.assets); return !media.hasVisual || !media.timing; });
  const sampleVoice = voices.find(voice => voice.id === voiceId);
  const mismatch = data.scenes.some(scene => {
    if (scene.narrationOptional || !scene.voiceAssetId) return false;
    const duration = sceneMedia(scene, data.assets).audio?.duration;
    return Boolean(duration) && Math.abs((duration as number) - scene.duration) > 0.05;
  });
  return <div className="media-editor">
    <Link className="text-link" href={'/storyboards/' + storyboardId}><ArrowLeft size={15} /> Storyboard</Link>
    <header className="media-page-heading"><h1>Create your video</h1><p>{count} of {data.scenes.length} scenes ready · {Math.round(total)} seconds</p></header>
    <section className="media-card" aria-label="Generate all scene media">
      <div className="video-options">
        <label>Video provider<select aria-label="Video provider" value={videoProvider} disabled={disabled} onChange={event => setVideoProvider(event.target.value as 'remotion' | 'ltx-free' | 'flow-local')}><option value="remotion">Remotion · custom Gemini visuals</option><option value="ltx-free">LTX · free shared demo</option><option value="flow-local" disabled={!flowEnabled}>Google Flow{!flowEnabled ? ' (disabled)' : ''}</option></select></label>
        <label>Narration voice<select aria-label="Narration voice" value={voiceId} disabled={disabled || !voices.length} onChange={event => setVoiceId(event.target.value)}><option value="" disabled>Select voice</option>{voices.map(voice => <option key={voice.id} value={voice.id}>{voice.name}</option>)}</select></label>
      </div>
      {sampleVoice?.previewUrl && <VoiceSamplePlayer key={voiceId} name={sampleVoice.name} src={sampleVoice.previewUrl} />}
      {videoProvider === 'remotion' && <><label>Visual design model<select aria-label="Visual design model" value={visualProviderId} disabled={disabled} onChange={event => setVisualProviderId(event.target.value)}>{providers.filter(provider => provider.enabled && provider.capabilities.includes('llm') && provider.id !== 'mock-ai').map(provider => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label><p className="media-hint">The selected model or AI team designs custom illustrations and motion. Team mode shares a Gemma plan with Gemini, then Nemotron reviews it; at most one correction pass. Remotion renders them locally. Saved designs, edits, preview and export use no additional Gemini requests. No automatic retries.</p></>}
      {videoProvider === 'flow-local' && <p className="media-hint">Keep your signed-in Flow project open on the PC. To change accounts, use the Google account menu in that dedicated Chrome window, then open a project again. Studio uses that session. One clip per scene; no automatic retries.</p>}
      {batchCredits > 0 && <label><input type="checkbox" checked={batchApproval} disabled={disabled} onChange={event => setBatchApproval(event.target.checked)} /> Allow up to {batchCredits} Flow credits for {batchCredits / 10} missing clips</label>}
      <button className="primary-button" disabled={disabled || !data.scenes.length || (hasMissing && !voiceId) || Boolean(batchCredits && !batchApproval)} onClick={() => void generateAll(batchJob?.status === 'failed')}>{renderJob?.status === 'processing' ? 'Exporting…' : batchJob?.status === 'processing' ? 'Generating…' : batchJob?.status === 'failed' && hasMissing ? 'Retry failed scenes' : 'Generate & export MP4'}</button>
      {voiceError && <p className="error">{voiceError} <button className="text-button" onClick={() => void loadVoices()}>Reload voices</button></p>}
      {batchJob?.status === 'processing' && <progress aria-label="Batch media progress" max={100} value={batchJob.progress} />}
      {renderJob?.status === 'processing' && <progress aria-label="MP4 export progress" max={100} value={renderJob.progress} />}
      {batchJob?.error && !data.project.finalVideoAssetId && <p className="error">{batchJob.error}</p>}
    </section>
    <div className="media-grid">
      <aside className="media-card"><nav className="media-scene-list" aria-label="Scene media">{data.scenes.map(scene => {
        const state = sceneMedia(scene, data.assets);
        const progress = batchJob?.inputReference.scenes.find(item => item.sceneId === scene._id);
        return <button type="button" key={scene._id} disabled={Boolean(pending)} aria-current={scene._id === selectedId ? 'true' : undefined} className={'media-scene-item' + (scene._id === selectedId ? ' selected' : '')} onClick={() => { if (!editorDirty || window.confirm('Discard unsaved scene edits?')) { setEditorDirty(false); setSelectedId(scene._id); } }}><Film size={18} /><span className="media-scene-copy"><strong>{scene.sceneNumber}. {scene.title}</strong><span className="media-status">{state.ready ? 'Ready' : !state.hasVisual ? 'Needs video' : 'Needs narration'} · {Math.round(sceneDuration(scene, data.assets) * 10) / 10}s</span>{batchJob?.status === 'processing' && progress && <small>Video: {progress.visual} · Voice: {progress.narration}</small>}{progress?.error && <small className="error">{progress.error}</small>}</span></button>;
      })}</nav></aside>
      {selected && current && <section className="media-card media-main-column">
        <h2>{selected.title}</h2>
        <SceneEditingPanel key={selected._id} scene={selected} project={data.project} assets={data.assets} voices={voices} disabled={!canEdit || Boolean(pending)} onDirty={setEditorDirty} onSave={saveEditing} onHistory={editHistory} />
        {videoGenerating && <p role="status">Generating video · {data.videoJob?.progress || 0}%</p>}
        {videoProvider === 'flow-local' && <label><input type="checkbox" checked={allowFlowCredits} disabled={disabled} onChange={event => setAllowFlowCredits(event.target.checked)} /> Allow up to 10 Flow credits for this scene</label>}
        <button className="secondary-button" disabled={disabled || (videoProvider !== 'remotion' && !selected.visualDescription?.trim()) || (videoProvider === 'flow-local' && !allowFlowCredits)} onClick={() => void generateClip()}>{videoProvider === 'remotion' ? (selected.editing?.visualPlan ? 'Redesign visuals with Gemini' : 'Generate custom visuals with Gemini') : current.hasVisual ? 'Regenerate scene video' : 'Generate scene video'}</button>
        {current.hasVisual && <div className="media-remove-row"><button className="text-button danger" disabled={disabled} onClick={() => void removeMedia('visual')}>Remove video</button></div>}
        <div className="media-audio"><h3>Narration</h3>{current.audio && <VoiceSamplePlayer key={current.audio._id} name={selected.title} src={mediaUrl(current.audio)} sample={false} />}{current.audio?.duration && <p className="media-hint">Narration {current.audio.duration.toFixed(1)}s · Scene {selected.duration.toFixed(1)}s</p>}<label><input type="checkbox" checked={selected.narrationOptional || false} disabled={disabled} onChange={event => void settings({ narrationOptional: event.target.checked })} /> Silent scene</label><div className="media-remove-row"><button className="secondary-button" disabled={disabled || !(selected.editing?.voiceId || voiceId) || !selected.narration?.trim() || selected.narrationOptional} onClick={() => void generateNarration()}>{current.audio ? 'Regenerate narration' : 'Generate narration'}</button>{current.audio && <button className="text-button danger" disabled={disabled} onClick={() => void removeMedia('audio')}>Remove narration</button>}</div></div>
      </section>}
    </div>
    <div aria-live="polite" className="media-feedback">{pending && <p role="status">{pending}…</p>}{notice && <p className="success-message">{notice}</p>}{error && <p className="error" role="alert">{error}</p>}{(needsReload || error) && <button className="text-button" disabled={Boolean(pending)} onClick={() => void reload()}>Reload</button>}</div>
    <section className="media-card video-export" aria-label="Final video export">
      <div className="video-export-heading"><h2>Final video</h2><span className="badge">Remotion</span></div>
      <p className="media-hint">Preview plays this Remotion composition live. Export renders the same scenes, transitions, titles and captions to MP4 with Remotion.</p>
      {mismatch && <p>Narration and video lengths do not match yet. <button className="text-button" disabled={disabled} onClick={() => void fitNarration()}>Fit narration to scene length</button></p>}
      <button className="secondary-button" disabled={disabled || count !== data.scenes.length || !data.scenes.length} onClick={() => void openPreview()}>Preview in Remotion</button>
      <button className="primary-button" disabled={disabled || count !== data.scenes.length || !data.scenes.length} onClick={() => void generateVideo()}>{renderJob?.status === 'processing' ? 'Rendering with Remotion…' : 'Export MP4 with Remotion'}</button>
      {data.project.finalVideoAssetId && <a className="secondary-button" href={'/api/v1/media/' + data.project.finalVideoAssetId + '/download'}>Download MP4</a>}
      {renderJob?.status === 'processing' && <><progress aria-label="Video export" max={100} value={renderJob.progress} /><p role="status">Remotion render · {Math.round(renderJob.progress)}%</p></>}{renderJob?.status === 'failed' && <p className="error">{renderJob.error}</p>}
    </section>
    {preview && <VideoPreview video={preview} onClose={() => setPreview(null)} />}
  </div>;
}
