export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}

const fieldLabels: Record<string, string> = {
  email: 'Email',
  password: 'Password',
  name: 'Name',
  title: 'Title',
  narration: 'Narration',
};

// Turn the backend's field issues into a message that names the field a person can fix.
export function validationMessage(details: Record<string, unknown> | null | undefined): string | null {
  const issues = details?.issues;
  if (!Array.isArray(issues)) return null;
  const parts: string[] = [];
  for (const issue of issues.slice(0, 3)) {
    if (!issue || typeof issue !== 'object') continue;
    const message = (issue as { message?: unknown }).message;
    if (typeof message !== 'string' || !message) continue;
    const path = (issue as { path?: unknown }).path;
    const field = Array.isArray(path)
      ? [...path].reverse().find(segment => typeof segment === 'string' && !/^\d+$/.test(segment))
      : undefined;
    const label = typeof field === 'string'
      ? fieldLabels[field] || field.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase())
      : '';
    parts.push(label ? `${label}: ${message}` : message);
  }
  return parts.length ? parts.join(' ') : null;
}

let csrfRequest: Promise<{ csrfToken: string }> | undefined;
function getCsrfToken(): Promise<{ csrfToken: string }> {
  if (!csrfRequest) {
    const load = () => api<{ csrfToken: string }>('/auth/csrf');
    // Web Locks serialize first-time cookie initialization across browser tabs.
    csrfRequest = (async () => {
      if (typeof navigator !== 'undefined' && navigator.locks) return await navigator.locks.request('studio:csrf', load);
      return load();
    })().finally(() => { csrfRequest = undefined; });
  }
  return csrfRequest;
}

export async function api<T>(path: string, options: RequestInit = {}, csrfRetry = true): Promise<T> {
  if (options.method?.toUpperCase() === 'POST' && /^\/(?:projects\/[^/]+\/scripts|scenes\/[^/]+\/(?:explainer|narration))\/generate$/.test(path)) return generationRequest<T>(path, options);
  const headers = new Headers(options.headers);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (options.method && !['GET', 'HEAD'].includes(options.method)) {
    const csrf = await getCsrfToken();
    headers.set('X-CSRF-Token', csrf.csrfToken);
  }
  let response: Response;
  try {
    response = await fetch('/api/v1' + path, { ...options, ...(!options.signal && (!options.method || options.method === 'GET') ? { signal: AbortSignal.timeout(15000) } : {}), headers, credentials: 'include', cache: 'no-store' });
  } catch { throw new ApiError('Cannot reach the studio API. Check that the backend is running.', 0); }
  let payload;
  try { payload = await response.json(); }
  catch {
    const message = response.status === 504
      ? 'The generation request timed out. Check your project for a saved result before trying again.'
      : response.status >= 500
        ? 'The connection to the studio API was interrupted. Generation may still be running; check your project before retrying.'
        : 'The studio API returned an unexpected response. Refresh the page and try again.';
    throw new ApiError(message, response.status);
  }
  if (!response.ok || !payload.success) {
    // CSRF middleware rejects before business logic. Only that rejection is safe to retry.
    if (csrfRetry && response.status === 403 && payload.error?.code === 'CSRF_VALIDATION_FAILED' && options.method && !['GET', 'HEAD'].includes(options.method)) {
      return api<T>(path, options, false);
    }
    const validation = payload.error?.code === 'VALIDATION_ERROR' ? validationMessage(payload.error.details) : null;
    throw new ApiError(validation || payload.error?.message || 'The request could not be completed.', response.status, payload.error?.code);
  }
  return payload.data as T;
}

