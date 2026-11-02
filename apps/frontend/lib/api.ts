export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
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
  const headers = new Headers(options.headers);
  if (options.body) headers.set('Content-Type', 'application/json');
  if (options.method && !['GET', 'HEAD'].includes(options.method)) {
    const csrf = await getCsrfToken();
    headers.set('X-CSRF-Token', csrf.csrfToken);
  }
  let response: Response;
  try {
    response = await fetch('/api/v1' + path, { ...options, headers, credentials: 'include', cache: 'no-store' });
  } catch { throw new ApiError('Cannot reach the studio API. Check that the backend is running.', 0); }
  let payload;
  try { payload = await response.json(); }
  catch { throw new ApiError('The studio API is unavailable. Check that the backend is running.', response.status); }
  if (!response.ok || !payload.success) {
    // CSRF middleware rejects before business logic. Only that rejection is safe to retry.
    if (csrfRetry && response.status === 403 && payload.error?.code === 'CSRF_VALIDATION_FAILED' && options.method && !['GET', 'HEAD'].includes(options.method)) {
      return api<T>(path, options, false);
    }
    throw new ApiError(payload.error?.message || 'The request could not be completed.', response.status, payload.error?.code);
  }
  return payload.data as T;
}

export type User = { _id: string; name: string; email: string; defaultWorkspaceId?: string };
export type Workspace = { _id: string; name: string; type: string };
export type Membership = { workspace: Workspace; role: string };
export type Project = {
  _id: string; title: string; description?: string; status: string; updatedAt: string;
  scriptId?: string; storyboardId?: string;
  settings: { duration: number; resolution: string; fps: number; aspectRatio: string; language: string; style: string };
};
export type Script = { _id: string; projectId: string; workspaceId: string; __v?: number; title: string; status: string; version: number; totalWordCount: number; estimatedDuration: number;
  sections: { sectionId: string; heading: string; narration: string; estimatedDuration: number; order: number; keyMessage?: string; visualSuggestion?: string }[] };
export type Provider = { id: string; name: string; enabled: boolean; capabilities: string[] };
