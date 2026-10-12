import React, { useMemo, useState, useEffect } from 'react';
import {
  BriefcaseBusiness, Search, BookmarkPlus, CalendarDays, Users,
  SlidersHorizontal, Check, Plus, UserPlus, X, UserMinus, Shield, Sparkles,
  ShieldCheck, Award, CheckCircle2, XCircle, AlertCircle, ExternalLink, Clock, LoaderCircle, FileText,
  Trash2, Send
} from 'lucide-react';
import type { CandidateMatchResult, Employee } from '../../types';
import { CSV_DATA } from '../../services/dataLoader';
import { apiFetch } from '../../services/apiClient';
import { rankCandidatesForRequirements } from '../../services/matchingEngine';
import { LearningResourceRow, ProgressRow, RoleRequirement, analyzeRoleGap } from '../../services/upskillingEngine';
import { Avatar } from '../ui/Avatar';

interface MarketplaceTabProps {
  employees: Employee[];
  currentEmployee?: Employee | null;
  onSelectEmployee: (emp: Employee) => void;
  onInspectEvidence: (emp: Employee, skillName: string) => void;
  onShowToast: (msg: string) => void;
  userRole?: string;
  onReloadData?: () => Promise<void>;
}

type Opportunity = {
  id: string;
  name: string;
  domain: string;
  complexity: number;
  status: string;
  startDate: string;
  teamSize: number;
  priority: string;
  requirements: RoleRequirement[];
  roleId?: string;
  technologies?: string;
};

