'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowRight, ChevronDown, Clapperboard, Film, LogOut, Search, UserRound } from 'lucide-react';
import { api, ApiError, type Membership, type Project, type Provider, type Script, type User } from '../lib/api';

type StudioState = {
  user: User | null; memberships: Membership[]; workspaceId: string; projects: Project[]; providers: Provider[];
  loading: boolean; error: string;
  refresh: () => Promise<void>; refreshProjects: () => Promise<void>; showProject: (project: Project) => void;
  registerLeaveGuard: (guard: () => boolean) => () => void;
};
const StudioContext = createContext<StudioState | null>(null);
export function useStudio() { const value = useContext(StudioContext); if (!value) throw new Error('Studio context missing'); return value; }

export function Studio({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const leaveGuard = useRef<() => boolean>(() => true);
  const registerLeaveGuard = useCallback((guard: () => boolean) => {
    leaveGuard.current = guard;
    return () => { if (leaveGuard.current === guard) leaveGuard.current = () => true; };
  }, []);
  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const me = await api<{ user: User }>('/auth/me');
      const [access, available] = await Promise.all([api<{ workspaces: Membership[] }>('/workspaces'), api<{ providers: Provider[] }>('/providers')]);
      const active = access.workspaces.filter(m => m.workspace);
      setUser(me.user); setMemberships(active); setProviders(available.providers);
      setWorkspaceId(current => active.some(m => m.workspace._id === current) ? current : active.find(m => m.workspace._id === me.user.defaultWorkspaceId)?.workspace._id || active[0]?.workspace._id || '');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { setUser(null); setMemberships([]); setProjects([]); setWorkspaceId(''); }
      else setError(e instanceof Error ? e.message : 'Unable to load the studio.');
    } finally { setLoading(false); }
  }, []);
  const refreshProjects = useCallback(async () => {
    if (!workspaceId) return;
    const result = await api<{ projects: Project[] }>(`/workspaces/${workspaceId}/projects?limit=50`);
    setProjects(result.projects);
  }, [workspaceId]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    let active = true;
    setProjects([]);
    if (!workspaceId) return;
    api<{ projects: Project[] }>(`/workspaces/${workspaceId}/projects?limit=50`).then(result => { if (active) setProjects(result.projects); })
      .catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [workspaceId]);
  function showProject(project: Project) {
    router.push(project.scriptId ? '/scripts/' + project.scriptId : '/create?project=' + project._id);
  }
  async function signOut() {
    if (!leaveGuard.current()) return;
    try { await api('/auth/logout', { method: 'POST' }); await refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to sign out.'); }
  }
  const workspace = memberships.find(m => m.workspace._id === workspaceId)?.workspace;
  const filteredProjects = projects.filter(p => p.title.toLowerCase().includes(search.toLowerCase()));
  return <StudioContext.Provider value={{ user, memberships, workspaceId, projects: filteredProjects, providers, loading, error, refresh, refreshProjects, showProject, registerLeaveGuard }}>
    <a href="#main-content" className="skip-link">Skip to content</a>
    <aside className="sidebar">
      <Link href="/" className="wordmark">AI VIDEO STUDIO</Link>
      <nav className="main-nav" aria-label="Main navigation">
        <Link href="/" className={pathname === '/' ? 'nav-item active' : 'nav-item'} aria-current={pathname === '/' ? 'page' : undefined}><Film size={19} /><span>Projects</span></Link>
      </nav>
      <div className="sidebar-bottom">
        <div className="profile"><span className="avatar"><UserRound size={17} /></span><div><strong>{user?.name || 'Your studio'}</strong><small>{workspace ? `${workspace.type === 'personal' ? 'Personal' : 'Team'} workspace` : 'Sign in to continue'}</small></div>{user && <button className="icon-button" onClick={signOut} aria-label="Sign out" title="Sign out"><LogOut size={16} /></button>}</div>
      </div>
    </aside>
    <div className="workspace">
      <header className="topbar">
        <label className="workspace-picker"><Clapperboard size={17} /><span className="sr-only">Workspace</span><select value={workspaceId} disabled={!memberships.length} onChange={e => { if (!leaveGuard.current()) return; setError(''); setWorkspaceId(e.target.value); }}>
          {!memberships.length && <option value="">Your studio</option>}{memberships.map(m => <option key={m.workspace._id} value={m.workspace._id}>{m.workspace.name}</option>)}
        </select><ChevronDown size={15} /></label>
        <div className="topbar-right">{pathname === '/' && <label className="search"><Search size={17} /><input aria-label="Search projects" placeholder="Search projects…" value={search} onChange={e => setSearch(e.target.value)} /></label>}<span className="avatar" title={user?.name || 'Your studio'}><UserRound size={18} /></span></div>
      </header>
      <main id="main-content" className={pathname === '/create' ? 'main-content create-content' : 'main-content'}>
        {loading ? <div className="state-panel" role="status">Opening your studio…</div> : error ? <div className="state-panel"><p className="error" role="alert">{error}</p><button className="secondary-button" onClick={() => { void refresh(); }}>Try again</button></div> : !user ? <AuthPanel /> : !workspaceId ? <div className="state-panel">No accessible workspace was found.</div> : children}
      </main>
    </div>
  </StudioContext.Provider>;
}

function AuthPanel() {
  const { refresh } = useStudio();
  const [register, setRegister] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError('');
    const form = new FormData(event.currentTarget);
    try {
      const payload = register
        ? { name: form.get('name'), email: String(form.get('email') ?? '').trim(), password: form.get('password') }
        : { email: String(form.get('email') ?? '').trim(), password: form.get('password') };
      await api(register ? '/auth/register' : '/auth/login', { method: 'POST', body: JSON.stringify(payload) });
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to sign in.'); }
    finally { setPending(false); }
  }
  return <section className="auth-panel"><span className="eyebrow"><span className="dot" /> Your creative workspace</span><h1>{register ? 'Make room for your ideas.' : 'Welcome to your studio.'}</h1><p>Sign in to create videos and return to your projects.</p>
    <form onSubmit={submit}>
      {register && <label>Your name<input name="name" required minLength={2} maxLength={100} autoComplete="name" /></label>}
      <label>Email<input name="email" type="email" required autoComplete="email" maxLength={254} /></label>
      <label>Password<input name="password" type="password" required minLength={register ? 8 : 1} autoComplete={register ? 'new-password' : 'current-password'} /></label>
      {register && <small>At least 8 characters, up to 72 UTF-8 bytes.</small>}
      {error && <p role="alert" className="error">{error}</p>}
      <button className="primary-button" disabled={pending}>{pending ? 'Please wait…' : register ? 'Create account' : 'Sign in'}<ArrowRight size={17} /></button>
    </form><button className="text-button" onClick={() => { setRegister(!register); setError(''); }}>{register ? 'Already have an account? Sign in' : 'New here? Create an account'}</button>
  </section>;
}

export function statusLabel(project: Project) {
  if (project.status === 'archived') return 'Archived';
  if (project.storyboardId) return project.status === 'ready' ? 'Storyboard approved' : 'Storyboard draft';
  if (project.scriptId) return 'Script available';
  return project.status === 'draft' ? 'Draft project' : project.status.charAt(0).toUpperCase() + project.status.slice(1);
}
export function ScriptContent({ script }: { script: Script }) {
  return <div className="script-content"><p className="muted">Version {script.version} · {script.totalWordCount} words · About {Math.round(script.estimatedDuration)} seconds · {script.status}</p>
    {script.sections.map(section => <section key={section.sectionId}><h3>{section.heading}</h3><p>{section.narration}</p></section>)}
  </div>;
}
