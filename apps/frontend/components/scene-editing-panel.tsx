'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import { sceneEditingDefaults, type SceneEditing } from '@ai-video-studio/shared-types';
import type { MediaAsset, Project, Scene } from '../lib/api';
import { buildVideoPreview } from '../lib/video-preview';
import { VideoComposition } from './video-composition';
import { MotionTrackEditor } from './motion-track-editor';
import { CollaborationSummary } from './collaboration-summary';

export type SceneDraft = { editing: SceneEditing; narration: string; visualDescription: string };
type Props = {
  scene: Scene; project: Project; assets: MediaAsset[];
  voices: { id: string; name: string }[]; disabled: boolean;
  onDirty: (dirty: boolean) => void;
  onSave: (draft: SceneDraft) => Promise<void>;
  onHistory: (redo: boolean) => Promise<void>;
};

function initialDraft(scene: Scene, project: Project): SceneDraft {
  const editing = sceneEditingDefaults(scene);
  editing.captionsEnabled = scene.editing?.captionsEnabled ?? project.settings.subtitlesEnabled !== false;
  return { editing, narration: scene.narration || '', visualDescription: scene.visualDescription || '' };
}

export function SceneEditingPanel({ scene, project, assets, voices, disabled, onDirty, onSave, onHistory }: Props) {
  const saved = useMemo(() => initialDraft(scene, project), [scene, project]);
  const [draft, setDraft] = useState(saved);
  const [tab, setTab] = useState<'visual' | 'voice' | 'captions'>('visual');
  const player = useRef<PlayerRef>(null);
  const [timeMs, setTimeMs] = useState(0);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  useEffect(() => { setDraft(saved); }, [saved]);
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  const edit = draft.editing;
  function set<K extends keyof SceneEditing>(key: K, value: SceneEditing[K]) { setDraft(previous => ({ ...previous, editing: { ...previous.editing, [key]: value } })); }
  const audioChanged = draft.narration !== (scene.narration || '') || edit.voiceId !== (scene.editing?.voiceId || '');
  const preview = useMemo(() => {
    try {
      // A draft can preview visuals before narration exists. Saved exports still require complete media.
      const copy: Scene = { ...scene, editing: draft.editing, narration: draft.narration, visualDescription: draft.visualDescription };
      if (draft.editing.visualPlan && draft.editing.visualMode === 'remotion' && !copy.motionGraphics?.some(item => item.type === 'remotion-explainer')) copy.motionGraphics = [{ type: 'remotion-explainer', properties: { points: draft.editing.points, layout: draft.editing.layout } }];
      const audio = assets.find(asset => asset._id === copy.voiceAssetId);
      if (audioChanged || !audio?.duration || Math.abs(audio.duration - scene.duration) > .05) copy.narrationOptional = true;
      return { video: buildVideoPreview(project, [copy], assets) };
    } catch (error) { return { error: error instanceof Error ? error.message : 'Preview unavailable' }; }
  }, [scene, project, assets, draft, audioChanged]);
  useEffect(() => {
    const current = player.current;
    if (!current) return;
    const update = (event: { detail: { frame: number } }) => { if (event.detail.frame % Math.max(1, Math.round(project.settings.fps / 5)) === 0) setTimeMs(Math.round(event.detail.frame / project.settings.fps * 1000)); };
    current.addEventListener('frameupdate', update);
    return () => current.removeEventListener('frameupdate', update);
  }, [preview.video?.durationInFrames, project.settings.fps]);
  const clip = assets.find(asset => scene.visualAssetIds?.includes(asset._id) && asset.type === 'video');
  const number = (label: string, key: keyof SceneEditing, min: number, max: number, step = .1) => <label>{label}<input type="number" min={min} max={max} step={step} value={edit[key] as number} onChange={event => set(key, Number(event.target.value))} /></label>;
  const color = (label: string, key: 'background' | 'accent' | 'textColor' | 'captionColor' | 'captionBackground') => <label>{label}<input type="color" value={edit[key]} onChange={event => set(key, event.target.value)} /></label>;
  const volume = (label: string, key: 'narrationVolume' | 'originalVolume') => <label>{label}: {Math.round(edit[key] * 100)}%<input type="range" min="0" max="1" step=".05" value={edit[key]} onChange={event => set(key, Number(event.target.value))} /></label>;
  return <div className="scene-inline-editor">
    <CollaborationSummary review={scene.motionGraphics?.find(item => item.type === 'remotion-explainer')?.properties.collaboration} />
    {preview.video ? <Player ref={player} component={VideoComposition} inputProps={{ video: preview.video }} durationInFrames={preview.video.durationInFrames} compositionWidth={preview.video.width} compositionHeight={preview.video.height} fps={preview.video.fps} controls showVolumeControls style={{ width: '100%', aspectRatio: `${preview.video.width}/${preview.video.height}`, maxHeight: 480, background: '#181d18', borderRadius: 10 }} errorFallback={() => <p className="error">Could not play this asset. Reload media.</p>} /> : <p className="media-hint" role="status">{preview.error} Choose Remotion below, or generate a clip.</p>}
    {edit.visualPlan && <label className="media-hint">Animation position: {(timeMs / 1000).toFixed(2)}s<input aria-label="Animation position" type="range" min={0} max={Math.max(0, scene.duration * 1000 - 1000 / project.settings.fps)} step={Math.round(1000 / project.settings.fps)} value={timeMs} onChange={event => { const at = Number(event.target.value); setTimeMs(at); player.current?.seekTo(Math.round(at / 1000 * project.settings.fps)); }} /></label>}
    <p className="media-hint">Live preview · {scene.duration}s. Edits apply to this scene only. Save before exporting.</p>
    {audioChanged && <p role="status">Save and regenerate narration to hear the changed text or voice. Existing narration is muted in this draft.</p>}
    <div className="scene-editor-tabs" role="group" aria-label="Scene editing sections">{(['visual', 'voice', 'captions'] as const).map(item => <button type="button" className="secondary-button" key={item} aria-pressed={tab === item} onClick={() => setTab(item)}>{item === 'voice' ? 'Narration' : item === 'visual' ? 'Visual' : 'Captions'}</button>)}</div>
    <fieldset disabled={disabled} className="scene-editor-fields">
      {tab === 'visual' && <>
        <label>Scene visual<select value={edit.visualMode} onChange={event => set('visualMode', event.target.value as SceneEditing['visualMode'])}><option value="remotion">Remotion animated explainer</option><option value="clip">Generated video clip{!clip ? ' (not generated yet)' : ''}</option></select></label>
        <label>Heading<input maxLength={180} value={edit.heading} onChange={event => set('heading', event.target.value)} /></label>
        {edit.visualMode === 'remotion' ? <>
          {edit.visualPlan ? <>
            <p className="media-hint">Custom Gemini design: {edit.visualPlan.description}. Saved artwork previews and exports locally without another Gemini request.</p>
            <MotionTrackEditor label="Camera pan and zoom" frames={edit.visualPlan.camera} duration={scene.duration} timeMs={timeMs} onChange={camera => set('visualPlan', { ...edit.visualPlan!, camera })} />
            <details><summary>Object groups ({edit.visualPlan.groups?.length || 0})</summary>
              <button type="button" className="secondary-button" disabled={(edit.visualPlan.groups?.length || 0) >= 12} onClick={() => { const groups = edit.visualPlan!.groups || []; let id = 'group-1'; let number = 1; while (groups.some(group => group.id === id)) id = 'group-' + ++number; set('visualPlan', { ...edit.visualPlan!, groups: [...groups, { id, pivotX: edit.visualPlan!.width / 2, pivotY: edit.visualPlan!.height / 2, keyframes: [] }] }); }}>Add group</button>
              {edit.visualPlan.groups?.map((group, index) => <div key={group.id}><p>{group.id}</p><div className="scene-editor-row">{(['pivotX', 'pivotY'] as const).map(key => <label key={key}>{key}<input type="number" min={-2000} max={2000} value={group[key]} onChange={event => set('visualPlan', { ...edit.visualPlan!, groups: edit.visualPlan!.groups!.map((item, i) => i === index ? { ...item, [key]: Number(event.target.value) } : item) })} /></label>)}</div><MotionTrackEditor label="Group motion" frames={group.keyframes} duration={scene.duration} timeMs={timeMs} onChange={keyframes => set('visualPlan', { ...edit.visualPlan!, groups: edit.visualPlan!.groups!.map((item, i) => i === index ? { ...item, keyframes } : item) })} /><button type="button" className="text-button danger" onClick={() => set('visualPlan', { ...edit.visualPlan!, groups: edit.visualPlan!.groups!.filter(item => item.id !== group.id), elements: edit.visualPlan!.elements.map(item => item.groupId === group.id ? { ...item, groupId: '' } : item) })}>Remove group</button></div>)}
            </details>
            <details><summary>Edit generated objects ({edit.visualPlan.elements.length})</summary>{edit.visualPlan.elements.map((element, index) => <details key={element.id}><summary>{element.text || element.id} ({element.kind})</summary><div className="scene-editor-fields">
              <label>Group<select value={element.groupId || ''} onChange={event => set('visualPlan', { ...edit.visualPlan!, elements: edit.visualPlan!.elements.map((item, i) => i === index ? { ...item, groupId: event.target.value } : item) })}><option value="">Independent object</option>{edit.visualPlan!.groups?.map(group => <option key={group.id} value={group.id}>{group.id}</option>)}</select></label>
              <MotionTrackEditor label="Object keyframes" frames={element.keyframes} duration={scene.duration} timeMs={timeMs} onChange={keyframes => set('visualPlan', { ...edit.visualPlan!, elements: edit.visualPlan!.elements.map((item, i) => i === index ? { ...item, keyframes } : item) })} />
              {element.kind === 'text' && <label>Object label<input maxLength={100} value={element.text || ''} onChange={event => set('visualPlan', { ...edit.visualPlan!, elements: edit.visualPlan!.elements.map((item, i) => i === index ? { ...item, text: event.target.value } : item) })} /></label>}
              <div className="scene-editor-row">{(['x', 'y', ...(element.kind === 'rect' || element.kind === 'ellipse' ? ['width', 'height'] : []), ...(element.kind === 'text' ? ['fontSize'] : [])] as const).map(key => <label key={key}>{key}<input type="number" value={element[key as 'x' | 'y' | 'width' | 'height' | 'fontSize'] ?? ''} onChange={event => set('visualPlan', { ...edit.visualPlan!, elements: edit.visualPlan!.elements.map((item, i) => i === index ? { ...item, [key]: Number(event.target.value) } : item) })} /></label>)}</div>
              <label>Object color<input type="color" value={element.fill === 'none' ? '#ffffff' : element.fill} onChange={event => set('visualPlan', { ...edit.visualPlan!, elements: edit.visualPlan!.elements.map((item, i) => i === index ? { ...item, fill: event.target.value } : item) })} /></label>
            </div></details>)}</details>
          </> : scene.motionGraphics?.some(item => item.type === 'remotion-explainer') ? <>
          <label>Layout<select value={edit.layout} onChange={event => set('layout', event.target.value as SceneEditing['layout'])}><option value="concept">Concept cards</option><option value="steps">Steps</option><option value="comparison">Comparison</option></select></label>
          <label>Points (one per line, up to 3)<textarea rows={3} maxLength={602} value={edit.points.join('\n')} onChange={event => set('points', event.target.value.split('\n').slice(0, 3))} /></label>
          <label>Diagram<select value={edit.illustration} onChange={event => set('illustration', event.target.value as SceneEditing['illustration'])}><option value="none">Generic explainer</option><option value="sunlight">Sunlight</option><option value="panel">Solar panel</option><option value="home">Home energy</option></select></label>
          {edit.illustration !== 'none' && edit.diagramLabels.map((label, index) => <label key={index}>Diagram label {index + 1}<input maxLength={60} value={label} onChange={event => set('diagramLabels', edit.diagramLabels.map((value, i) => i === index ? event.target.value : value))} /></label>)}
          </> : <p className="media-hint">Generate custom visuals below. Gemini will design this scene from your narration and generation direction.</p>}
          <div className="scene-editor-row">{color('Background', 'background')}{color('Accent', 'accent')}{color('Text', 'textColor')}</div>
          {number('Animation speed', 'animationSpeed', .5, 2)}
        </> : <>
          <p className="media-hint">Original clip: {clip?.duration?.toFixed(2) || 'unknown'}s. Trim and crop preserve the source file.</p>
          <div className="scene-editor-row">{number('Trim start (seconds)', 'clipStart', 0, clip?.duration || 600, .01)}<label>Trim end (seconds; empty uses full clip)<input type="number" min="0.01" max={clip?.duration || 600} step=".01" value={edit.clipEnd ?? ''} onChange={event => set('clipEnd', event.target.value === '' ? null : Number(event.target.value))} /></label></div>
          <label><input type="checkbox" checked={edit.fitClipToScene} onChange={event => set('fitClipToScene', event.target.checked)} /> Fit trimmed clip to {scene.duration}s</label>
          {!edit.fitClipToScene && <>{number('Playback speed', 'clipSpeed', .25, 4)}<p className="media-hint">Short clips hold the last frame. Long clips stop at the scene end.</p></>}
          <label>Frame fit<select value={edit.visualFit} onChange={event => set('visualFit', event.target.value as SceneEditing['visualFit'])}><option value="cover">Fill frame (crop edges)</option><option value="contain">Show whole clip</option></select></label>
          <div className="scene-editor-row">{number('Horizontal crop (%)', 'cropX', 0, 100, 1)}{number('Vertical crop (%)', 'cropY', 0, 100, 1)}</div>
          <label><input type="checkbox" checked={edit.originalAudioMuted} onChange={event => set('originalAudioMuted', event.target.checked)} /> Mute clip sound</label>
          {!edit.originalAudioMuted && volume('Clip volume', 'originalVolume')}
        </>}
        <label>Generation direction<textarea rows={3} maxLength={5000} value={draft.visualDescription} onChange={event => setDraft(previous => ({ ...previous, visualDescription: event.target.value }))} /></label>
        <p className="media-hint">Saving direction does not regenerate a clip or use provider credits.</p>
      </>}
      {tab === 'voice' && <>
        <label>Narration text<textarea rows={5} maxLength={10000} value={draft.narration} onChange={event => setDraft(previous => ({ ...previous, narration: event.target.value }))} /></label>
        <label>Voice for this scene<select value={edit.voiceId} onChange={event => set('voiceId', event.target.value)}><option value="">Use project voice when generating</option>{voices.map(voice => <option value={voice.id} key={voice.id}>{voice.name}</option>)}</select></label>
        {volume('Narration volume', 'narrationVolume')}
        <p className="media-hint">Text or voice changes require regenerating this scene’s narration. Volume changes keep the recording.</p>
      </>}
      {tab === 'captions' && <>
        <label><input type="checkbox" checked={edit.captionsEnabled} onChange={event => set('captionsEnabled', event.target.checked)} /> Show captions</label>
        <label>Caption text (empty follows narration)<textarea rows={4} maxLength={10000} value={edit.captionText} onChange={event => set('captionText', event.target.value)} /></label>
        {number('Caption size', 'captionSize', 18, 80, 1)}
        <label>Position<select value={edit.captionPosition} onChange={event => set('captionPosition', event.target.value as SceneEditing['captionPosition'])}><option value="top">Top</option><option value="center">Center</option><option value="bottom">Bottom</option></select></label>
        <div className="scene-editor-row">{color('Caption text', 'captionColor')}{color('Caption background', 'captionBackground')}</div>
        <p className="media-hint">Caption timing is estimated across the scene duration.</p>
      </>}
    </fieldset>
    <div className="scene-editor-actions"><button type="button" className="primary-button" disabled={disabled || !dirty} onClick={() => void onSave(draft)}>Save edits</button><button type="button" className="secondary-button" disabled={disabled || !dirty} onClick={() => setDraft(saved)}>Discard edits</button><button type="button" className="text-button" disabled={disabled || dirty || !scene.editHistory?.length} onClick={() => void onHistory(false)}>Undo</button><button type="button" className="text-button" disabled={disabled || dirty || !scene.editRedo?.length} onClick={() => void onHistory(true)}>Redo</button></div>
    <p className="media-hint">{dirty ? 'Unsaved changes' : 'Saved'} · Undo keeps the last 10 saved scene states, including generated media.</p>
  </div>;
}
