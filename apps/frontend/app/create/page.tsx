'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronDown, ChevronRight, FileText, PenLine } from 'lucide-react';
import { ScriptContent, useStudio } from '../../components/studio';
import { api, type Project, type Script } from '../../lib/api';
import { creationStorage, emptyCreationDraft, persistCreationDraft, restoreCreationDraft, type CreationDraft } from '../../lib/creation-draft';

type Draft = CreationDraft;
const defaults = emptyCreationDraft;
const examples = [
  ['Explain a complex topic', 'Explain artificial intelligence to beginners. Cover what it is, how it learns from examples, and one practical everyday use.'],
  ['Introduce a product', 'Introduce a productivity app for small teams. Explain the problem it solves, its three main benefits, and how to get started.'],
  ['Teach a practical skill', 'Teach beginners how to plan a productive day, with three practical steps and a clear example for each.'],
];

export default function CreateVideo() {
  const router = useRouter();
  const { workspaceId, user, providers, memberships, refreshProjects } = useStudio();
  const [draft, setDraft] = useState<Draft>(defaults);
  const [project, setProject] = useState<Project | null>(null);
  const [script, setScript] = useState<Script | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [restoring, setRestoring] = useState(true);
  const [loadedKey, setLoadedKey] = useState('');
  const activeRequest = useRef(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const storageKey = `studio:create:${user?._id}:${workspaceId}`;
  const canEdit = memberships.find(m => m.workspace._id === workspaceId)?.role !== 'viewer';
  const available = providers.filter(p => p.enabled && p.capabilities.includes('llm'));
  const providerReady = draft.providerId ? available.some(p => p.id === draft.providerId) : available.some(p => p.id !== 'mock-ai');
  useEffect(() => {
    let active = true;
    setRestoring(true); setError(''); setProject(null); setScript(null); setDraft(defaults);
    restoreCreationDraft(creationStorage(), storageKey, new URLSearchParams(window.location.search),
      async id => (await api<{ project: Project }>('/projects/' + encodeURIComponent(id))).project).then(async result => {
        if (!active) return;
        setProject(result.project);
        setDraft(result.draft);
        if (result.scriptId) {
          const resultScript = await api<{ script: Script }>('/scripts/' + result.scriptId);
          if (active) setScript(resultScript.script);
        }
      }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) { setLoadedKey(storageKey); setRestoring(false); } });
    return () => { active = false; };
  }, [storageKey]);
  useEffect(() => {
    if (!restoring && loadedKey === storageKey) {
      persistCreationDraft(creationStorage(), storageKey, draft, project, Boolean(script));
    }
  }, [draft, project, script, storageKey, restoring, loadedKey]);
  function change(key: keyof Draft, value: string) { setDraft(current => ({ ...current, [key]: value })); }
  async function generate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (activeRequest.current) return;
    if (!providerReady) { setError('Select an enabled text provider in Advanced settings before generating.'); return; }
    activeRequest.current = true; setPending(true); setError('');
    try {
      const settings = { duration: Number(draft.duration), aspectRatio: draft.aspectRatio, language: draft.language, style: draft.style };
      let current = project;
      if (!current) {
        current = (await api<{ project: Project }>(`/workspaces/${workspaceId}/projects`, { method: 'POST', body: JSON.stringify({ title: draft.title.trim(), creationType: 'prompt', settings }) })).project;
        setProject(current);
        try { sessionStorage.setItem(storageKey, JSON.stringify({ draft, projectId: current._id })); } catch { /* Keep the created project in React state. */ }
      } else {
        current = (await api<{ project: Project }>('/projects/' + current._id, { method: 'PATCH', body: JSON.stringify({ title: draft.title.trim(), settings }) })).project;
        setProject(current);
      }
      const result = await api<{ script: Script }>(`/projects/${current._id}/scripts/generate`, { method: 'POST', body: JSON.stringify({ prompt: draft.prompt.trim(), language: draft.language, ...(draft.providerId ? { providerId: draft.providerId } : {}) }) });
      setScript(result.script); setProject({ ...current, scriptId: result.script._id });
      persistCreationDraft(creationStorage(), storageKey, draft, current, true);
      void refreshProjects().catch(() => {});
      router.push('/scripts/' + result.script._id);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to generate your script.'); }
    finally { activeRequest.current = false; setPending(false); }
  }
  return <>
    <nav className="breadcrumbs" aria-label="Breadcrumb"><Link href="/">Overview</Link><span>/</span><span aria-current="page">Create video</span></nav>
    <section className="create-heading"><span className="eyebrow">Production workspace</span><h1>Bring your idea to life.</h1><p>Describe your video. Start with a script you can review and refine.</p></section>
    <div className="method-tabs" aria-label="Creation method"><span className="selected-tab"><PenLine size={18} />Start with a prompt</span><button disabled title="Script import is not available yet"><FileText size={18} />Use a script <small>Soon</small></button></div>
    <form onSubmit={generate} className="creation-form" aria-busy={pending || restoring}>
      <fieldset disabled={pending || restoring || !canEdit || Boolean(script)}>
        <label className="field-label" htmlFor="project-title">Project name</label><input id="project-title" className="project-name-input" value={draft.title} onChange={e => change('title', e.target.value)} placeholder="Give your video a name" required maxLength={300} />
        <div className="idea-label"><label className="field-label" htmlFor="video-idea">Video idea</label><small>Tell us the topic and who it’s for</small></div>
        <textarea ref={textarea} id="video-idea" value={draft.prompt} onChange={e => change('prompt', e.target.value)} placeholder="What should your video explain? Tell us the topic, audience and key points." required minLength={5} maxLength={10000} />
        <div className="prompt-examples"><span>Try starting with:</span>{examples.map(([label, prompt]) => <button type="button" className="example-chip" key={label} onClick={() => { change('prompt', prompt); textarea.current?.focus(); }}>{label}</button>)}</div>
        <div className="preferences-heading"><span className="field-label">Video preferences</span><span /></div>
        <div className="preferences-grid">
          <Select label="Target duration" value={draft.duration} onChange={value => change('duration', value)} options={[["30", "30 seconds"], ["60", "60 seconds"], ["120", "2 minutes"], ["300", "5 minutes"]]} />
          <Select label="Aspect ratio" value={draft.aspectRatio} onChange={value => change('aspectRatio', value)} options={[["16:9", "16:9 · Landscape"], ["9:16", "9:16 · Portrait"], ["1:1", "1:1 · Square"], ["4:5", "4:5 · Portrait"]]} />
          <Select label="Language" value={draft.language} onChange={value => change('language', value)} options={[["en", "English"], ["hi", "Hindi"], ["te", "Telugu"], ["ta", "Tamil"], ["kn", "Kannada"]]} />
          <Select label="Visual style" value={draft.style} onChange={value => change('style', value)} options={[["animated-explainer", "Animated explainer"], ["minimal", "Minimal"], ["educational", "Educational"], ["corporate", "Corporate"]]} />
        </div>
        <details className="advanced-settings"><summary><ChevronRight size={17} />Advanced settings</summary><label>Text provider<select value={draft.providerId} onChange={e => change('providerId', e.target.value)}><option value="">Configured default</option>{available.map(p => <option key={p.id} value={p.id}>{p.name}{p.id === 'mock-ai' ? ' (test content)' : ''}</option>)}</select></label><p>Provider selection applies to script generation.</p></details>
        <div className="generate-row"><button className="primary-button" disabled={!providerReady} type="submit">{pending ? 'Generating script…' : 'Generate script'}<ArrowRight size={19} /></button><p>You’ll review and approve the script before creating scenes.</p></div>
      </fieldset>
      {restoring && <p role="status">Opening your draft…</p>}
      {!canEdit && <p role="status">You have view-only access to this workspace.</p>}
      {!available.length && <p className="provider-notice">No text provider is enabled. Your draft stays in this browser tab until a provider is configured.</p>}
      {available.length > 0 && !providerReady && <p className="provider-notice">Choose an enabled provider in Advanced settings. The mock provider generates test content only.</p>}
      {pending && <p role="status">Your project is saved. Waiting for the configured provider…</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </form>
    <p className="provider-disclosure">Your prompt is sent to the configured AI provider to generate your script.</p>
    {script && <section className="generated-script" aria-live="polite"><span className="eyebrow">Script generated</span><h2>{script.title}</h2><ScriptContent script={script} /><Link className="primary-button" href={'/scripts/' + script._id}>Review script <ArrowRight size={16} /></Link></section>}
  </>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) {
  return <label className="preference">{label}<span className="select-wrapper"><select value={value} onChange={event => onChange(event.target.value)}>{options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select><ChevronDown size={16} /></span></label>;
}