export const MarketplaceTab: React.FC<MarketplaceTabProps> = ({
  employees,
  currentEmployee,
  onSelectEmployee,
  onInspectEvidence,
  onShowToast,
  userRole,
  onReloadData
}) => {
  const isHr = userRole === 'HR_Admin';
  const isManager = userRole === 'Manager';
  const canManageProjects = isHr || isManager;

  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [domain, setDomain] = useState('All');
  const [complexity, setComplexity] = useState('All');
  const [priority, setPriority] = useState('All');
  const [status, setStatus] = useState('Open');
  const [onlyMyMatches, setOnlyMyMatches] = useState(false);
  const [sort, setSort] = useState<'coverage' | 'date' | 'myMatch'>('coverage');
  const [page, setPage] = useState(1);
  const [shortlisted, setShortlisted] = useState<string[]>(() => (CSV_DATA?.records?.projectShortlists || []).map(row => `${row.project_id}:${row.employee_id}`));
  const [appliedRoleIds, setAppliedRoleIds] = useState<string[]>([]);
  const pageSize = 6;

  // Add Project Modal State
  const [showAddProjectModal, setShowAddProjectModal] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjName, setNewProjName] = useState('');
  const [newProjDomain, setNewProjDomain] = useState('Engineering');
  const [newProjComplexity, setNewProjComplexity] = useState('3');
  const [newProjTech, setNewProjTech] = useState('React|TypeScript|Node.js');
  const [newProjStart, setNewProjStart] = useState(new Date().toISOString().slice(0, 10));
  const [newProjPriority, setNewProjPriority] = useState('Normal');

  // Assign Team Member Modal State
  const [showAssignMemberModal, setShowAssignMemberModal] = useState(false);
  const [isAssigningMember, setIsAssigningMember] = useState(false);
  const [assignEmpId, setAssignEmpId] = useState('');
  const [assignRoleTitle, setAssignRoleTitle] = useState('Senior Contributor');
  const [assignSummary, setAssignSummary] = useState('');

  // HR Console SubTab & Queues state
  const [hrSubTab, setHrSubTab] = useState<'allocator' | 'evidence' | 'completion' | 'applications'>('allocator');
  const [evidenceQueue, setEvidenceQueue] = useState<any[]>([]);
  const [completionQueue, setCompletionQueue] = useState<any[]>([]);
  const [applicationsQueue, setApplicationsQueue] = useState<any[]>([]);
  const [loadingQueues, setLoadingQueues] = useState(false);
  const [processingId, setProcessingId] = useState<string | number | null>(null);

  const fetchHrQueues = async () => {
    if (!isHr) return;
    setLoadingQueues(true);
    try {
      const [evRes, compRes, appRes] = await Promise.all([
        apiFetch('/api/hr/evidence-queue'),
        apiFetch('/api/hr/completion-queue'),
        apiFetch('/api/hr/applications-queue')
      ]);
      if (evRes.ok && Array.isArray(evRes.data?.evidence_queue)) {
        setEvidenceQueue(evRes.data.evidence_queue);
      }
      if (compRes.ok && Array.isArray(compRes.data?.completion_queue)) {
        setCompletionQueue(compRes.data.completion_queue);
      }
      if (appRes.ok && Array.isArray(appRes.data?.applications_queue)) {
        setApplicationsQueue(appRes.data.applications_queue);
      }
    } catch {
      // ignore
    } finally {
      setLoadingQueues(false);
    }
  };

  useEffect(() => {
    if (isHr) {
      fetchHrQueues();
    }
  }, [isHr, hrSubTab, employees]);

  const handleVerifyEvidence = async (
    evidenceId: string,
    status: 'Verified by HR' | 'Link checked' | 'Needs info' | 'Rejected',
    notes: string,
    version?: number
  ) => {
    setProcessingId(evidenceId);
    try {
      const res = await apiFetch(`/api/evidence/${evidenceId}/verify`, {
        method: 'POST',
        body: JSON.stringify({
          verification_status: status,
          hr_notes: notes,
          version: version
        })
      });
      if (!res.ok) throw new Error(res.error || 'Failed to update verification status.');
      onShowToast(`Evidence marked as "${status}".`);
      await fetchHrQueues();
      if (onReloadData) await onReloadData();
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleBulkVerifyAll = async () => {
    if (!evidenceQueue.length) return;
    setProcessingId('bulk');
    try {
      const res = await apiFetch('/api/evidence/bulk-verify', {
        method: 'POST',
        body: JSON.stringify({
          verify_all_pending: true,
          verification_status: 'Verified by HR',
          hr_notes: 'Bulk verified by HR Admin'
        })
      });
      if (!res.ok) throw new Error(res.error || 'Failed to bulk verify evidence.');
      onShowToast(`Successfully verified ${res.data?.count || evidenceQueue.length} evidence items at once!`);
      await fetchHrQueues();
      if (onReloadData) await onReloadData();
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Bulk verification failed.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReviewCompletion = async (
    progressId: number,
    decision: 'Approved' | 'Rejected'
  ) => {
    setProcessingId(progressId);
    try {
      const res = await apiFetch('/api/upskilling/admin/review-completion', {
        method: 'POST',
        body: JSON.stringify({
          progress_id: progressId,
          decision: decision
        })
      });
      if (!res.ok) throw new Error(res.error || 'Failed to review completion.');
      onShowToast(`Course completion ${decision.toLowerCase()}.`);
      await fetchHrQueues();
      if (onReloadData) await onReloadData();
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Review failed.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReviewApplication = async (
    applicationId: string,
    status: 'Accepted' | 'Rejected',
    note: string,
    version?: number
  ) => {
    setProcessingId(applicationId);
    try {
      const res = await apiFetch(`/api/project-applications/${applicationId}/review`, {
        method: 'POST',
        body: JSON.stringify({
          status: status,
          hr_decision_note: note,
          version: version
        })
      });
      if (!res.ok) throw new Error(res.error || 'Failed to review application.');
      onShowToast(`Application ${status.toLowerCase()}.`);
      await fetchHrQueues();
      if (onReloadData) await onReloadData();
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Review failed.');
    } finally {
      setProcessingId(null);
    }
  };

  const opportunities = useMemo<Opportunity[]>(() => {
    const rawProjects = CSV_DATA?.records?.projects || [];
    const rawRoles = CSV_DATA?.records?.roles || [];
    const rawRoleSkills = CSV_DATA?.records?.roleSkills || [];

    const projects = rawProjects.map(project => {
      const skillNames = (project.technologies || '').split('|').filter(Boolean);
      const requirements: RoleRequirement[] = skillNames.flatMap(name => {
        const skill = CSV_DATA.skillsData.find(item => item.name.toLowerCase() === name.toLowerCase() || item.synonyms.some(alias => alias.toLowerCase() === name.toLowerCase()));
        return skill ? [{ role_id: project.project_id, skill_id: skill.id, required_level: 'Intermediate', importance: 'Must' }] : [];
      });
      return {
        id: project.project_id,
        name: project.project_name,
        domain: project.domain,
        complexity: Number(project.complexity || 1),
        status: new Date(project.end_date) >= new Date() ? 'Active' : 'Completed',
        startDate: project.start_date,
        teamSize: Math.max(1, Math.ceil(requirements.length / 2)),
        priority: 'Normal',
        requirements,
        technologies: project.technologies
      };
    });

    const roles = rawRoles.map(role => ({
      id: `role-${role.role_id}`,
      roleId: role.role_id,
      name: `${role.role_title || role.title || 'Staff Role'} (${role.department || 'General'})`,
      domain: role.department,
      complexity: 3,
      status: role.status,
      startDate: role.target_date || role.start_date || '',
      teamSize: Number(role.headcount || 1),
      priority: 'Priority',
      requirements: rawRoleSkills.filter(req => req.role_id === role.role_id).map(req => ({
        role_id: req.role_id,
        skill_id: req.skill_id,
        required_level: req.required_level as any,
        importance: req.importance as any
      }))
    }));

    return [...projects, ...roles];
  }, []);

  const enriched = useMemo(() => {
    return opportunities.map(item => {
      const targets = item.requirements.map(req => ({
        skillId: req.skill_id,
        skillName: CSV_DATA.skillsData.find(s => s.id === req.skill_id)?.name || req.skill_id,
        requiredLevel: req.required_level,
        importance: req.importance as any
      }));
      const matches = rankCandidatesForRequirements(employees, targets, CSV_DATA.skillsData);
      const coverage = item.requirements.length
        ? Math.round((item.requirements.filter(req => employees.some(emp => emp.skills.some(skill => skill.skillId === req.skill_id && skill.proficiencyScore >= 3))).length / item.requirements.length) * 100)
        : 100;

      let userMatch: { score: number; metSkills: { name: string; userLevel: string }[]; missingSkills: { name: string; reqLevel: string }[] } | null = null;

      if (currentEmployee && item.requirements.length > 0) {
        const mustReqs = item.requirements.filter(r => r.importance === 'Must');
        const activeReqs = mustReqs.length > 0 ? mustReqs : item.requirements;
        const met: { name: string; userLevel: string }[] = [];
        const missing: { name: string; reqLevel: string }[] = [];

        activeReqs.forEach(req => {
          const empSkill = currentEmployee.skills.find(s => s.skillId === req.skill_id);
          const skillMeta = CSV_DATA.skillsData.find(s => s.id === req.skill_id);
          const skillName = skillMeta?.name || req.skill_id;

          if (empSkill && empSkill.proficiencyScore >= 2) {
            met.push({ name: skillName, userLevel: empSkill.proficiencyLevel });
          } else {
            missing.push({ name: skillName, reqLevel: req.required_level });
          }
        });

        const score = Math.round((met.length / activeReqs.length) * 100);
        userMatch = { score, metSkills: met, missingSkills: missing };
      }

      return { ...item, matches, coverage, userMatch };
    });
  }, [opportunities, employees, currentEmployee]);

  const filtered = useMemo(() => {
    return enriched.filter(item => {
      if (domain !== 'All' && item.domain !== domain) return false;
      if (complexity !== 'All' && item.complexity !== Number(complexity)) return false;
      if (priority !== 'All' && item.priority !== priority) return false;
      if (status !== 'All' && item.status !== status) return false;
      if (onlyMyMatches && (!item.userMatch || item.userMatch.score < 40)) return false;

      if (query.trim()) {
        const q = query.toLowerCase();
        const matchesName = item.name.toLowerCase().includes(q);
        const matchesDomain = item.domain.toLowerCase().includes(q);
        const matchesTech = (item.technologies || '').toLowerCase().includes(q);
        const matchesSkill = item.requirements.some(req => {
          const skill = CSV_DATA.skillsData.find(s => s.id === req.skill_id);
          return skill?.name.toLowerCase().includes(q);
        });
        if (!matchesName && !matchesDomain && !matchesTech && !matchesSkill) return false;
      }
      return true;
    }).sort((left, right) => {
      if (sort === 'myMatch' && currentEmployee) {
        return (right.userMatch?.score || 0) - (left.userMatch?.score || 0);
      }
      if (sort === 'coverage') return right.coverage - left.coverage;
      return (left.startDate || '').localeCompare(right.startDate || '');
    });
  }, [enriched, domain, complexity, priority, status, onlyMyMatches, query, sort, currentEmployee]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = filtered.slice((page - 1) * pageSize, page * pageSize);
  const selected = filtered.find(item => item.id === selectedId) || filtered[0] || enriched[0];

  const [localAssignedMembers, setLocalAssignedMembers] = useState<{ employee_id: string; project_id: string; role?: string }[]>([]);

  const assignedTeamMembers = useMemo<{
    employee_id: string;
    project_id: string;
    role?: string;
    contribution_summary?: string;
    employee?: Employee;
  }[]>(() => {
    if (!selected) return [];
    const rawEp = (CSV_DATA?.records?.employeeProjects || []) as Record<string, string>[];
    const cleanId = selected.id.replace(/^(role-)+/, '');
    const matchIds = new Set<string>([
      selected.id,
      cleanId,
      `role-${cleanId}`,
      selected.roleId || '',
      selected.id.startsWith('role-proj-') ? selected.id.replace('role-', '') : '',
      selected.id.startsWith('proj-') ? `role-${selected.id}` : ''
    ].filter(Boolean));

    const combinedMap = new Map<string, { employee_id: string; project_id: string; role?: string; contribution_summary?: string }>();
    rawEp.filter(ep => matchIds.has(ep.project_id)).forEach(ep => {
      combinedMap.set(ep.employee_id, {
        employee_id: ep.employee_id,
        project_id: ep.project_id,
        role: ep.role,
        contribution_summary: ep.contribution_summary
      });
    });
    localAssignedMembers.filter(m => matchIds.has(m.project_id) || matchIds.has(selected.id)).forEach(m => {
      combinedMap.set(m.employee_id, m);
    });

    return Array.from(combinedMap.values()).map(ep => {
      const emp = employees.find(e => e.id === ep.employee_id);
      return {
        employee_id: ep.employee_id,
        project_id: ep.project_id,
        role: ep.role,
        contribution_summary: ep.contribution_summary,
        employee: emp
      };
    });
  }, [selected, employees, CSV_DATA?.records?.employeeProjects, localAssignedMembers]);

  const addShortlist = async (employee: Employee) => {
    let canonicalProjId = selected.id;
    while (canonicalProjId.startsWith('role-role-')) {
      canonicalProjId = canonicalProjId.slice(5);
    }
    const key = `${selected.id}:${employee.id}`;
    try {
      const res = await apiFetch('/api/project-shortlists', {
        method: 'POST',
        body: JSON.stringify({ project_id: canonicalProjId, employee_id: employee.id, note: '' })
      });
      if (!res.ok) throw new Error(res.error || 'save');
      setShortlisted(items => items.includes(key) ? items : [...items, key]);
      onShowToast(`${employee.name} shortlisted for ${selected.name}.`);
      if (onReloadData) await onReloadData();
    } catch {
      onShowToast('Shortlist could not be saved.');
    }
  };

  const removeShortlist = async (employee: Employee) => {
    let canonicalProjId = selected.id;
    while (canonicalProjId.startsWith('role-role-')) {
      canonicalProjId = canonicalProjId.slice(5);
    }
    const key = `${selected.id}:${employee.id}`;
    try {
      const res = await apiFetch('/api/project-shortlists', {
        method: 'DELETE',
        body: JSON.stringify({ project_id: canonicalProjId, employee_id: employee.id })
      });
      if (!res.ok) throw new Error(res.error || 'delete');
      setShortlisted(items => items.filter(k => k !== key));
      onShowToast(`${employee.name} removed from shortlist.`);
      if (onReloadData) await onReloadData();
    } catch {
      onShowToast('Could not remove from shortlist.');
    }
  };

  // Sync active applied role IDs on mount or when currentEmployee changes
  useEffect(() => {
    if (!currentEmployee) return;
    apiFetch('/api/project-applications')
      .then(res => {
        if (res.ok && Array.isArray(res.data?.applications)) {
          const empId = currentEmployee.id;
          const activeIds = res.data.applications
            .filter((a: any) => (a.employee_id === empId || a.employee_id.includes(empId)) && a.status !== 'Withdrawn')
            .map((a: any) => a.opportunity_id);
          setAppliedRoleIds(activeIds);
        }
      })
      .catch(() => {});
  }, [currentEmployee]);

  const handleApply = async (item: typeof selected) => {
    // Optimistic immediate update
    setAppliedRoleIds(prev => Array.from(new Set([...prev, item.id])));
    try {
      const res = await apiFetch('/api/project-applications', {
        method: 'POST',
        body: JSON.stringify({
          opportunity_id: item.id,
          opportunity_type: 'project',
          note: 'Applied via marketplace matching engine.',
          hours_per_week: currentEmployee?.hoursPerWeekFree || 20
        })
      });
      if (!res.ok) throw new Error(res.error || 'Failed to submit application');
      const oppLabel = item.name || (item as any)?.title || 'Opportunity';
      onShowToast(`Application & interest submitted for ${oppLabel}! Project lead notified.`);
      if (onReloadData) await onReloadData();
    } catch (err) {
      setAppliedRoleIds(prev => prev.filter(id => id !== item.id));
      onShowToast(err instanceof Error ? err.message : 'Error submitting application.');
    }
  };

  const handleWithdrawInterest = async (item: typeof selected) => {
    // Optimistic immediate update: removes from applied role IDs instantly
    setAppliedRoleIds(prev => prev.filter(id => id !== item.id));
    try {
      const res = await apiFetch('/api/project-applications', {
        method: 'DELETE',
        body: JSON.stringify({ opportunity_id: item.id, delete: true })
      });
      if (!res.ok) throw new Error(res.error || 'Failed to withdraw');
      const oppLabel = item.name || (item as any)?.title || 'Opportunity';
      onShowToast(`Withdrew interest and application from ${oppLabel}.`);
      if (onReloadData) await onReloadData();
    } catch (err) {
      setAppliedRoleIds(prev => Array.from(new Set([...prev, item.id])));
      onShowToast(err instanceof Error ? err.message : 'Could not withdraw application.');
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjName.trim()) return;
    setIsCreatingProject(true);
    try {
      const res = await apiFetch('/api/projects', {
        method: 'POST',
        body: JSON.stringify({
          project_name: newProjName.trim(),
          domain: newProjDomain,
          complexity: newProjComplexity,
          technologies: newProjTech.trim(),
          start_date: newProjStart,
          priority: newProjPriority
        })
      });
      if (!res.ok) throw new Error(res.error || 'Failed to create project');
      onShowToast(`Project "${newProjName}" posted successfully!`);
      setShowAddProjectModal(false);
      setNewProjName('');
      if (onReloadData) await onReloadData();
    } catch (err: any) {
      onShowToast(err.message || 'Failed to create project.');
    } finally {
      setIsCreatingProject(false);
    }
  };

  const handleAssignMember = async (empIdToAssign?: string, roleNameToAssign?: string) => {
    const targetEmpId = empIdToAssign || assignEmpId || employees[0]?.id;
    const targetRole = roleNameToAssign || assignRoleTitle || 'Contributor';
    if (!selected || !targetEmpId) return;

    let canonicalProjId = selected.id;
    while (canonicalProjId.startsWith('role-role-')) {
      canonicalProjId = canonicalProjId.slice(5);
    }
    if (canonicalProjId.startsWith('role-proj-')) {
      canonicalProjId = canonicalProjId.replace('role-', '');
    }

    setIsAssigningMember(true);
    try {
      const res = await apiFetch('/api/project-members', {
        method: 'POST',
        body: JSON.stringify({
          project_id: canonicalProjId,
          role_id: selected.roleId || (selected.id.startsWith('role-') ? selected.id : undefined),
          employee_id: targetEmpId,
          role: targetRole,
          contribution_summary: assignSummary.trim() || `Assigned to ${selected.name}`
        })
      });
      if (!res.ok) throw new Error(res.error || 'Failed to assign team member');
      // Optimistic immediate assignment update
      setLocalAssignedMembers(prev => [...prev.filter(m => m.employee_id !== targetEmpId), {
        employee_id: targetEmpId,
        project_id: canonicalProjId,
        role: targetRole
      }]);
      const empName = employees.find(e => e.id === targetEmpId)?.name || 'Employee';
      onShowToast(`${empName} assigned to ${selected.name}!`);
      setShowAssignMemberModal(false);
      setAssignSummary('');
      if (onReloadData) await onReloadData();
    } catch (err: any) {
      onShowToast(err?.message || 'Could not assign team member.');
    } finally {
      setIsAssigningMember(false);
    }
  };

  const handleRemoveMember = async (empId: string) => {
    if (!selected || !empId) return;
    let canonicalProjId = selected.id;
    while (canonicalProjId.startsWith('role-role-')) {
      canonicalProjId = canonicalProjId.slice(5);
    }
    if (canonicalProjId.startsWith('role-proj-')) {
      canonicalProjId = canonicalProjId.replace('role-', '');
    }
    try {
      const res = await apiFetch('/api/project-members', {
        method: 'DELETE',
        body: JSON.stringify({
          project_id: canonicalProjId,
          raw_project_id: selected.id,
          employee_id: empId
        })
      });
      if (!res.ok) throw new Error(res.error || 'Failed to remove team member');
      setLocalAssignedMembers(prev => prev.filter(m => m.employee_id !== empId));
      const empName = employees.find(e => e.id === empId)?.name || 'Employee';
      onShowToast(`${empName} removed from ${selected.name}.`);
      if (onReloadData) await onReloadData();
    } catch {
      onShowToast('Could not remove team member.');
    }
  };

  const activeMarketplaceFilters = [domain !== 'All', complexity !== 'All', priority !== 'All', status !== 'All', onlyMyMatches, query.trim().length > 0].filter(Boolean).length;

  const resetMarketplaceFilters = () => {
    setQuery('');
    setDomain('All');
    setComplexity('All');
    setPriority('All');
    setStatus('All');
    setOnlyMyMatches(false);
    setSort('coverage');
    setPage(1);
  };

  if (!enriched.length) return <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center text-slate-500">No projects or openings are available.</div>;

  return (
    <div className="space-y-6 pb-14">
      {/* ── Header ── */}
      <div className={`relative overflow-hidden rounded-2xl border p-6 shadow-sm transition-all ${
        isHr
          ? 'border-violet-500/20 bg-gradient-to-br from-violet-500/[0.07] via-surface to-surface'
          : isManager
          ? 'border-[#19C3E6]/20 bg-gradient-to-br from-[#19C3E6]/[0.07] via-surface to-surface'
          : 'border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.07] via-surface to-surface'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-2xs font-bold uppercase tracking-wider mb-2 ${
              isHr
                ? 'bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-500/30'
                : isManager
                ? 'bg-[#19C3E6]/10 text-cyan-600 dark:text-cyan-400 border border-[#19C3E6]/30'
                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
            }`}>
              <BriefcaseBusiness className="h-3.5 w-3.5" />
              <span>{isHr ? 'HR Strategic Initiatives & Staffing' : 'Internal Marketplace & Mobility'}</span>
            </div>
            <h2 className="text-2xl font-extrabold text-text-primary tracking-tight font-sora">
              Internal Initiatives &amp; Projects
            </h2>
            <p className="mt-1 text-xs text-text-muted max-w-2xl">
              {isHr
                ? 'Post strategic initiatives, staff cross-functional teams, and align verified skills with project objectives.'
                : currentEmployee
                ? 'Discover internal projects matched directly to your verified technical skills and career goals.'
                : 'Explore initiatives and staff open project teams with verified internal talent.'}
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {canManageProjects && (
              <button
                onClick={() => setShowAddProjectModal(true)}
                className="aurora-btn-primary flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>Post New Project</span>
              </button>
            )}

            <div className="relative min-w-56 max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted pointer-events-none" />
              <input
                value={query}
                onChange={event => { setQuery(event.target.value); setPage(1); }}
                placeholder="Search projects, skills..."
                className="w-full rounded-xl border border-border bg-surface-alt pl-9 pr-8 py-2 text-xs text-text-primary placeholder:text-text-muted focus:outline-none focus:border-[#19C3E6]"
              />
              {query && (
                <button onClick={() => { setQuery(''); setPage(1); }} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary text-xs cursor-pointer">✕</button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── HR Console Sub-Navigation (HR Admins Only) ── */}
      {isHr && (
        <div className="flex items-center gap-2 border-b border-border pb-3 overflow-x-auto">
          <button
            onClick={() => setHrSubTab('allocator')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              hrSubTab === 'allocator'
                ? 'bg-violet-600 text-white shadow-md'
                : 'bg-surface border border-border text-text-muted hover:text-text-primary'
            }`}
          >
            <BriefcaseBusiness className="w-3.5 h-3.5" />
            <span>Staffing &amp; Initiatives Allocator</span>
          </button>

          <button
            onClick={() => setHrSubTab('evidence')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              hrSubTab === 'evidence'
                ? 'bg-violet-600 text-white shadow-md'
                : 'bg-surface border border-border text-text-muted hover:text-text-primary'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Evidence Verification Queue</span>
            {evidenceQueue.length > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                hrSubTab === 'evidence' ? 'bg-white/20 text-white' : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
              }`}>
                {evidenceQueue.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setHrSubTab('completion')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              hrSubTab === 'completion'
                ? 'bg-violet-600 text-white shadow-md'
                : 'bg-surface border border-border text-text-muted hover:text-text-primary'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>Course Completion Approvals</span>
            {completionQueue.length > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                hrSubTab === 'completion' ? 'bg-white/20 text-white' : 'bg-indigo-500/10 text-indigo-600 border border-indigo-500/20'
              }`}>
                {completionQueue.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setHrSubTab('applications')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              hrSubTab === 'applications'
                ? 'bg-violet-600 text-white shadow-md'
                : 'bg-surface border border-border text-text-muted hover:text-text-primary'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Project Application Reviews</span>
            {applicationsQueue.length > 0 && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                hrSubTab === 'applications' ? 'bg-white/20 text-white' : 'bg-cyan-500/10 text-cyan-600 border border-cyan-500/20'
              }`}>
                {applicationsQueue.length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* ── Conditional Views: HR Queues ── */}
      {isHr && hrSubTab === 'evidence' && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.04] p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                <div>
                  <h3 className="text-sm font-bold text-text-primary">Evidence Verification Queue</h3>
                  <p className="text-xs text-text-muted mt-0.5">
                    Review and calibrate employee technical submissions. Verified evidence increases weight to 1.0x and unlocks level ceilings.
                  </p>
                </div>
              </div>
              {evidenceQueue.length > 0 && (
                <button
                  onClick={handleBulkVerifyAll}
                  disabled={processingId === 'bulk'}
                  className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Verify All Pending ({evidenceQueue.length})</span>
                </button>
              )}
            </div>
          </div>

          {evidenceQueue.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface p-12 text-center text-xs text-text-muted">
              <ShieldCheck className="mx-auto h-8 w-8 text-emerald-500 mb-2 opacity-80" />
              <div className="font-bold text-text-primary">No pending evidence submissions</div>
              <p className="mt-1">All employee technical proofs are up to date and verified.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {evidenceQueue.map((ev: any) => (
                <div key={ev.evidence_id} className="rounded-2xl border border-border bg-surface p-5 shadow-xs space-y-3.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={ev.employee_name} className="h-10 w-10 rounded-xl" />
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-text-primary">{ev.employee_name}</h4>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-600 border border-violet-500/20">
                            {ev.employee_department}
                          </span>
                        </div>
                        <p className="text-xs text-text-muted mt-0.5">
                          Skill: <strong className="text-text-primary">{ev.skill_name}</strong> · Type: <strong className="text-text-primary">{ev.evidence_type}</strong>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-surface-alt border border-border text-text-muted">
                        Artifact Date: {ev.artifact_date || 'N/A'}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-amber-500/10 text-amber-600 border border-amber-500/20">
                        {ev.verification_status}
                      </span>
                    </div>
                  </div>

                  <div>
                    <h5 className="text-xs font-bold text-text-primary mb-1">{ev.title}</h5>
                    {ev.url && (
                      <a
                        href={ev.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-1 break-all"
                      >
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" /> {ev.url}
                      </a>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-border">
                    <button
                      onClick={() => handleVerifyEvidence(ev.evidence_id, 'Verified by HR', 'Approved by HR', ev.version)}
                      disabled={processingId === ev.evidence_id}
                      className="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approve (Verified by HR)
                    </button>
                    <button
                      onClick={() => handleVerifyEvidence(ev.evidence_id, 'Link checked', 'Artifact link verified', ev.version)}
                      disabled={processingId === ev.evidence_id}
                      className="px-3 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" /> Link Checked
                    </button>
                    <button
                      onClick={() => handleVerifyEvidence(ev.evidence_id, 'Needs info', 'Additional context requested by HR', ev.version)}
                      disabled={processingId === ev.evidence_id}
                      className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <AlertCircle className="w-3.5 h-3.5" /> Request Info
                    </button>
                    <button
                      onClick={() => handleVerifyEvidence(ev.evidence_id, 'Rejected', 'Artifact rejected by HR', ev.version)}
                      disabled={processingId === ev.evidence_id}
                      className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {isHr && hrSubTab === 'completion' && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.04] p-5">
            <div className="flex items-center gap-2.5">
              <Award className="w-5 h-5 text-violet-600 dark:text-violet-400" />
              <div>
                <h3 className="text-sm font-bold text-text-primary">Course Completion Approval Queue</h3>
                <p className="text-xs text-text-muted mt-0.5">
                  Review course completion claims submitted by employees. Approved courses award verified bonus points and promote role readiness.
                </p>
              </div>
            </div>
          </div>

          {completionQueue.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface p-12 text-center text-xs text-text-muted">
              <Award className="mx-auto h-8 w-8 text-emerald-500 mb-2 opacity-80" />
              <div className="font-bold text-text-primary">No course completions pending approval</div>
              <p className="mt-1">All employee study certificates and completion requests have been reviewed.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {completionQueue.map((prog: any) => (
                <div key={prog.id} className="rounded-2xl border border-border bg-surface p-5 shadow-xs space-y-3.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={prog.employee_name} className="h-10 w-10 rounded-xl" />
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-text-primary">{prog.employee_name}</h4>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-600 border border-violet-500/20">
                            {prog.employee_department}
                          </span>
                        </div>
                        <p className="text-xs text-text-muted mt-0.5">
                          Course: <strong className="text-text-primary">{prog.resource_title}</strong> ({prog.provider})
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-surface-alt border border-border text-text-muted">
                        {prog.hours_logged} of {prog.estimated_hours} hrs logged ({prog.progress_percent}%)
                      </span>
                      <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-indigo-500/10 text-indigo-600 border border-indigo-500/20">
                        {prog.status}
                      </span>
                    </div>
                  </div>

                  {prog.completion_proof_url && (
                    <div>
                      <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider block mb-1">Completion Proof / URL:</span>
                      <a
                        href={prog.completion_proof_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 break-all"
                      >
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" /> {prog.completion_proof_url}
                      </a>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                    <button
                      onClick={() => handleReviewCompletion(prog.id, 'Approved')}
                      disabled={processingId === prog.id}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Approve Course Completion
                    </button>
                    <button
                      onClick={() => handleReviewCompletion(prog.id, 'Rejected')}
                      disabled={processingId === prog.id}
                      className="px-3.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Reject / Request Revisions
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {isHr && hrSubTab === 'applications' && (
        <section className="space-y-4">
          <div className="rounded-2xl border border-violet-500/20 bg-violet-500/[0.04] p-5">
            <div className="flex items-center gap-2.5">
              <UserPlus className="w-5 h-5 text-violet-600 dark:text-violet-400" />
              <div>
                <h3 className="text-sm font-bold text-text-primary">Project Application Reviews Queue</h3>
                <p className="text-xs text-text-muted mt-0.5">
                  Review and accept employee applications for internal opportunities. Accepted applications roster candidates directly onto project teams.
                </p>
              </div>
            </div>
          </div>

          {applicationsQueue.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-surface p-12 text-center text-xs text-text-muted">
              <UserPlus className="mx-auto h-8 w-8 text-emerald-500 mb-2 opacity-80" />
              <div className="font-bold text-text-primary">No pending applications</div>
              <p className="mt-1">All employee project and role applications have been reviewed.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {applicationsQueue.map((app: any) => (
                <div key={app.application_id} className="rounded-2xl border border-border bg-surface p-5 shadow-xs space-y-3.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={app.employee_name} className="h-10 w-10 rounded-xl" />
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-text-primary">{app.employee_name}</h4>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-600 border border-violet-500/20">
                            {app.employee_department}
                          </span>
                        </div>
                        <p className="text-xs text-text-muted mt-0.5">
                          Opportunity: <strong className="text-text-primary">{app.opportunity_name}</strong> ({app.opportunity_type})
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold px-2 py-1 rounded-lg bg-surface-alt border border-border text-text-muted">
                        Commitment: {app.hours_per_week || 10} hrs/wk
                      </span>
                      <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-cyan-500/10 text-cyan-600 border border-cyan-500/20">
                        {app.status}
                      </span>
                    </div>
                  </div>

                  {app.note && (
                    <div className="bg-surface-alt rounded-xl p-3 border border-border">
                      <span className="text-[10px] font-bold text-text-muted uppercase tracking-wider block mb-0.5">Candidate Statement:</span>
                      <p className="text-xs text-text-primary leading-relaxed">{app.note}</p>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                    <button
                      onClick={() => handleReviewApplication(app.application_id, 'Accepted', 'Approved for initiative')}
                      disabled={processingId === app.application_id}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Accept Candidate
                    </button>
                    <button
                      onClick={() => handleReviewApplication(app.application_id, 'Rejected', 'Not selected for this cycle')}
                      disabled={processingId === app.application_id}
                      className="px-3.5 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Reject Candidate
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── Staffing Allocator & Initiatives View ── */}
      {(!isHr || hrSubTab === 'allocator') && (
        <>
          {/* ── Filter Bar ── */}
          <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {currentEmployee && (
            <button
              onClick={() => { setOnlyMyMatches(v => !v); setPage(1); }}
              className={`rounded-xl px-3 py-2 text-xs font-bold transition-all border ${
                onlyMyMatches
                  ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              ⭐ Matches for Me (≥40%)
            </button>
          )}
          <SlidersHorizontal className="h-4 w-4 text-slate-400 ml-1" />
          <select value={domain} onChange={event => { setDomain(event.target.value); setPage(1); }} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:border-violet-500"><option>All</option>{[...new Set(opportunities.map(item => item.domain))].map(value => <option key={value}>{value}</option>)}</select>
          <select value={complexity} onChange={event => { setComplexity(event.target.value); setPage(1); }} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:border-violet-500"><option value="All">All complexity</option>{[1,2,3,4,5].map(value => <option key={value} value={value}>Complexity {value}</option>)}</select>
          <select value={priority} onChange={event => { setPriority(event.target.value); setPage(1); }} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:border-violet-500"><option>All</option><option>Priority</option><option>Normal</option></select>
          <select value={status} onChange={event => { setStatus(event.target.value); setPage(1); }} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:border-violet-500"><option value="All">All status</option><option>Open</option><option>Active</option><option>Completed</option></select>
          <select value={sort} onChange={event => setSort(event.target.value as any)} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none focus:border-violet-500">
            {currentEmployee && <option value="myMatch">Sort: Best Match for Me</option>}
            <option value="coverage">Sort: Must skill coverage</option>
            <option value="date">Sort: Start date</option>
          </select>
        </div>
        {activeMarketplaceFilters > 0 && (
          <button onClick={resetMarketplaceFilters} className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 transition-colors font-medium">
            Reset Filters
          </button>
        )}
      </div>

      {/* ── Main Two-Column Layout ── */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        {/* Left Column: Projects list */}
        <div className="space-y-3 xl:col-span-2">
          <p className="text-2xs font-bold uppercase tracking-wide text-slate-400">{filtered.length} opportunities</p>
          {pageItems.map(item => {
            const isSelected = selected?.id === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                className={`w-full rounded-2xl border p-4 text-left shadow-sm transition-all duration-150 ${
                  isSelected
                    ? isHr
                      ? 'border-violet-500 bg-violet-50/40 dark:bg-violet-950/20 ring-1 ring-violet-500/30'
                      : 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/20 ring-1 ring-indigo-500/30'
                    : 'border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400">{item.domain}</span>
                      {item.userMatch && (
                        <span className="rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                          {item.userMatch.score}% Match
                        </span>
                      )}
                    </div>
                    <h3 className="mt-1 text-sm font-bold text-slate-900 dark:text-white">{item.name}</h3>
                  </div>
                  <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-500">{item.status}</span>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1">
                  {item.requirements.slice(0, 4).map(req => (
                    <span key={req.skill_id} className="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 px-2 py-0.5 text-[10px] text-slate-600 dark:text-slate-400 font-medium">
                      {CSV_DATA.skillsData.find(skill => skill.id === req.skill_id)?.name} · {req.required_level}
                    </span>
                  ))}
                </div>
                <div className="mt-2.5 flex flex-wrap justify-between gap-2 text-[10px] text-slate-500">
                  <span>Complexity {item.complexity} · Team {item.teamSize}</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">{item.coverage}% Must coverage</span>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-2.5">
                  <div className="flex items-center">
                    {item.matches.slice(0, 3).map((match, index) => (
                      <span key={match.employee.id} title={`${match.employee.name} ${match.overallMatchScore}%`} className={index ? '-ml-2' : ''}>
                        <Avatar name={match.employee.name} className="h-6 w-6 border-2 border-white dark:border-slate-900 text-[8px] rounded-full" />
                      </span>
                    ))}
                  </div>
                  <span className="text-[10px] text-slate-400">
                    {item.matches.slice(0, 3).map(match => `${match.employee.name.split(' ')[0]} ${match.overallMatchScore}%`).join(' · ')}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-slate-400">
                    <CalendarDays className="h-3 w-3" />
                    {item.startDate || 'Date TBD'}
                  </span>
                </div>
              </button>
            );
          })}
          {!pageItems.length && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center text-xs text-slate-400">
              No opportunities match these filters.
            </div>
          )}
          {totalPages > 1 && (
            <div className="flex justify-between items-center text-xs pt-1 text-slate-500">
              <button disabled={page === 1} onClick={() => setPage(v => v - 1)} className="font-semibold text-violet-600 dark:text-violet-400 disabled:text-slate-400">Previous</button>
              <span className="text-2xs text-slate-400">Page {page} of {totalPages}</span>
              <button disabled={page === totalPages} onClick={() => setPage(v => v + 1)} className="font-semibold text-violet-600 dark:text-violet-400 disabled:text-slate-400">Next</button>
            </div>
          )}
        </div>

        {/* Right Column: Project Detail & Team Allocation */}
        {selected && (
          <section className="space-y-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm xl:col-span-3">
            <header className="border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold text-violet-600 dark:text-violet-400">
                  <BriefcaseBusiness className="h-4 w-4" />
                  <span>{selected.domain}</span>
                </div>
                {currentEmployee && (
                  <div className="flex items-center gap-2">
                    {appliedRoleIds.includes(selected.id) ? (
                      <>
                        <button
                          type="button"
                          disabled
                          className="rounded-xl px-3.5 py-2 text-xs font-bold transition-all flex items-center gap-1.5 bg-emerald-600 text-white shadow-xs cursor-default"
                        >
                          <Check className="w-3.5 h-3.5" /> Interest Registered
                        </button>
                        <button
                          type="button"
                          onClick={() => handleWithdrawInterest(selected)}
                          className="rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 px-3 py-2 text-xs font-semibold text-red-600 transition-colors flex items-center gap-1 cursor-pointer"
                          title="Withdraw interest / application"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Withdraw
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleApply(selected)}
                        className="rounded-xl px-4 py-2 text-xs font-bold transition-all flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 shadow-xs cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" /> Express Interest / Apply
                      </button>
                    )}
                  </div>
                )}
              </div>
              <h3 className="mt-2 text-lg font-bold text-slate-900 dark:text-white">{selected.name}</h3>
              <p className="mt-1 text-2xs text-slate-400">
                Complexity {selected.complexity} · {selected.status} · Team target size {selected.teamSize} · Starts {selected.startDate || 'TBD'}
              </p>
            </header>

            {/* ── Employee Personal Match Breakdown Card ── */}
            {currentEmployee && selected.userMatch && (
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-2xs font-bold text-emerald-700 dark:text-emerald-300 uppercase tracking-wider">Your Fit &amp; Qualification</span>
                  <span className="text-base font-black text-emerald-600 dark:text-emerald-400">{selected.userMatch.score}% Fit</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${selected.userMatch.score}%` }} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs">
                  <div>
                    <strong className="text-slate-900 dark:text-white block mb-1 text-2xs font-bold">Skills You Meet:</strong>
                    {selected.userMatch.metSkills.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {selected.userMatch.metSkills.map(s => (
                          <span key={s.name} className="rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 px-2 py-0.5 text-2xs font-semibold">
                            ✓ {s.name} ({s.userLevel})
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-slate-400 italic text-2xs">None yet</span>
                    )}
                  </div>

                  <div>
                    <strong className="text-slate-900 dark:text-white block mb-1 text-2xs font-bold">Skills To Develop:</strong>
                    {selected.userMatch.missingSkills.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {selected.userMatch.missingSkills.map(s => (
                          <span key={s.name} className="rounded-md bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-500 px-2 py-0.5 text-2xs">
                            + {s.name} ({s.reqLevel})
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-emerald-600 font-semibold text-2xs">All requirements met!</span>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Required Skills */}
            <div>
              <h4 className="mb-2 text-2xs font-bold uppercase tracking-wider text-slate-400">Required Technical Skills</h4>
              <div className="flex flex-wrap gap-2">
                {selected.requirements.map(req => (
                  <span key={req.skill_id} className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 font-medium">
                    {CSV_DATA.skillsData.find(skill => skill.id === req.skill_id)?.name}: {req.required_level} <span className="text-slate-400 text-2xs">({req.importance})</span>
                  </span>
                ))}
              </div>
            </div>

            {/* ── PROJECT TEAM MEMBERS (HR & Managers can add/remove members) ── */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  <h4 className="text-2xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                    Assigned Project Team ({assignedTeamMembers.length})
                  </h4>
                </div>

                {canManageProjects && (
                  <button
                    onClick={() => {
                      setAssignEmpId(employees[0]?.id || '');
                      setShowAssignMemberModal(true);
                    }}
                    className="flex items-center gap-1.5 rounded-xl border border-violet-200 dark:border-violet-900/60 bg-violet-50 dark:bg-violet-950/30 hover:bg-violet-100 dark:hover:bg-violet-900/50 text-violet-700 dark:text-violet-300 px-3 py-1 text-xs font-bold transition-colors"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    <span>Assign Team Member</span>
                  </button>
                )}
              </div>

              {assignedTeamMembers.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  {assignedTeamMembers.map(item => (
                    <div
                      key={item.employee_id}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 flex items-center justify-between gap-2 shadow-2xs"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar name={item.employee?.name || item.employee_id} className="h-8 w-8 text-2xs shrink-0 rounded-lg" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {item.employee?.name || item.employee_id}
                          </p>
                          <p className="text-2xs text-violet-600 dark:text-violet-400 font-semibold truncate">
                            {item.role || 'Contributor'}
                          </p>
                          {item.contribution_summary && (
                            <p className="text-[10px] text-slate-400 truncate">
                              {item.contribution_summary}
                            </p>
                          )}
                        </div>
                      </div>

                      {canManageProjects && (
                        <button
                          onClick={() => handleRemoveMember(item.employee_id)}
                          title="Remove from team"
                          className="rounded-lg p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic py-2">
                  No team members currently assigned. Use "Assign Team Member" above or staff from top matches below.
                </p>
              )}
            </div>

            {/* ── TOP MATCHING EMPLOYEES & DIRECT ASSIGNMENT ── */}
            <div>
              <h4 className="mb-3 text-2xs font-bold uppercase tracking-wider text-slate-400">
                {currentEmployee ? 'Other Team Candidates & Collaborators' : 'Top Matching Internal Talent'}
              </h4>
              <div className="space-y-3">
                {selected.matches.slice(0, 4).map((match: CandidateMatchResult) => {
                  const isAssigned = assignedTeamMembers.some(tm => tm.employee_id === match.employee.id);
                  const isShort = shortlisted.includes(`${selected.id}:${match.employee.id}`);

                  return (
                    <article key={match.employee.id} className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-2xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button onClick={() => onSelectEmployee(match.employee)} className="flex items-center gap-2.5 text-left">
                          <Avatar name={match.employee.name} className="h-8 w-8 text-2xs rounded-lg" />
                          <span>
                            <strong className="block text-xs font-bold text-slate-900 dark:text-white">{match.employee.display_label || match.employee.name}</strong>
                            <small className="text-2xs text-slate-400">{match.employee.role} ({match.employee.department})</small>
                          </span>
                        </button>
                        <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">{match.overallMatchScore}%</span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {match.matchingSkills.map(skill => (
                          <button
                            key={skill.skillName}
                            onClick={() => onInspectEvidence(match.employee, skill.skillName)}
                            className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-2 text-left text-2xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/60 dark:border-slate-800 transition-colors"
                          >
                            <span className="flex items-center justify-between gap-1">
                              <b className="truncate">{skill.skillName}</b>
                              <span className="font-semibold text-violet-600 dark:text-violet-400 text-[10px]">Inspect</span>
                            </span>
                            <span className="block text-slate-400 text-[10px] mt-0.5">{skill.currentLevel} / {skill.requiredLevel} · {skill.evidenceCount} proofs</span>
                          </button>
                        ))}
                      </div>

                      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-2xs text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-2">
                        <span>
                          <Users className="mr-1 inline h-3 w-3" />
                          {match.employee.availabilityPercent}% available · {match.employee.currentWorkloadPercent}% workload
                        </span>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => isShort ? removeShortlist(match.employee) : addShortlist(match.employee)}
                            className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-800 px-2 py-1 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                            title={isShort ? "Remove candidate from shortlist" : "Shortlist candidate for this project"}
                          >
                            {isShort ? <Check className="h-3 w-3 text-emerald-500" /> : <BookmarkPlus className="h-3 w-3" />}
                            <span>{isShort ? 'Shortlisted' : 'Shortlist'}</span>
                          </button>

                          {canManageProjects && (
                            <button
                              onClick={() => {
                                if (isAssigned) {
                                  handleRemoveMember(match.employee.id);
                                } else {
                                  handleAssignMember(match.employee.id, `${selected.name} Specialist`);
                                }
                              }}
                              className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-2xs font-bold transition-colors ${
                                isAssigned
                                  ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                                  : 'bg-violet-600 hover:bg-violet-700 text-white'
                              }`}
                            >
                              {isAssigned ? (
                                <>
                                  <Check className="h-3 w-3" />
                                  <span>Assigned</span>
                                </>
                              ) : (
                                <>
                                  <UserPlus className="h-3 w-3" />
                                  <span>Assign</span>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        )}
      </div>
        </>
      )}

      {/* ── Add Project Modal ── */}
      {showAddProjectModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200"
          onMouseDown={e => { if (e.target === e.currentTarget) setShowAddProjectModal(false); }}
        >
          <div className="relative w-full max-w-lg rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-[#B14AFF]/10 text-[#B14AFF] p-2 border border-[#B14AFF]/20">
                  <BriefcaseBusiness className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-sora font-semibold text-text-primary">Post Strategic Initiative</h3>
                  <p className="text-xs text-text-muted">Launch a new internal project and open it for talent matching.</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddProjectModal(false)}
                className="rounded-lg p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block text-2xs font-sora font-semibold text-text-muted uppercase tracking-wider mb-1">Project Name *</label>
                <input
                  type="text"
                  required
                  value={newProjName}
                  onChange={e => setNewProjName(e.target.value)}
                  placeholder="e.g. Next-Gen Enterprise Billing Engine"
                  className="w-full rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs text-text-primary focus:border-[#B14AFF] focus:outline-none focus:ring-1 focus:ring-[#B14AFF]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-2xs font-sora font-semibold text-text-muted uppercase tracking-wider mb-1">Domain</label>
                  <select
                    value={newProjDomain}
                    onChange={e => setNewProjDomain(e.target.value)}
                    className="w-full rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs text-text-primary focus:border-[#B14AFF] focus:outline-none"
                  >
                    <option value="Engineering">Engineering</option>
                    <option value="Payments Infrastructure">Payments Infrastructure</option>
                    <option value="Data & AI">Data &amp; AI</option>
                    <option value="Cloud Architecture & DevOps">Cloud Architecture &amp; DevOps</option>
                    <option value="Frontend & UI Frameworks">Frontend &amp; UI Frameworks</option>
                    <option value="Product">Product</option>
                  </select>
                </div>

                <div>
                  <label className="block text-2xs font-sora font-semibold text-text-muted uppercase tracking-wider mb-1">Complexity (1 to 5)</label>
                  <select
                    value={newProjComplexity}
                    onChange={e => setNewProjComplexity(e.target.value)}
                    className="w-full rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs text-text-primary focus:border-[#B14AFF] focus:outline-none"
                  >
                    <option value="1">1 - Foundational</option>
                    <option value="2">2 - Standard</option>
                    <option value="3">3 - Intermediate</option>
                    <option value="4">4 - Advanced</option>
                    <option value="5">5 - Mission Critical</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-2xs font-sora font-semibold text-text-muted uppercase tracking-wider mb-1">
                  Required Technologies (pipe separated)
                </label>
                <input
                  type="text"
                  value={newProjTech}
                  onChange={e => setNewProjTech(e.target.value)}
                  placeholder="e.g. React|TypeScript|AWS Cloud|Node.js"
                  className="w-full rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs text-text-primary focus:border-[#B14AFF] focus:outline-none focus:ring-1 focus:ring-[#B14AFF]"
                />
                <p className="text-2xs text-text-muted mt-1">Available skills: React, TypeScript, Node.js, Python, PostgreSQL, AWS Cloud, Docker &amp; Kubernetes</p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-2xs font-sora font-semibold text-text-muted uppercase tracking-wider mb-1">Start Date</label>
                  <input
                    type="date"
                    value={newProjStart}
                    onChange={e => setNewProjStart(e.target.value)}
                    className="w-full rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs text-text-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-2xs font-sora font-semibold text-text-muted uppercase tracking-wider mb-1">Priority</label>
                  <select
                    value={newProjPriority}
                    onChange={e => setNewProjPriority(e.target.value)}
                    className="w-full rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs text-text-primary focus:outline-none"
                  >
                    <option value="Normal">Normal</option>
                    <option value="Priority">Priority (Urgent)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowAddProjectModal(false)}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-text-muted hover:bg-surface-elevated cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingProject}
                  className="rounded-xl aurora-btn-primary text-white px-5 py-2 text-xs font-sora font-semibold shadow-md transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isCreatingProject ? 'Posting Project...' : 'Post Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Assign Team Member Modal ── */}
      {showAssignMemberModal && selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200"
          onMouseDown={e => { if (e.target === e.currentTarget) setShowAssignMemberModal(false); }}
        >
          <div className="relative w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-[#B14AFF]/10 text-[#B14AFF] p-2 border border-[#B14AFF]/20">
                  <UserPlus className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-sora font-semibold text-text-primary">Assign Team Member</h3>
                  <p className="text-xs text-text-muted">{selected.name}</p>
                </div>
              </div>
              <button onClick={() => setShowAssignMemberModal(false)} className="rounded-lg p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block text-2xs font-sora font-semibold text-text-muted uppercase tracking-wider mb-1">Select Employee *</label>
                <select
                  value={assignEmpId || employees[0]?.id || ''}
                  onChange={e => setAssignEmpId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs text-text-primary focus:border-[#B14AFF] focus:outline-none"
                >
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({e.role}) - {e.availabilityPercent}% available
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-2xs font-sora font-semibold text-text-muted uppercase tracking-wider mb-1">Project Role / Title *</label>
                <input
                  type="text"
                  value={assignRoleTitle}
                  onChange={e => setAssignRoleTitle(e.target.value)}
                  placeholder="e.g. Lead Frontend Architect, Core Contributor"
                  className="w-full rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs text-text-primary focus:border-[#B14AFF] focus:outline-none focus:ring-1 focus:ring-[#B14AFF]"
                />
              </div>

              <div>
                <label className="block text-2xs font-sora font-semibold text-text-muted uppercase tracking-wider mb-1">Contribution Summary (Optional)</label>
                <input
                  type="text"
                  value={assignSummary}
                  onChange={e => setAssignSummary(e.target.value)}
                  placeholder="e.g. Developing payment gateway adapters"
                  className="w-full rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs text-text-primary focus:border-[#B14AFF] focus:outline-none focus:ring-1 focus:ring-[#B14AFF]"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowAssignMemberModal(false)}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-text-muted hover:bg-surface-elevated cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleAssignMember()}
                  disabled={isAssigningMember}
                  className="rounded-xl aurora-btn-primary text-white px-5 py-2 text-xs font-sora font-semibold shadow-md transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isAssigningMember ? 'Assigning...' : 'Confirm Assignment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
