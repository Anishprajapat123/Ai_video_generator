import type { Project } from './api';

export type CreationDraft = { title: string; prompt: string; duration: string; aspectRatio: string; language: string; style: string; providerId: string };
export const emptyCreationDraft: CreationDraft = { title: '', prompt: '', duration: '60', aspectRatio: '16:9', language: 'en', style: 'animated-explainer', providerId: '' };
type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
export function creationStorage(): DraftStorage {
  try { return window.sessionStorage; }
  catch { return { getItem: () => null, setItem: () => {}, removeItem: () => {} }; }
}

export async function restoreCreationDraft(storage: DraftStorage, key: string, params: URLSearchParams, loadProject: (id: string) => Promise<Project>) {
  let saved: { draft?: CreationDraft; projectId?: string } = {};
  try { saved = JSON.parse(storage.getItem(key) || '{}'); } catch { /* Invalid local data must not block a new project. */ }
  const explicitProjectId = params.get('project');
  const projectId = explicitProjectId || saved.projectId;
  if (!projectId) return { draft: { ...emptyCreationDraft, ...saved.draft }, project: null, scriptId: null };
  const project = await loadProject(projectId);
  if (!explicitProjectId && project.scriptId) {
    // A completed generation belongs to the project library, not to the next creation form.
    try { storage.removeItem(key); } catch { /* Browser storage may be unavailable. */ }
    return { draft: { ...emptyCreationDraft }, project: null, scriptId: null };
  }
  return { draft: { ...emptyCreationDraft, ...saved.draft, title: project.title, duration: String(project.settings.duration),
    aspectRatio: project.settings.aspectRatio, language: project.settings.language, style: project.settings.style }, project,
    scriptId: params.get('regenerate') === '1' ? null : project.scriptId || null };
}

export function persistCreationDraft(storage: DraftStorage, key: string, draft: CreationDraft, project: Project | null, scriptReady: boolean) {
  try {
    if (scriptReady) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify({ draft, projectId: project?._id }));
  } catch { /* Creation still works if browser storage is unavailable. */ }
}
