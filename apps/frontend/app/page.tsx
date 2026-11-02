'use client';

import Link from 'next/link';
import { ArrowRight, ChevronRight, Clapperboard, FileText, PlusCircle, WandSparkles } from 'lucide-react';
import { statusLabel, useStudio } from '../components/studio';

export default function Overview() {
  const { projects, showProject, memberships, workspaceId } = useStudio();
  const canEdit = memberships.find(m => m.workspace._id === workspaceId)?.role !== 'viewer';
  const recent = projects[0];
  return <>
    <section className="dashboard-hero">
      <div><span className="eyebrow"><span className="dot" /> Atelier workspace</span><h1>What would you like to create today?</h1><p>Turn your ideas into videos, one scene at a time.</p></div>
      {canEdit && <div className="creation-actions"><Link href="/create" className="primary-button"><PlusCircle size={18} /> Create a video</Link><Link href="/create" className="text-link"><WandSparkles size={17} />Start with a prompt</Link><span className="action-divider">/</span><span className="disabled-link" title="Script import is not available yet"><FileText size={17} />Use a script</span></div>}
    </section>
    {recent && <section className="resume-panel" aria-label="Continue where you left off"><span className="resume-icon"><Clapperboard size={22} /></span><div className="resume-info"><div className="resume-title"><h2>{recent.title}</h2><span className="badge">Resume working</span></div><p>{statusLabel(recent)} <span>·</span> Edited {new Date(recent.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p></div><button className="secondary-button" onClick={() => showProject(recent)}>{recent.scriptId ? 'View script' : 'Open project'} <ArrowRight size={17} /></button></section>}
    <section id="recent-projects" className="projects-section">
      <div className="section-heading"><h2>Recent projects <span className="count">{projects.length}</span></h2>{projects.length > 3 && <a className="text-link" href="#all-projects">View all <ChevronRight size={17} /></a>}</div>
      {!projects.length ? <div className="empty-projects"><Clapperboard size={32} strokeWidth={1.25} /><h3>Your next story starts here.</h3><p>Your projects will appear here as you create them.</p>{canEdit && <Link className="secondary-button" href="/create">Create your first video <ArrowRight size={16} /></Link>}</div> : <div className="project-grid" id="all-projects">{projects.map((project, i) => <button key={project._id} className="project-card" onClick={() => showProject(project)}>
        <div className={`project-art art-${i % 3}`}><span className="art-category">{i % 3 === 0 ? 'PROD · ARCHIVE' : i % 3 === 1 ? 'COMMERCIAL' : 'DOCUSERIES'}</span><span className="duration">{Math.floor(project.settings.duration / 60).toString().padStart(2, '0')}:{Math.round(project.settings.duration % 60).toString().padStart(2, '0')}</span><Thumbnail variant={i % 3} /><div className="art-caption"><small>SCENE STUDY / {String(i + 1).padStart(2, '0')}</small><strong>{project.title}</strong></div></div>
        <div className="project-info"><div className="project-title"><h3>{project.title}</h3><ArrowRight size={17} /></div><p>Edited {new Date(project.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</p><div className="project-meta"><span className="badge">{statusLabel(project)}</span><span>{project.settings.resolution.toUpperCase()} · {project.settings.fps}fps</span></div></div>
      </button>)}</div>}
    </section>
  </>;
}

function Thumbnail({ variant }: { variant: number }) {
  return <svg className="thumbnail-drawing" viewBox="0 0 360 180" fill="none" aria-hidden="true">{variant === 0 ? <g stroke="currentColor" strokeWidth="1.2"><path d="M45 100 135 43 225 72 315 100 225 128 135 155 45 100 135 100 225 72M135 43 225 72M135 100 225 128 315 100M135 155 225 128" strokeDasharray="2 3" />{[[45,100],[135,43],[135,100],[135,155],[225,72],[225,128],[315,100]].map(([cx,cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="4" fill="currentColor" />)}</g> : variant === 1 ? <g stroke="currentColor"><path d="m100 75 80-45 80 45v75l-80 45-80-45V75l80 45 80-45M180 120v75M128 80l52-28 52 28" /><circle cx="180" cy="75" r="3" fill="currentColor" /></g> : <g stroke="currentColor"><circle cx="80" cy="40" r="20" /><path d="M80 0v12M80 68v12M40 40h12M108 40h12M80 40l200 100M80 40l170 100M80 40l140 100" strokeDasharray="4 4" /><path d="m190 125 100-35 24 50-100 35-24-50Zm33-12 24 50m9-62 24 50m-77 0 100-35" /></g>}</svg>;
}