export type ContentJob = { _id: string; requestId?: string; kind?: 'script' | 'visual' | 'narration'; sceneId?: string; status: string; error?: string; result?: unknown };
export function forgetRecoveredJob(job: ContentJob) {
  if (!['completed', 'failed', 'cancelled'].includes(job.status)) return;
  try {
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const key = localStorage.key(index);
      if (!key?.startsWith('studio:generation:')) continue;
      try {
        const saved = JSON.parse(localStorage.getItem(key) || '{}');
        if (saved.jobId === job._id || (job.requestId && saved.requestId === job.requestId)) localStorage.removeItem(key);
      } catch { /* Leave unrelated or malformed recovery entries alone. */ }
    }
  } catch { /* Recovery works even when browser storage is unavailable. */ }
}
const generationRequests = new Map<string, Promise<unknown>>();
async function generationRequest<T>(path: string, options: RequestInit): Promise<T> {
  const bytes = new TextEncoder().encode(path + '\n' + String(options.body || ''));
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
  const key = 'studio:generation:' + digest;
  const active = generationRequests.get(key);
  if (active) return active as Promise<T>;
  const request = (async () => {
    let saved: { requestId: string; jobId?: string } = { requestId: crypto.randomUUID() };
    try { const previous = localStorage.getItem(key); if (previous) saved = JSON.parse(previous); } catch { /* Storage may be unavailable; server-side locks still prevent concurrent generation. */ }
    const remember = () => { try { localStorage.setItem(key, JSON.stringify(saved)); } catch {} };
    const forget = () => { try { localStorage.removeItem(key); } catch {} };
    remember();
    if (!saved.jobId) {
      const headers = new Headers(options.headers); headers.set('X-Generation-Request', saved.requestId);
      try {
        const response = await api<{ job: ContentJob }>(path.replace(/\/generate$/, '/jobs'), { ...options, headers });
        saved.jobId = response.job._id; remember();
      } catch (error) {
        // A lost POST response can mean the job started. Keep its request ID for safe reconnection.
        if (error instanceof ApiError && error.status > 0 && error.status < 500) forget();
        throw error;
      }
    }
    let failures = 0;
    const deadline = Date.now() + 11 * 60 * 1000;
    while (Date.now() < deadline) {
      let job: ContentJob;
      try { ({ job } = await api<{ job: ContentJob }>('/content-jobs/' + saved.jobId, { signal: AbortSignal.timeout(15000) })); failures = 0; }
      catch (error) {
        if (!(error instanceof ApiError) || (error.status > 0 && error.status < 500 && ![408, 429].includes(error.status))) { forget(); throw error; }
        if (++failures >= 15) throw new ApiError('Connection lost while checking generation. Your job is saved. Reconnect and repeat the same action to resume checking without a second generation request.', 0);
        await new Promise(resolve => setTimeout(resolve, 2000)); continue;
      }
      if (job.status === 'completed') { forget(); return job.result as T; }
      if (job.status === 'failed' || job.status === 'cancelled') { forget(); throw new ApiError(job.error || 'Generation failed. Check your saved project.', 502, 'GENERATION_FAILED'); }
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
    throw new ApiError('Generation is still being checked. Your job is saved; repeat the same action to reconnect without generating twice.', 0);
  })();
  generationRequests.set(key, request);
  try { return await request as T; } finally { generationRequests.delete(key); }
}

export type User = { _id: string; name: string; email: string; defaultWorkspaceId?: string };
export type Workspace = { _id: string; name: string; type: string };
export type Membership = { workspace: Workspace; role: string };
export type Project = {
  _id: string; title: string; description?: string; status: string; updatedAt: string;
  scriptId?: string; storyboardId?: string; finalVideoAssetId?: string | null;
  settings: { duration: number; resolution: string; fps: number; aspectRatio: string; language: string; style: string; subtitlesEnabled?: boolean };
};
export type Script = { _id: string; projectId: string; workspaceId: string; __v?: number; title: string; status: string; version: number; totalWordCount: number; estimatedDuration: number;
  providerMetadata?: { collaboration?: import('@ai-video-studio/shared-types').ProviderResponse['collaboration'] };
  sections: { sectionId: string; heading: string; narration: string; estimatedDuration: number; order: number; keyMessage?: string; visualSuggestion?: string }[] };
export type Provider = { id: string; name: string; enabled: boolean; capabilities: string[] };
export type Storyboard = {
  _id: string; workspaceId: string; projectId: string; scriptId: string; title: string;
  status: 'draft' | 'approved' | 'superseded'; version: number; totalDuration: number; __v?: number;
};
export type Scene = {
  editing?: Partial<import('@ai-video-studio/shared-types').SceneEditing>;
  editHistory?: unknown[]; editRedo?: unknown[];
  _id: string; projectId: string; storyboardId: string; sceneNumber: number; title: string;
  narration?: string; visualDescription?: string; duration: number; status: string; updatedAt: string;
  transition: { type: 'fade' | 'slide-left' | 'slide-right' | 'wipe' | 'none'; duration: number };
  visualAssetIds?: string[]; voiceAssetId?: string | null; narrationOptional?: boolean; visualFit?: 'cover' | 'contain';
  motionGraphics?: { type: string; properties: { text?: string; layout?: 'title' | 'key-points' | 'steps' | 'concept' | 'comparison'; points?: string[]; illustration?: 'sunlight' | 'panel' | 'home'; collaboration?: import('@ai-video-studio/shared-types').ProviderResponse['collaboration'] } }[];
};

export type MediaAsset = { _id: string; sceneId: string; name: string; type: 'image' | 'video' | 'audio'; mimeType: string; size: number; duration?: number };
