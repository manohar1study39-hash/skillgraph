import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, Award, BriefcaseBusiness, CalendarDays, LoaderCircle, MapPin, Users } from 'lucide-react';
import type { Employee } from '../../types';
import { Avatar } from '../layout/Avatar';

type ProfileApiData = {
  employee: Record<string, string>;
  employeeSkills: Record<string, string>[];
  projects: { project_id: string; project_name: string; role: string; contribution_summary: string }[];
  certifications: Record<string, string>[];
  upskilling: { role_title: string; resource_title: string; status: string; progress_percent: string; updated_at: string }[];
};

interface EmployeeProfilePageProps {
  employee?: Employee;
  employeeId: string;
  returnTo: string;
  onInspectEvidence: (employee: Employee, skillName: string) => void;
}

export const EmployeeProfilePage: React.FC<EmployeeProfilePageProps> = ({ employee, employeeId, returnTo, onInspectEvidence }) => {
  const [profile, setProfile] = useState<ProfileApiData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setNotFound(false); setProfile(null);
    fetch(`/api/employees/${encodeURIComponent(employeeId)}/profile`, { credentials: 'same-origin' })
      .then(async response => {
        const body = await response.json();
        if (response.status === 404) { if (active) setNotFound(true); return; }
        if (!response.ok) throw new Error(body.error || 'Employee profile could not be loaded.');
        if (active) setProfile(body as ProfileApiData);
      })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'Employee profile could not be loaded.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [employeeId]);

  const skillSources = useMemo(() => new Map((profile?.employeeSkills || []).map(row => [row.skill_id, row])), [profile]);
  const returnLink = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/';

  if (loading) return <div role="status" className="flex min-h-[60vh] items-center justify-center gap-3 text-sm text-text-muted"><LoaderCircle className="h-5 w-5 animate-spin"/>Loading employee profile…</div>;
  if (notFound) return <div className="rounded-2xl border border-border bg-surface p-10 text-center"><h2 className="text-lg font-bold text-text-primary">Employee not found</h2><p className="mt-2 text-sm text-text-muted">This employee profile is unavailable.</p><a href={returnLink} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft className="h-4 w-4"/>Back to results</a></div>;
  if (error || !profile || !employee) return <div role="alert" className="rounded-2xl border border-danger/30 bg-surface p-8 text-center"><AlertCircle className="mx-auto h-6 w-6 text-danger"/><h2 className="mt-3 font-bold text-text-primary">Profile couldn’t be loaded</h2><p className="mt-2 text-sm text-text-muted">{error || 'Employee data is unavailable. Reload Talent Search and try again.'}</p><a href={returnLink} className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft className="h-4 w-4"/>Back to results</a></div>;

  return <div className="space-y-6 pb-12">
    <a href={returnLink} className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary-hover"><ArrowLeft className="h-4 w-4"/>Back to results</a>
    <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
      <div className="flex flex-wrap items-center gap-5"><Avatar name={employee.name} className="h-16 w-16 text-lg"/><div className="min-w-0 flex-1"><h1 className="text-2xl font-bold text-text-primary">{employee.name}</h1><p className="mt-1 text-sm text-text-muted">{employee.role} · {employee.department} · {employee.team}</p><p className="mt-1 flex items-center gap-1 text-sm text-text-muted"><MapPin className="h-4 w-4"/>{employee.location}</p></div><div className="flex gap-5"><div><p className="text-xs text-text-muted">Availability</p><p className="mt-1 text-lg font-bold text-success-strong">{employee.availabilityPercent}%</p></div><div><p className="text-xs text-text-muted">Current workload</p><p className="mt-1 text-lg font-bold text-text-primary">{employee.currentWorkloadPercent}%</p></div></div></div>
    </section>
    <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm"><div className="mb-4 flex items-center gap-2"><Users className="h-4 w-4 text-primary"/><h2 className="font-bold text-text-primary">Skills</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead><tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted"><th className="py-3">Skill</th><th className="py-3">Level</th><th className="py-3">Experience</th><th className="py-3">Verified proof</th><th className="py-3">Source</th><th className="py-3">Last used</th><th className="py-3"></th></tr></thead><tbody>{employee.skills.map(skill => { const source = skillSources.get(skill.skillId); const proofCount = skill.evidenceList.filter(item => item.verified && !item.expired).length; return <tr key={skill.skillId} className="border-b border-border last:border-0"><td className="py-3 font-semibold text-text-primary">{skill.skillName}</td><td className="py-3 text-text-primary">{skill.proficiencyLevel}</td><td className="py-3 text-text-muted">{source?.years_experience || '0'} years</td><td className="py-3 text-text-muted">{proofCount}</td><td className="py-3 text-text-muted">{source?.source || '—'}</td><td className="py-3 text-text-muted">{skill.lastUsedDate || '—'}</td><td className="py-3 text-right"><button onClick={() => onInspectEvidence(employee, skill.skillName)} className="text-xs font-semibold text-primary hover:text-primary-hover">Inspect</button></td></tr>; })}</tbody></table>{!employee.skills.length && <p className="py-8 text-center text-sm text-text-muted">No skills have been recorded.</p>}</div></section>
    <section className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm"><div className="mb-4 flex items-center gap-2"><BriefcaseBusiness className="h-4 w-4 text-primary"/><h2 className="font-bold text-text-primary">Projects</h2></div>{profile.projects.length ? <div className="space-y-4">{profile.projects.map(project => <article key={project.project_id} className="border-b border-border pb-4 last:border-0 last:pb-0"><h3 className="font-semibold text-text-primary">{project.project_name}</h3><p className="mt-1 text-xs text-text-muted">{project.role}</p><p className="mt-2 text-sm text-text-muted">{project.contribution_summary || 'No contribution summary recorded.'}</p></article>)}</div> : <p className="text-sm text-text-muted">No project assignments recorded.</p>}</div>
      <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm"><div className="mb-4 flex items-center gap-2"><Award className="h-4 w-4 text-primary"/><h2 className="font-bold text-text-primary">Certifications</h2></div>{profile.certifications.length ? <div className="space-y-4">{profile.certifications.map(cert => { const expired = Boolean(cert.expiry_date && cert.expiry_date < new Date().toISOString().slice(0,10)); return <article key={cert.cert_id} className="border-b border-border pb-4 last:border-0 last:pb-0"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold text-text-primary">{cert.cert_name}</h3>{expired && <span className="rounded-full bg-danger/10 px-2 py-1 text-[10px] font-semibold text-danger">Expired</span>}</div><p className="mt-1 text-xs text-text-muted">{cert.issuer}</p><p className="mt-2 flex items-center gap-1 text-xs text-text-muted"><CalendarDays className="h-3.5 w-3.5"/>Issued {cert.issued_date || 'date unavailable'} · Expires {cert.expiry_date || 'No expiry'}</p></article>; })}</div> : <p className="text-sm text-text-muted">No certifications recorded.</p>}</div>
    </section>
    <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm"><h2 className="mb-4 font-bold text-text-primary">Upskilling</h2>{profile.upskilling.length ? <div className="grid gap-3 md:grid-cols-2">{profile.upskilling.map((item, index) => <article key={`${item.role_title}:${item.resource_title}:${index}`} className="rounded-xl border border-border bg-surface-alt p-4"><h3 className="font-semibold text-text-primary">{item.resource_title}</h3><p className="mt-1 text-xs text-text-muted">{item.role_title}</p><div className="mt-3 flex items-center justify-between text-xs"><span className="font-medium text-primary">{item.status}</span><span className="text-text-muted">{item.progress_percent}%</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-border"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, Number(item.progress_percent)))}%` }}/></div></article>)}</div> : <p className="text-sm text-text-muted">No upskilling progress recorded.</p>}</section>
  </div>;
};
