import React, { useMemo, useState } from 'react';
import {
  BookOpen, CheckCircle2, Clock3, GraduationCap, UserRound,
  AlertTriangle, Plus, Search, Filter, SlidersHorizontal,
  ChevronRight, Award, BarChart3, Target, UserCheck, X, Sparkles, Users,
  AlertCircle, ArrowRight, ShieldAlert
} from 'lucide-react';
import type { Employee, MarketplaceRole } from '../../types';
import { CSV_DATA } from '../../services/dataLoader';
import { apiFetch } from '../../services/apiClient';
import {
  LearningResourceRow, ProgressRow, RoleGapAnalysis,
  RoleRequirement, analyzeEmployeesForRole, skillShortages, levelNumber
} from '../../services/upskillingEngine';
import { Avatar } from '../ui/Avatar';

const PAGE_SIZE = 6;

function pageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 5) return Array.from({ length: total }, (_, index) => index + 1);
  const visible = [...new Set([1, total, current - 1, current, current + 1].filter(page => page >= 1 && page <= total))].sort((a, b) => a - b);
  return visible.flatMap((page, index) => index && page - visible[index - 1] > 1 ? ['ellipsis', page] : [page]);
}

function Pagination({ count, page, onPageChange, label }: { count: number; page: number; onPageChange: (page: number) => void; label: string }) {
  if (count <= PAGE_SIZE) return null;
  const total = Math.ceil(count / PAGE_SIZE);
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = Math.min(page * PAGE_SIZE, count);
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-800 pt-3 text-xs text-slate-500 dark:text-slate-400">
      <span>Showing {start}-{end} of {count}</span>
      <nav aria-label={`${label} pages`} className="flex items-center gap-1">
        <button disabled={page === 1} onClick={() => onPageChange(page - 1)} className="rounded-lg border border-slate-200 dark:border-slate-800 px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 transition-colors">Previous</button>
        {pageNumbers(page, total).map((item, index) => item === 'ellipsis'
          ? <span key={`ellipsis-${index}`} aria-hidden="true" className="px-1 text-slate-400">…</span>
          : <button key={item} aria-current={page === item ? 'page' : undefined} onClick={() => onPageChange(item)} className={`min-w-8 rounded-lg border px-2 py-1.5 font-semibold transition-colors ${page === item ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/40 font-bold text-violet-700 dark:text-violet-300' : 'border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'}`}>{item}</button>)}
        <button disabled={page === total} onClick={() => onPageChange(page + 1)} className="rounded-lg border border-slate-200 dark:border-slate-800 px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 transition-colors">Next</button>
      </nav>
    </div>
  );
}

interface Props {
  employees: Employee[];
  selectedEmployee: Employee | null;
  onSelectEmployee: (employee: Employee) => void;
  roles: MarketplaceRole[];
  requirements: RoleRequirement[];
  resources: LearningResourceRow[];
  progress: ProgressRow[];
  onUpdateProgress?: (row: ProgressRow) => void;
  userRole?: string;
  onReloadData?: () => Promise<void>;
  onShowToast?: (msg: string) => void;
}

export const NearQualifiedTab: React.FC<Props> = ({
  employees,
  selectedEmployee,
  onSelectEmployee,
  roles,
  requirements,
  resources,
  progress,
  onUpdateProgress,
  userRole,
  onReloadData,
  onShowToast
}) => {
  const isHr = userRole === 'HR_Admin';
  const canManage = isHr || userRole === 'Manager';
  const openRoles = roles.filter(role => role.status !== 'Closed');
  const [roleId, setRoleId] = useState(openRoles[0]?.id || roles[0]?.id || '');
  const [subView, setSubView] = useState<'roles' | 'learners' | 'shortages' | 'catalog'>('roles');
  const [learnerStatusFilter, setLearnerStatusFilter] = useState<'all' | 'in_progress' | 'awaiting' | 'completed'>('all');
  const [learnerSearch, setLearnerSearch] = useState('');

  // Org Shortages filters and search
  const [shortageSearch, setShortageSearch] = useState('');
  const [shortageFilter, setShortageFilter] = useState<'all' | 'critical' | 'severe' | 'no_course' | 'has_candidates'>('all');
  const [shortageSort, setShortageSort] = useState<'demand' | 'coverage' | 'gaps'>('demand');

  const [nearPage, setNearPage] = useState(1);
  const [qualifiedPage, setQualifiedPage] = useState(1);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');

  // Modals for HR
  const [showAddCourseModal, setShowAddCourseModal] = useState(false);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Add course form
  const [courseTitle, setCourseTitle] = useState('');
  const [courseSkillId, setCourseSkillId] = useState('skill-react');
  const [courseProvider, setCourseProvider] = useState('Internal Academy');
  const [courseType, setCourseType] = useState('course');
  const [courseWeeks, setCourseWeeks] = useState('2');
  const [courseTargetLevel, setCourseTargetLevel] = useState('Advanced');
  const [courseMentorId, setCourseMentorId] = useState('');

  // Enroll form
  const [enrollEmpId, setEnrollEmpId] = useState('');
  const [enrollRoleId, setEnrollRoleId] = useState(roleId || openRoles[0]?.id || '');
  const [enrollResourceId, setEnrollResourceId] = useState(resources[0]?.resource_id || '');
  const [enrollProgress, setEnrollProgress] = useState('0');

  const role = roles.find(item => item.id === roleId) || openRoles[0] || roles[0];
  const uniqueEmployees = useMemo(() => [...new Map(employees.map(person => [person.id, person])).values()], [employees]);

  const allDepartments = useMemo(() => {
    const set = new Set<string>();
    uniqueEmployees.forEach(e => {
      if (e.department) set.add(e.department);
    });
    return ['all', ...Array.from(set)];
  }, [uniqueEmployees]);

  const qualifiedMentors = useMemo(() => {
    if (!courseSkillId) return [];
    return uniqueEmployees.filter(emp =>
      emp.skills.some(s => s.skillId === courseSkillId && (s.proficiencyLevel === 'Expert' || s.proficiencyLevel === 'Master'))
    );
  }, [uniqueEmployees, courseSkillId]);

  const analyses = useMemo(() => role ? analyzeEmployeesForRole(uniqueEmployees, role, requirements, resources, progress, CSV_DATA.skillsData) : [], [uniqueEmployees, role, requirements, resources, progress]);
  
  const qualified = analyses.filter(result => result.status === 'Qualified').sort((a,b) => b.readinessPercent - a.readinessPercent || a.employee.name.localeCompare(b.employee.name));
  const near = analyses.filter(result => result.status === 'Near-Qualified').sort((a,b) => b.readinessPercent - a.readinessPercent || Number(a.overloaded) - Number(b.overloaded) || b.employee.availabilityPercent - a.employee.availabilityPercent);
  
  const filteredNear = useMemo(() => {
    let list = near;
    if (departmentFilter !== 'all') {
      list = list.filter(n => n.employee.department === departmentFilter);
    }
    if (candidateSearch.trim()) {
      const q = candidateSearch.toLowerCase();
      list = list.filter(n => n.employee.name.toLowerCase().includes(q) || n.employee.role.toLowerCase().includes(q));
    }
    return list;
  }, [near, candidateSearch, departmentFilter]);

  const nearPageItems = filteredNear.slice((nearPage - 1) * PAGE_SIZE, nearPage * PAGE_SIZE);
  const filteredQualified = useMemo(() => {
    let list = qualified;
    if (departmentFilter !== 'all') {
      list = list.filter(item => item.employee.department === departmentFilter);
    }
    if (candidateSearch.trim()) {
      const q = candidateSearch.toLowerCase();
      list = list.filter(item => item.employee.name.toLowerCase().includes(q) || item.employee.role.toLowerCase().includes(q));
    }
    return list;
  }, [qualified, candidateSearch, departmentFilter]);
  const qualifiedPageItems = filteredQualified.slice((qualifiedPage - 1) * PAGE_SIZE, qualifiedPage * PAGE_SIZE);

  const allLearnerProgress = useMemo(() => {
    return progress
      .filter(p => p.status !== 'Dropped')
      .map(p => {
        const emp = uniqueEmployees.find(e => e.id === p.employee_id || e.id.includes(p.employee_id) || p.employee_id.includes(e.id));
        const res = resources.find(r => r.resource_id === p.resource_id);
        const roleObj = roles.find(r => r.id === p.role_id);
        const pct = Number(p.progress_percent || 0);
        return {
          ...p,
          employee: emp,
          resource: res,
          employeeName: emp?.display_label || emp?.name || p.employee_id,
          employeeRole: emp?.role || 'Engineer',
          employeeDepartment: emp?.department || 'Engineering',
          courseTitle: res?.title || p.resource_id,
          provider: res?.provider || 'Internal Academy',
          roleTitle: roleObj?.title || p.role_id,
          pct,
          isCompleted: pct >= 100 || p.status === 'Done',
          isAwaiting: p.status === 'Awaiting approval'
        };
      });
  }, [progress, uniqueEmployees, resources, roles]);

  const filteredLearners = useMemo(() => {
    let list = allLearnerProgress;
    if (learnerStatusFilter === 'in_progress') {
      list = list.filter(l => !l.isCompleted && !l.isAwaiting);
    } else if (learnerStatusFilter === 'awaiting') {
      list = list.filter(l => l.isAwaiting);
    } else if (learnerStatusFilter === 'completed') {
      list = list.filter(l => l.isCompleted);
    }
    if (learnerSearch.trim()) {
      const q = learnerSearch.toLowerCase();
      list = list.filter(l =>
        l.employeeName.toLowerCase().includes(q) ||
        l.courseTitle.toLowerCase().includes(q) ||
        l.employeeDepartment.toLowerCase().includes(q) ||
        l.roleTitle.toLowerCase().includes(q)
      );
    }
    return list;
  }, [allLearnerProgress, learnerStatusFilter, learnerSearch]);

  const shortage = useMemo(() => skillShortages(uniqueEmployees, openRoles, requirements), [uniqueEmployees, openRoles, requirements]);

  const enrichedShortages = useMemo(() => {
    return shortage.map(item => {
      const skillMeta = CSV_DATA.skillsData.find(s => s.id === item.skillId);
      const impactingRoles = openRoles.filter(r =>
        requirements.some(req => req.role_id === r.id && req.skill_id === item.skillId) ||
        r.requiredSkills.some(rs => rs.skillId === item.skillId)
      );

      let maxLevelNum = 2;
      let highestReqLevel = 'Intermediate';

      impactingRoles.forEach(r => {
        const req = requirements.find(rq => rq.role_id === r.id && rq.skill_id === item.skillId);
        const reqLevel = req?.required_level || r.requiredSkills.find(s => s.skillId === item.skillId)?.level || 'Intermediate';
        const num = levelNumber(reqLevel);
        if (num > maxLevelNum) {
          maxLevelNum = num;
          highestReqLevel = reqLevel;
        }
      });

      const totalHeadcount = uniqueEmployees.length;
      const qualifiedEmps = uniqueEmployees.filter(emp => {
        const s = emp.skills.find(sk => sk.skillId === item.skillId);
        return s && levelNumber(s.proficiencyLevel) >= maxLevelNum;
      });
      const qualifiedCount = qualifiedEmps.length;
      const qualifiedPct = totalHeadcount > 0 ? Math.round((qualifiedCount / totalHeadcount) * 100) : 0;

      const nearReadyEmps = uniqueEmployees.filter(emp => {
        const s = emp.skills.find(sk => sk.skillId === item.skillId);
        const currentNum = s ? levelNumber(s.proficiencyLevel) : 0;
        return currentNum === maxLevelNum - 1 && currentNum > 0;
      }).sort((a, b) => b.availabilityPercent - a.availabilityPercent);

      const mappedCourse = resources.find(r => r.skill_id === item.skillId);
      const activeEnrollments = progress.filter(p => mappedCourse && p.resource_id === mappedCourse.resource_id && p.status !== 'Dropped');

      let severity: 'critical' | 'severe' | 'moderate' | 'healthy' = 'moderate';
      if (qualifiedCount === 0) {
        severity = 'critical';
      } else if (qualifiedPct < 30) {
        severity = 'severe';
      } else if (qualifiedPct < 60) {
        severity = 'moderate';
      } else {
        severity = 'healthy';
      }

      return {
        ...item,
        skillMeta,
        impactingRoles,
        targetLevelName: highestReqLevel,
        targetLevelNum: maxLevelNum,
        totalHeadcount,
        qualifiedCount,
        qualifiedPct,
        qualifiedEmps,
        nearReadyEmps,
        mappedCourse,
        activeEnrollmentsCount: activeEnrollments.length,
        severity,
      };
    });
  }, [shortage, openRoles, requirements, uniqueEmployees, resources, progress]);

  const filteredShortages = useMemo(() => {
    let list = enrichedShortages;
    if (shortageFilter === 'critical') {
      list = list.filter(s => s.severity === 'critical');
    } else if (shortageFilter === 'severe') {
      list = list.filter(s => s.severity === 'critical' || s.severity === 'severe');
    } else if (shortageFilter === 'no_course') {
      list = list.filter(s => !s.mappedCourse);
    } else if (shortageFilter === 'has_candidates') {
      list = list.filter(s => s.nearReadyEmps.length > 0);
    }

    if (shortageSearch.trim()) {
      const q = shortageSearch.toLowerCase();
      list = list.filter(s =>
        s.skillName.toLowerCase().includes(q) ||
        (s.skillMeta?.category || '').toLowerCase().includes(q) ||
        s.impactingRoles.some(r => r.title.toLowerCase().includes(q))
      );
    }

    return [...list].sort((a, b) => {
      if (shortageSort === 'demand') {
        return b.impactingRoles.length - a.impactingRoles.length || a.qualifiedPct - b.qualifiedPct;
      }
      if (shortageSort === 'coverage') {
        return a.qualifiedPct - b.qualifiedPct;
      }
      return b.shortage - a.shortage;
    });
  }, [enrichedShortages, shortageFilter, shortageSearch, shortageSort]);

  const criticalBottlenecksCount = useMemo(() => enrichedShortages.filter(s => s.severity === 'critical').length, [enrichedShortages]);
  const missingCoursesCount = useMemo(() => enrichedShortages.filter(s => !s.mappedCourse).length, [enrichedShortages]);
  const fastTrackTalentCount = useMemo(() => enrichedShortages.reduce((sum, s) => sum + s.nearReadyEmps.length, 0), [enrichedShortages]);
  
  const employee = uniqueEmployees.find(person => person.id === selectedEmployee?.id) || near[0]?.employee || qualified[0]?.employee || uniqueEmployees[0];
  const analysis: RoleGapAnalysis | undefined = analyses.find(item => item.employee.id === employee?.id);

  const updateProgress = async (personId: string, resource: LearningResourceRow, value: number) => {
    try {
      const res = await apiFetch('/api/upskilling-progress', {
        method: 'POST',
        body: JSON.stringify({
          employee_id: personId,
          role_id: role.id,
          resource_id: resource.resource_id,
          progress_percent: String(value),
          status: value >= 100 ? 'Done' : value > 0 ? 'In progress' : 'Not started',
          updated_at: new Date().toISOString().slice(0, 10)
        })
      });
      if (!res.ok) throw new Error(res.error || 'Failed to save learning progress');
      onUpdateProgress?.({
        employee_id: personId,
        role_id: role.id,
        resource_id: resource.resource_id,
        progress_percent: String(value),
        status: value >= 100 ? 'Done' : value > 0 ? 'In progress' : 'Not started',
        updated_at: new Date().toISOString().slice(0, 10)
      });
      onShowToast?.(`Updated progress to ${value}%`);
      if (onReloadData) await onReloadData();
    } catch (err: any) {
      onShowToast?.(err?.message || 'Failed to save learning progress.');
    }
  };

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseTitle.trim()) {
      onShowToast?.('Please enter a course title.');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await apiFetch('/api/learning-resources', {
        method: 'POST',
        body: JSON.stringify({
          title: courseTitle.trim(),
          skill_id: courseSkillId || 'skill-react',
          provider: courseProvider.trim() || 'Internal Academy',
          type: courseType || 'course',
          duration_weeks: courseWeeks || '2',
          target_level: courseTargetLevel || 'Advanced',
          mentor_employee_id: courseMentorId || ''
        })
      });
      if (!res.ok) throw new Error(res.error || 'Failed to create course');
      onShowToast?.(`Course "${courseTitle}" added to learning catalog!`);
      setShowAddCourseModal(false);
      setCourseTitle('');
      if (onReloadData) await onReloadData();
    } catch (err: any) {
      onShowToast?.(err?.message || 'Failed to create learning resource.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEnrollEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    const empIdToEnroll = enrollEmpId || uniqueEmployees[0]?.id;
    const resIdToEnroll = enrollResourceId || resources[0]?.resource_id;
    const roleIdToEnroll = enrollRoleId || openRoles[0]?.id || role.id;
    if (!empIdToEnroll || !resIdToEnroll) {
      onShowToast?.('Please select an employee and learning resource.');
      return;
    }
    setIsSubmitting(true);
    try {
      const val = Number(enrollProgress);
      const res = await apiFetch('/api/upskilling-progress', {
        method: 'POST',
        body: JSON.stringify({
          employee_id: empIdToEnroll,
          role_id: roleIdToEnroll,
          resource_id: resIdToEnroll,
          progress_percent: String(val),
          status: val >= 100 ? 'Done' : val > 0 ? 'In progress' : 'Not started',
          updated_at: new Date().toISOString().slice(0, 10)
        })
      });
      if (!res.ok) throw new Error(res.error || 'Failed to enroll employee');
      const empObj = uniqueEmployees.find(e => e.id === empIdToEnroll);
      const resObj = resources.find(r => r.resource_id === resIdToEnroll);
      onShowToast?.(`Enrolled ${(empObj as any)?.display_label || empObj?.name || 'Employee'} in ${resObj?.title || 'Course'}!`);
      setShowEnrollModal(false);
      if (onReloadData) await onReloadData();
    } catch (err: any) {
      onShowToast?.(err?.message || 'Failed to enroll employee.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!role) return <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-slate-500">No roles are available in roles.csv.</div>;

  return (
    <div className="space-y-6 pb-12">
      {/* ── Header & Action Controls ── */}
      <section className={`relative overflow-hidden rounded-2xl border p-6 shadow-sm transition-all ${
        isHr
          ? 'border-violet-500/20 bg-gradient-to-br from-violet-500/[0.07] via-surface to-surface'
          : 'border-[#19C3E6]/20 bg-gradient-to-br from-[#19C3E6]/[0.07] via-surface to-surface'
      }`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-2xs font-bold uppercase tracking-wider mb-2 ${
              isHr
                ? 'bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-500/30'
                : 'bg-[#19C3E6]/10 text-cyan-600 dark:text-cyan-400 border border-[#19C3E6]/30'
            }`}>
              <GraduationCap className="h-3.5 w-3.5" />
              <span>{isHr ? 'HR People Intelligence & Readiness' : 'Talent & Readiness Management'}</span>
            </div>
            <h2 className="text-2xl font-extrabold text-text-primary tracking-tight font-sora">
              Upskilling &amp; Strategic Role Gaps
            </h2>
            <p className="mt-1 text-xs text-text-muted max-w-2xl">
              Evidence-based talent pipelines, company-wide skill shortage analysis, and learning track administration.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Sub-view switcher */}
            <div className="flex items-center rounded-xl border border-border bg-surface p-1 shadow-2xs">
              <button
                onClick={() => setSubView('roles')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  subView === 'roles'
                    ? isHr ? 'bg-violet-600 text-white font-bold shadow-2xs' : 'bg-[#19C3E6] text-slate-950 font-bold shadow-2xs'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <Target className="h-3.5 w-3.5" />
                <span>Role Pipelines</span>
              </button>
              <button
                onClick={() => setSubView('learners')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  subView === 'learners'
                    ? isHr ? 'bg-violet-600 text-white font-bold shadow-2xs' : 'bg-[#19C3E6] text-slate-950 font-bold shadow-2xs'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                <span>Active Learners ({allLearnerProgress.length})</span>
              </button>
              <button
                onClick={() => setSubView('shortages')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  subView === 'shortages'
                    ? isHr ? 'bg-violet-600 text-white font-bold shadow-2xs' : 'bg-[#19C3E6] text-slate-950 font-bold shadow-2xs'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <BarChart3 className="h-3.5 w-3.5" />
                <span>Org Shortages ({shortage.length})</span>
              </button>
              <button
                onClick={() => setSubView('catalog')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                  subView === 'catalog'
                    ? isHr ? 'bg-violet-600 text-white font-bold shadow-2xs' : 'bg-[#19C3E6] text-slate-950 font-bold shadow-2xs'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <BookOpen className="h-3.5 w-3.5" />
                <span>Learning Catalog ({resources.length})</span>
              </button>
            </div>

            {/* HR and Manager Action Buttons */}
            {canManage && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setEnrollEmpId(employee?.id || uniqueEmployees[0]?.id || '');
                    setShowEnrollModal(true);
                  }}
                  className="flex items-center gap-1.5 rounded-xl border border-[#B14AFF]/30 bg-[#B14AFF]/10 hover:bg-[#B14AFF]/20 px-3.5 py-2 text-xs font-sora font-semibold text-[#B14AFF] transition-colors cursor-pointer"
                >
                  <UserCheck className="h-3.5 w-3.5 text-[#B14AFF]" />
                  <span>Enroll Learner</span>
                </button>
                <button
                  onClick={() => setShowAddCourseModal(true)}
                  className="flex items-center gap-1.5 rounded-xl aurora-btn-primary text-white px-3.5 py-2 text-xs font-sora font-semibold shadow-md transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add Course</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Top Level Org Metrics KPI Bar ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-border bg-surface p-4.5 shadow-sm transition-all hover:border-border/80">
          <p className="text-2xs font-bold uppercase tracking-wider text-text-muted">Directly Qualified</p>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">{qualified.length}</span>
            <span className="text-2xs text-text-muted">100% Must skills met</span>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4.5 shadow-sm transition-all hover:border-border/80">
          <p className="text-2xs font-bold uppercase tracking-wider text-text-muted">Near-Qualified Pipeline</p>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-black text-amber-500 dark:text-amber-400 font-mono tabular-nums">{near.length}</span>
            <span className="text-2xs text-text-muted">Ready in 2-4 wks</span>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4.5 shadow-sm transition-all hover:border-border/80">
          <p className="text-2xs font-bold uppercase tracking-wider text-text-muted">Strategic Shortages</p>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-black text-amber-500 dark:text-amber-400 font-mono tabular-nums">{shortage.length}</span>
            <span className="text-2xs text-text-muted">High-priority deficits</span>
          </div>
        </div>
        <div className="rounded-2xl border border-border bg-surface p-4.5 shadow-sm transition-all hover:border-border/80">
          <p className="text-2xs font-bold uppercase tracking-wider text-text-muted">Internal Courses</p>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400 font-mono tabular-nums">{resources.length}</span>
            <span className="text-2xs text-text-muted">{progress.filter(p => Number(p.progress_percent) > 0).length} actively enrolled</span>
          </div>
        </div>
      </div>

      {/* Role-Specific Understanding Guide Banner */}
      {isHr ? (
        <div className="p-4 rounded-2xl border border-violet-500/25 bg-surface/90 backdrop-blur-xs text-xs space-y-2.5 shadow-2xs">
          <div className="flex items-center gap-2 font-bold text-violet-700 dark:text-violet-300">
            <Sparkles className="w-4 h-4 text-violet-500" />
            <span>HR People Intelligence: Understanding Talent Readiness</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-text-muted">
            <div className="p-3 rounded-xl bg-surface border border-border/80 space-y-1 shadow-2xs">
              <strong className="text-emerald-600 dark:text-emerald-400 block font-bold">1. Directly Qualified ({qualified.length})</strong>
              <span>Meets 100% of Must-have skills with verified proof. Ready for immediate role placement or project transfer today!</span>
            </div>
            <div className="p-3 rounded-xl bg-surface border border-border/80 space-y-1 shadow-2xs">
              <strong className="text-amber-600 dark:text-amber-400 block font-bold">2. Near-Qualified Pipeline ({near.length})</strong>
              <span>High-readiness candidates needing only 1–2 skills bridged (2–4 weeks). Click &quot;Enroll Learner&quot; to bridge their gaps with academy courses!</span>
            </div>
            <div className="p-3 rounded-xl bg-surface border border-border/80 space-y-1 shadow-2xs">
              <strong className="text-blue-600 dark:text-blue-400 block font-bold">3. Strategic Shortages ({shortage.length})</strong>
              <span>Organization-wide skill deficits across all open roles. Use these insights to budget training or plan talent acquisition.</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-2xl border border-[#19C3E6]/25 bg-surface/90 backdrop-blur-xs text-xs space-y-2.5 shadow-2xs">
          <div className="flex items-center gap-2 font-bold text-cyan-700 dark:text-cyan-300">
            <Users className="w-4 h-4 text-[#19C3E6]" />
            <span>Manager Coaching Guide: Team Capability &amp; Succession Readiness</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-text-muted">
            <div className="p-3 rounded-xl bg-surface border border-border/80 space-y-1 shadow-2xs">
              <strong className="text-emerald-600 dark:text-emerald-400 block font-bold">Team Readiness Tracking</strong>
              <span>Benchmark your direct reports against open company roles to prepare high-performers for career milestones.</span>
            </div>
            <div className="p-3 rounded-xl bg-surface border border-border/80 space-y-1 shadow-2xs">
              <strong className="text-cyan-600 dark:text-cyan-400 block font-bold">Bridging Skill Deficits</strong>
              <span>Inspect each engineer&apos;s specific competency gaps and support them with weekly study time and internal courses.</span>
            </div>
            <div className="p-3 rounded-xl bg-surface border border-border/80 space-y-1 shadow-2xs">
              <strong className="text-indigo-600 dark:text-indigo-400 block font-bold">Peer Mentorship</strong>
              <span>Pair near-qualified engineers with senior Experts and Masters on your team to accelerate knowledge transfer.</span>
            </div>
          </div>
        </div>
      )}

      {/* ════════ SUB-VIEW 1: TARGET ROLE READINESS ════════ */}
      {subView === 'roles' && (
        <>
          {/* Role selector pill strip & Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 shadow-sm">
            <div className="flex items-center gap-2 overflow-x-auto max-w-full pb-1 sm:pb-0">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 shrink-0 mr-1">Target Role:</span>
              {openRoles.map(item => (
                <button
                  key={item.id}
                  onClick={() => { setRoleId(item.id); setNearPage(1); setQualifiedPage(1); }}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all shrink-0 ${
                    role.id === item.id
                      ? isHr
                        ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 font-bold shadow-2xs'
                        : 'border-[#19C3E6] bg-[#19C3E6]/10 text-cyan-600 dark:text-cyan-400 font-bold shadow-2xs'
                      : 'border-border bg-surface hover:bg-surface-alt text-text-muted hover:text-text-primary'
                  }`}
                >
                  {item.title}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              {/* Department Filter for Team Scoping */}
              <div className="flex items-center gap-1.5">
                <span className="text-2xs font-bold text-text-muted">Dept:</span>
                <select
                  value={departmentFilter}
                  onChange={e => { setDepartmentFilter(e.target.value); setNearPage(1); }}
                  className="rounded-xl border border-border bg-surface-alt px-2.5 py-1.5 text-xs font-semibold text-text-primary focus:border-[#19C3E6] focus:outline-none"
                >
                  <option value="all">All Departments</option>
                  {allDepartments.filter(d => d !== 'all').map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              {/* Candidate Search Filter */}
              <div className="relative min-w-44">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
                <input
                  type="text"
                  value={candidateSearch}
                  onChange={e => { setCandidateSearch(e.target.value); setNearPage(1); }}
                  placeholder="Filter candidate..."
                  className="w-full rounded-xl border border-border bg-surface-alt py-1.5 pl-8 pr-6 text-xs text-text-primary placeholder:text-text-muted focus:border-[#19C3E6] focus:outline-none"
                />
                {candidateSearch && (
                  <button onClick={() => setCandidateSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary text-xs cursor-pointer">✕</button>
                )}
              </div>
            </div>
          </div>

          {/* Near-Qualified & Qualified Lists */}
          <div className="grid gap-5 xl:grid-cols-2">
            {/* Near-Qualified Table */}
            <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-text-primary text-sm flex items-center gap-2 font-sora">
                  <span>Near-Qualified Talent Pipeline</span>
                  <span className="rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 px-2 py-0.5 text-2xs font-bold font-mono tabular-nums">
                    {filteredNear.length}
                  </span>
                </h3>
                <span className="text-2xs text-text-muted">Click row to inspect learning track</span>
              </div>

              {filteredNear.length ? (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[580px] table-fixed text-left text-xs">
                      <colgroup>
                        <col className="w-[32%]" />
                        <col className="w-[18%]" />
                        <col className="w-[28%]" />
                        <col className="w-[11%]" />
                        <col className="w-[11%]" />
                      </colgroup>
                      <thead className="text-2xs uppercase text-text-muted border-b border-border font-bold">
                        <tr>
                          <th className="pb-2.5 pl-2">Candidate</th>
                          <th className="pb-2.5">Readiness</th>
                          <th className="pb-2.5">Skill Gaps</th>
                          <th className="pb-2.5">Avail</th>
                          <th className="pb-2.5">ETA</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {nearPageItems.map(item => (
                          <tr
                            key={item.employee.id}
                            tabIndex={0}
                            aria-selected={employee.id === item.employee.id}
                            onClick={() => onSelectEmployee(item.employee)}
                            className={`cursor-pointer transition-colors hover:bg-surface-alt ${
                              employee.id === item.employee.id ? (isHr ? 'bg-violet-50/40 dark:bg-violet-950/30 font-semibold' : 'bg-cyan-500/10 dark:bg-cyan-950/30 font-semibold') : ''
                            }`}
                          >
                            <td className={`py-3 pl-2 ${employee.id === item.employee.id ? (isHr ? 'border-l-[3px] border-violet-600' : 'border-l-[3px] border-[#19C3E6]') : ''}`}>
                              <span className="font-bold text-text-primary text-xs block truncate">{item.employee.name}</span>
                              <span className="text-2xs text-text-muted block truncate">{item.employee.role}</span>
                            </td>
                            <td className="py-3">
                              <span className="font-extrabold text-amber-500 dark:text-amber-400 font-mono tabular-nums text-xs">{item.readinessPercent}%</span>
                              <span className="block text-2xs text-text-muted">{item.confidenceLabel} conf</span>
                            </td>
                            <td className="py-3 pr-2 text-xs text-text-muted">
                              {item.gaps.slice(0, 2).map(gap => (
                                <span key={gap.skillId} className="block text-2xs truncate">
                                  {gap.skillName}: {gap.currentLevel.slice(0, 3)}→{gap.requiredLevel.slice(0, 3)}
                                </span>
                              ))}
                              {item.gaps.length > 2 && (
                                <span className="text-[10px] text-text-muted">+{item.gaps.length - 2} more</span>
                              )}
                            </td>
                            <td className="py-3 text-xs font-semibold text-text-primary font-mono tabular-nums">{item.employee.availabilityPercent}%</td>
                            <td className="py-3 text-2xs text-text-muted whitespace-nowrap">{item.readyInWeeksRange}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination count={filteredNear.length} page={nearPage} onPageChange={setNearPage} label="Near-Qualified candidates" />
                </>
              ) : (
                <p className="py-6 text-center text-xs text-slate-400">No employees meet the Near-Qualified rule for this role.</p>
              )}
            </section>

            {/* Qualified Employees List */}
            <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                  <span>Fully Qualified Employees</span>
                  <span className="rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 px-2 py-0.5 text-2xs font-bold font-mono tabular-nums">
                    {filteredQualified.length}
                  </span>
                </h3>
              </div>

              {filteredQualified.length ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {qualifiedPageItems.map(item => (
                      <button
                        key={item.employee.id}
                        onClick={() => onSelectEmployee(item.employee)}
                        className={`rounded-xl border p-3 text-left transition-all ${
                          employee.id === item.employee.id
                            ? 'border-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20 shadow-2xs ring-1 ring-emerald-500/30'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <Avatar name={item.employee.name} className="h-8 w-8 text-2xs shrink-0 rounded-lg" />
                          <div className="min-w-0 flex-1">
                            <strong className="block text-xs font-bold text-slate-900 dark:text-white truncate">{item.employee.name}</strong>
                            <span className="block text-2xs text-slate-400 truncate">{item.employee.role}</span>
                          </div>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-2xs pt-1.5 border-t border-slate-100 dark:border-slate-800">
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">✓ 100% Ready</span>
                          <span className="text-slate-400">{item.employee.availabilityPercent}% free</span>
                        </div>
                      </button>
                    ))}
                  </div>
                  <Pagination count={filteredQualified.length} page={qualifiedPage} onPageChange={setQualifiedPage} label="Qualified employees" />
                </>
              ) : (
                <p className="py-6 text-center text-xs text-slate-400">No employees currently meet every Must skill required.</p>
              )}
            </section>
          </div>

          {/* Selected Employee Detailed Gap Breakdown & Learning Path */}
          {analysis && (
            <section className="rounded-2xl border border-border bg-surface p-6 shadow-sm space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <Avatar name={employee.name} className={`h-12 w-12 text-sm shrink-0 rounded-xl ring-2 ${isHr ? 'ring-violet-500/30' : 'ring-[#19C3E6]/30'}`} />
                  <div>
                    <h3 className="font-bold text-text-primary text-base font-sora">
                      {employee.name} · Learning Track for {role.title}
                    </h3>
                    <p className="text-xs text-text-muted">
                      {employee.role} ({employee.department}) · {analysis.status}
                      {analysis.overloaded ? ' · Overloaded' : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <span className={`text-2xl font-black font-mono tabular-nums ${analysis.status === 'Qualified' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-500 dark:text-amber-400'}`}>{analysis.readinessPercent}%</span>
                    <span className="block text-2xs text-text-muted">{analysis.confidenceLabel} confidence</span>
                  </div>
                  <span className={`rounded-xl border px-3 py-1.5 text-xs font-bold font-mono tabular-nums ${
                    analysis.status === 'Qualified'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
                      : 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                  }`}>
                    {analysis.status === 'Qualified' ? '✓ Directly Qualified (Ready Today)' : `Est. ${analysis.readyInWeeksRange} to Ready`}
                  </span>
                </div>
              </div>

              {/* Learning Path & Assigned Resources */}
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider mb-3">
                  Recommended Courses &amp; Progress
                </h4>

                {analysis.gaps.length ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {analysis.gaps.map(gap => {
                      const resource = gap.resource;
                      const saved = resource && progress.find(row => row.employee_id === employee.id && row.role_id === role.id && row.resource_id === resource.resource_id);
                      const pct = Number(saved?.progress_percent || 0);

                      return (
                        <div key={gap.skillId} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 p-4 flex flex-col justify-between">
                          <div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold text-slate-900 dark:text-white text-xs">{gap.skillName}</span>
                              <span className="rounded-lg bg-white dark:bg-slate-900 px-2 py-0.5 text-2xs font-semibold text-slate-500 border border-slate-200 dark:border-slate-800">
                                {gap.importance}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                              Current: <span className="text-slate-900 dark:text-white font-medium">{gap.currentLevel}</span> → Target: <span className="text-indigo-600 dark:text-indigo-400 font-bold">{gap.requiredLevel}</span> (Gap: {gap.gapSize})
                            </p>
                            {gap.explanation && (
                              <p className="text-2xs text-slate-400 mt-0.5">{gap.explanation}</p>
                            )}
                          </div>

                          {resource ? (
                            <div className="mt-3 rounded-xl bg-white dark:bg-slate-900 p-3 border border-slate-200 dark:border-slate-800 space-y-2.5">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2 min-w-0">
                                  <BookOpen className="h-4 w-4 text-violet-500 shrink-0 mt-0.5" />
                                  <div className="min-w-0 flex-1">
                                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{resource.title}</p>
                                    <p className="text-2xs text-slate-400">
                                      {resource.provider} · {resource.duration_weeks} wks
                                      {gap.mentor ? ` · Mentor: ${gap.mentor.name}` : ''}
                                    </p>
                                  </div>
                                </div>
                                {canManage && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEnrollEmpId(employee.id);
                                      setEnrollRoleId(role.id);
                                      setEnrollResourceId(resource.resource_id);
                                      setShowEnrollModal(true);
                                    }}
                                    className="rounded-lg border border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/20 px-2.5 py-1 text-2xs font-bold text-violet-700 dark:text-violet-300 flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                                    title="Quick enroll this employee in this recommended course"
                                  >
                                    <Sparkles className="w-3 h-3 text-violet-500" />
                                    <span>Quick Enroll</span>
                                  </button>
                                )}
                              </div>

                              {/* Progress Slider / Select */}
                              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-slate-500">Progress:</span>
                                {onUpdateProgress ? (
                                  <select
                                    value={pct >= 100 ? '100' : pct > 0 ? String(pct) : '0'}
                                    onChange={e => updateProgress(employee.id, resource, Number(e.target.value))}
                                    className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 px-2.5 py-1 text-xs text-slate-900 dark:text-white font-bold focus:outline-none focus:border-violet-500"
                                  >
                                    <option value="0">0% (Not Started)</option>
                                    <option value="25">25% (In Progress)</option>
                                    <option value="50">50% (Halfway)</option>
                                    <option value="75">75% (Advanced)</option>
                                    <option value="100">100% (Completed)</option>
                                  </select>
                                ) : (
                                  <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">{pct}%</span>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="mt-3 flex items-center justify-between gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 p-2.5 rounded-xl border border-amber-500/20">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">No course mapped for this skill gap.</span>
                              </div>
                              {canManage && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCourseSkillId(gap.skillId);
                                    setCourseTitle(`${gap.skillName} Training`);
                                    setShowAddCourseModal(true);
                                  }}
                                  className="rounded-lg bg-amber-600 hover:bg-amber-700 text-white px-2 py-0.5 text-2xs font-bold transition-colors shrink-0 cursor-pointer"
                                >
                                  + Add Course
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-4 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                    <span>Candidate already qualifies for every Must skill! Ready for placement.</span>
                  </div>
                )}
              </div>
            </section>
          )}
        </>
      )}

      {/* ════════ SUB-VIEW 2: ORG SKILL SHORTAGE MATRIX ════════ */}
      {subView === 'shortages' && (
        <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-6">
          {/* Executive Header & KPI Banner */}
          <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/[0.08] via-surface to-surface p-5 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 px-3 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wider mb-2">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                  <span>Executive Workforce Intelligence</span>
                </div>
                <h3 className="font-extrabold text-slate-900 dark:text-white text-xl tracking-tight">
                  Organization-Wide Strategic Skill Shortages
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl mt-1 leading-relaxed">
                  Real-time analysis comparing open role skill demand against active employee supply. Identify zero-coverage bottlenecks, missing training curricula, and fast-track near-ready candidates.
                </p>
              </div>

              {/* Action buttons */}
              {canManage && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const missingTrack = enrichedShortages.find(s => !s.mappedCourse);
                      const targetSkill = missingTrack?.skillId || enrichedShortages[0]?.skillId || 'skill-react';
                      const targetName = missingTrack?.skillName || enrichedShortages[0]?.skillName || 'Engineering';
                      setCourseSkillId(targetSkill);
                      setCourseTitle(missingTrack ? `${missingTrack.skillName} Accelerated Program` : `${targetName} Accelerated Program`);
                      setCourseTargetLevel(missingTrack?.targetLevelName || 'Advanced');
                      setShowAddCourseModal(true);
                    }}
                    className="rounded-xl px-3.5 py-2 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create Training Track</span>
                  </button>
                </div>
              )}
            </div>

            {/* KPI Cards Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-amber-500/20">
              <div className="p-3.5 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 shadow-2xs">
                <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">Total Shortage Areas</div>
                <div className="text-xl font-black text-slate-900 dark:text-white mt-0.5">{enrichedShortages.length}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Across {openRoles.length} open roles</div>
              </div>
              <div className="p-3.5 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 shadow-2xs">
                <div className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Zero Qualified (0 Staff)
                </div>
                <div className="text-xl font-black text-rose-600 dark:text-rose-400 mt-0.5">{criticalBottlenecksCount}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">Urgent hiring or training needed</div>
              </div>
              <div className="p-3.5 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 shadow-2xs">
                <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <BookOpen className="w-3 h-3" /> Missing Course Tracks
                </div>
                <div className="text-xl font-black text-amber-600 dark:text-amber-400 mt-0.5">{missingCoursesCount}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">No internal course mapped</div>
              </div>
              <div className="p-3.5 rounded-xl bg-white/80 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 shadow-2xs">
                <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Fast-Track Candidates
                </div>
                <div className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-0.5">{fastTrackTalentCount}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">1 level away from qualifying</div>
              </div>
            </div>
          </div>

          {/* Interactive Toolbar: Filter Pills, Search & Sort */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pt-1">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {[
                { id: 'all', label: `All Areas (${enrichedShortages.length})` },
                { id: 'critical', label: `🚨 Zero Qualified (${criticalBottlenecksCount})` },
                { id: 'severe', label: `⚠️ Severe Deficits (<30%)` },
                { id: 'no_course', label: `📚 Missing Tracks (${missingCoursesCount})` },
                { id: 'has_candidates', label: `🎯 Has Near-Ready Talent` },
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setShortageFilter(tab.id as typeof shortageFilter)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    shortageFilter === tab.id
                      ? 'bg-amber-600 text-white shadow-2xs font-bold'
                      : 'bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative shrink-0 w-full sm:w-56">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search skill, role, domain..."
                  value={shortageSearch}
                  onChange={e => setShortageSearch(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-8 pr-3 py-1.5 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <select
                value={shortageSort}
                onChange={e => setShortageSort(e.target.value as typeof shortageSort)}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none cursor-pointer"
              >
                <option value="demand">Sort: Most Blocked Roles</option>
                <option value="coverage">Sort: Lowest Supply Coverage</option>
                <option value="gaps">Sort: Total Gaps</option>
              </select>
            </div>
          </div>

          {/* Shortages Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {filteredShortages.map(item => {
              const relatedSkills = item.skillMeta?.relatedSkills || [];
              const isZeroQualified = item.qualifiedCount === 0;
              const isSevere = item.severity === 'severe' || isZeroQualified;

              return (
                <div
                  key={item.skillId}
                  className={`rounded-2xl border bg-slate-50/50 dark:bg-slate-800/40 p-5 space-y-4 hover:shadow-md transition-all ${
                    isZeroQualified
                      ? 'border-rose-500/40 bg-rose-500/[0.02]'
                      : isSevere
                      ? 'border-amber-500/30 bg-amber-500/[0.02]'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  {/* Header: Skill Name, Category, Severity & Gap Badge */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-extrabold text-slate-900 dark:text-white text-base">
                          {item.skillName}
                        </h4>
                        <span className="rounded-md bg-white dark:bg-slate-900 px-2 py-0.5 border border-slate-200 dark:border-slate-700 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                          {item.skillMeta?.category || 'General'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Target required proficiency: <strong className="text-slate-800 dark:text-slate-200 font-semibold">{item.targetLevelName}</strong> (Level {item.targetLevelNum}/5)
                      </p>
                    </div>

                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`rounded-lg px-2.5 py-1 text-xs font-black border ${
                        isZeroQualified
                          ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30'
                          : isSevere
                          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30'
                          : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30'
                      }`}>
                        {isZeroQualified ? '🚨 0 Qualified' : `${item.qualifiedPct}% Coverage`}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-400">
                        {item.shortage} Gaps Recorded
                      </span>
                    </div>
                  </div>

                  {/* Supply vs Demand Progress Bar */}
                  <div className="rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-900 p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 dark:text-slate-400 font-medium">Workforce Supply vs Demand</span>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {item.qualifiedCount} of {item.totalHeadcount} employees qualified
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isZeroQualified
                            ? 'bg-rose-500'
                            : isSevere
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.max(item.qualifiedPct, 4)}%` }}
                      />
                    </div>
                  </div>

                  {/* Blocked Open Strategic Roles */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <Target className="w-3.5 h-3.5 text-amber-500" />
                        <span>Impacting Open Roles ({item.impactingRoles.length})</span>
                      </span>
                      <span className="text-[10px] text-slate-400">Click to view role talent pool</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {item.impactingRoles.map(r => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => {
                            setRoleId(r.id);
                            setSubView('roles');
                          }}
                          className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-amber-500/50 px-2.5 py-1 text-2xs font-semibold text-slate-800 dark:text-slate-200 hover:text-amber-600 transition-colors flex items-center gap-1 group shadow-2xs cursor-pointer"
                        >
                          <span>{r.title}</span>
                          <ArrowRight className="w-2.5 h-2.5 text-slate-400 group-hover:text-amber-500 group-hover:translate-x-0.5 transition-transform" />
                        </button>
                      ))}
                      {item.impactingRoles.length === 0 && (
                        <span className="text-2xs text-slate-400 italic">No active open roles currently demanding this skill</span>
                      )}
                    </div>
                  </div>

                  {/* Fast-Track Near-Ready Candidates */}
                  <div className="rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-900 p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                        <span>Fast-Track Candidates (1 Level Away)</span>
                      </span>
                      <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                        {item.nearReadyEmps.length} Ready to Upskill
                      </span>
                    </div>

                    {item.nearReadyEmps.length > 0 ? (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {item.nearReadyEmps.slice(0, 4).map(cand => {
                          const candSkill = cand.skills.find(s => s.skillId === item.skillId);
                          return (
                            <div
                              key={cand.id}
                              className="rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 flex items-center justify-between gap-3 text-xs flex-1 min-w-[200px]"
                            >
                              <div className="flex items-center gap-2">
                                <Avatar name={cand.name} role="Employee" size="sm" />
                                <div>
                                  <div className="font-bold text-slate-900 dark:text-white text-xs">{cand.name}</div>
                                  <div className="text-[10px] text-slate-400">{cand.role} • {candSkill?.proficiencyLevel || 'Level 1'}</div>
                                </div>
                              </div>
                              {canManage && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (item.mappedCourse) {
                                      setEnrollEmpId(cand.id);
                                      setEnrollResourceId(item.mappedCourse.resource_id);
                                      setEnrollRoleId(item.impactingRoles[0]?.id || roleId || openRoles[0]?.id || roles[0]?.id || '');
                                      setEnrollProgress('0');
                                      setShowEnrollModal(true);
                                    } else {
                                      setCourseSkillId(item.skillId);
                                      setCourseTitle(`${item.skillName} Accelerated Program`);
                                      setCourseTargetLevel(item.targetLevelName);
                                      onShowToast?.(`No training track exists for ${item.skillName} yet. Create one to enroll ${cand.name}!`);
                                      setShowAddCourseModal(true);
                                    }
                                  }}
                                  className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 text-[10px] font-bold shadow-2xs transition-all cursor-pointer whitespace-nowrap"
                                  title={item.mappedCourse ? `Enroll ${cand.name} in upskilling track` : `Create track for ${item.skillName} to enroll ${cand.name}`}
                                >
                                  ⚡ Enroll
                                </button>
                              )}
                            </div>
                          );
                        })}
                        {item.nearReadyEmps.length > 4 && (
                          <div className="text-[11px] text-slate-500 self-center pl-1">
                            +{item.nearReadyEmps.length - 4} more candidates
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-2xs text-slate-400 italic">
                        No employees currently 1 level below. Foundational academy training or external recruitment recommended.
                      </p>
                    )}
                  </div>

                  {/* Learning Track Status & Action */}
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    {item.mappedCourse ? (
                      <div className="flex items-center gap-2 text-xs">
                        <div className="w-7 h-7 rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center shrink-0">
                          <BookOpen className="w-3.5 h-3.5" />
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white text-xs">{item.mappedCourse.title}</div>
                          <div className="text-[10px] text-slate-400">
                            {item.mappedCourse.duration_weeks} wks • {item.mappedCourse.provider} • {item.activeEnrollmentsCount} actively enrolled
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <span className="text-[11px] font-semibold">No internal training track mapped</span>
                      </div>
                    )}

                    {canManage && (
                      <div className="flex items-center gap-2 shrink-0">
                        {item.mappedCourse ? (
                          <button
                            type="button"
                            onClick={() => {
                              const candidate = item.nearReadyEmps[0]?.id || uniqueEmployees[0]?.id || '';
                              setEnrollEmpId(candidate);
                              setEnrollResourceId(item.mappedCourse!.resource_id);
                              setEnrollRoleId(item.impactingRoles[0]?.id || roleId || openRoles[0]?.id || roles[0]?.id || '');
                              setEnrollProgress('0');
                              setShowEnrollModal(true);
                            }}
                            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-violet-500 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-violet-600 transition-colors shadow-2xs cursor-pointer flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3 text-violet-500" /> Enroll Learner
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setCourseSkillId(item.skillId);
                              setCourseTitle(`${item.skillName} Accelerated Program`);
                              setCourseTargetLevel(item.targetLevelName);
                              setShowAddCourseModal(true);
                            }}
                            className="rounded-xl bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> Create Track
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Transferable Skills hint */}
                  {relatedSkills.length > 0 && (
                    <div className="pt-2 border-t border-slate-200/60 dark:border-slate-800 text-2xs text-slate-400 flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-slate-600 dark:text-slate-400">Adjacent Skills:</span>
                      {relatedSkills.map((rId: string) => {
                        const rName = CSV_DATA.skillsData.find(s => s.id === rId)?.name || rId;
                        return (
                          <span key={rId} className="rounded-md bg-white dark:bg-slate-900 px-1.5 py-0.5 border border-slate-200 dark:border-slate-800 text-[10px] font-medium text-slate-600 dark:text-slate-300">
                            {rName}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {filteredShortages.length === 0 && (
              <div className="col-span-full rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 p-12 text-center space-y-2">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
                <h4 className="font-bold text-slate-900 dark:text-white text-sm">No Shortage Areas Found</h4>
                <p className="text-xs text-slate-500">No skill shortages matching your current filter criteria.</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ════════ SUB-VIEW 3: LEARNING CATALOG & ENROLLMENTS ════════ */}
      {subView === 'catalog' && (
        <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Internal Learning Catalog &amp; Active Tracks
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Managed courses, certifications, and mentorship tracks across the company.
              </p>
            </div>
            {canManage && (
              <button
                onClick={() => setShowAddCourseModal(true)}
                className="flex items-center gap-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white px-3.5 py-2 text-xs font-bold shadow-md transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add New Course</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {resources.map(res => {
              const skill = CSV_DATA.skillsData.find(s => s.id === res.skill_id);
              const mentor = uniqueEmployees.find(e => e.id === res.mentor_employee_id);
              const enrolledCount = progress.filter(p => p.resource_id === res.resource_id && Number(p.progress_percent) > 0).length;

              return (
                <div key={res.resource_id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="rounded-md bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-500/20 px-2 py-0.5 text-2xs font-bold uppercase">
                        {res.type}
                      </span>
                      <span className="text-xs font-semibold text-slate-500">{res.duration_weeks} weeks</span>
                    </div>

                    <h4 className="mt-2 font-bold text-slate-900 dark:text-white text-xs">{res.title}</h4>
                    <p className="text-2xs text-slate-500 dark:text-slate-400 mt-0.5">{res.provider} · Reaches {res.target_level}</p>

                    <div className="mt-3 flex items-center gap-2 text-xs">
                      <span className="rounded-md bg-white dark:bg-slate-900 px-2 py-1 border border-slate-200 dark:border-slate-800 font-medium text-slate-700 dark:text-slate-300 text-2xs">
                        Skill: {skill?.name || res.skill_id}
                      </span>
                    </div>

                    {mentor && (
                      <p className="mt-2 text-2xs text-slate-500 flex items-center gap-1">
                        <span>Mentor:</span>
                        <strong className="text-slate-900 dark:text-white">{mentor.name}</strong>
                      </p>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
                    <span className="text-2xs">{enrolledCount} active learners</span>
                    {canManage && (
                      <button
                        onClick={() => {
                          setEnrollResourceId(res.resource_id);
                          setShowEnrollModal(true);
                        }}
                        className="text-violet-600 dark:text-violet-400 hover:underline font-bold text-xs"
                      >
                        Enroll Employee →
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ════════ SUB-VIEW 4: ACTIVE LEARNERS & ENROLLMENT TRACKING ════════ */}
      {subView === 'learners' && (
        <section className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-2xs font-bold uppercase tracking-wider mb-1 bg-violet-500/10 text-violet-700 dark:text-violet-300 border border-violet-500/20">
                <Users className="h-3.5 w-3.5" /> Company-Wide Training Tracking
              </div>
              <h3 className="font-bold text-slate-900 dark:text-white text-lg font-sora">
                Active Learners &amp; Course Progress
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Monitor team members enrolled in learning tracks, log study milestones, and review course certifications.
              </p>
            </div>
            {canManage && (
              <button
                type="button"
                onClick={() => {
                  setEnrollEmpId(uniqueEmployees[0]?.id || '');
                  setShowEnrollModal(true);
                }}
                className="flex items-center gap-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white px-3.5 py-2 text-xs font-bold shadow-md transition-all self-start sm:self-auto cursor-pointer"
              >
                <UserCheck className="h-3.5 w-3.5" />
                <span>Enroll New Learner</span>
              </button>
            )}
          </div>

          {/* Filters & Search */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Status pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {[
                { id: 'all', label: `All Learners (${allLearnerProgress.length})` },
                { id: 'in_progress', label: `⚡ In Progress (${allLearnerProgress.filter(l => !l.isCompleted && !l.isAwaiting).length})` },
                { id: 'awaiting', label: `⏳ Awaiting Verification (${allLearnerProgress.filter(l => l.isAwaiting).length})` },
                { id: 'completed', label: `✅ Completed (${allLearnerProgress.filter(l => l.isCompleted).length})` },
              ].map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setLearnerStatusFilter(f.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    learnerStatusFilter === f.id
                      ? 'bg-violet-600 text-white font-bold shadow-2xs'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative min-w-48 sm:w-64">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={learnerSearch}
                onChange={e => setLearnerSearch(e.target.value)}
                placeholder="Search learner, course, role..."
                className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 py-1.5 pl-8 pr-6 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-violet-500"
              />
              {learnerSearch && (
                <button onClick={() => setLearnerSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 text-xs cursor-pointer">✕</button>
              )}
            </div>
          </div>

          {/* Learners List */}
          {filteredLearners.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredLearners.map((item, idx) => {
                const res = item.resource;
                return (
                  <div
                    key={`learner-${item.employee_id}-${item.resource_id}-${idx}`}
                    className={`rounded-2xl border p-4.5 space-y-3.5 transition-all shadow-2xs ${
                      item.isCompleted
                        ? 'border-emerald-500/30 bg-emerald-500/5'
                        : item.isAwaiting
                        ? 'border-amber-500/30 bg-amber-500/5'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <Avatar name={item.employeeName} className="h-10 w-10 text-xs shrink-0 rounded-xl" />
                        <div className="min-w-0">
                          <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">
                            {item.employeeName}
                          </h4>
                          <p className="text-2xs text-slate-500 dark:text-slate-400 truncate">
                            {item.employeeRole} • {item.employeeDepartment}
                          </p>
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1 ${
                        item.isCompleted
                          ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                          : item.isAwaiting
                          ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                          : item.pct > 0
                          ? 'bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                      }`}>
                        {item.isCompleted ? (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Completed
                          </>
                        ) : item.isAwaiting ? (
                          <>
                            <Clock3 className="w-3 h-3 text-amber-500" /> Awaiting Verification
                          </>
                        ) : item.pct > 0 ? (
                          <>
                            <Clock3 className="w-3 h-3 text-cyan-500" /> In Progress
                          </>
                        ) : (
                          'Not Started'
                        )}
                      </span>
                    </div>

                    {/* Course Information & Role */}
                    <div className="rounded-xl border border-slate-200/80 dark:border-slate-700/80 bg-white dark:bg-slate-900 p-3 space-y-1.5">
                      <div className="flex items-center justify-between text-2xs text-slate-500">
                        <span className="font-semibold text-violet-600 dark:text-violet-400">Target: {item.roleTitle}</span>
                        <span>{item.provider}</span>
                      </div>
                      <p className="text-xs font-bold text-slate-900 dark:text-white">
                        {item.courseTitle}
                      </p>
                      {res && (
                        <div className="flex items-center gap-3 text-2xs text-slate-400 pt-1">
                          <span>Duration: {res.duration_weeks} wks</span>
                          <span>Level: {res.target_level}</span>
                        </div>
                      )}
                    </div>

                    {/* Progress Bar & Inline Quick Update for HR/Manager */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500 text-2xs font-semibold">Study Progress:</span>
                        <span className="font-extrabold font-mono text-slate-900 dark:text-white">{item.pct}%</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            item.isCompleted
                              ? 'bg-emerald-500'
                              : item.isAwaiting
                              ? 'bg-amber-500'
                              : 'bg-violet-600'
                          }`}
                          style={{ width: `${Math.min(100, item.pct)}%` }}
                        />
                      </div>

                      {/* Direct update dropdown for Manager/HR */}
                      {canManage && res && (
                        <div className="pt-2 flex items-center justify-between text-xs border-t border-slate-100 dark:border-slate-800">
                          <span className="text-2xs text-slate-400">Update Status:</span>
                          <select
                            value={item.pct >= 100 ? '100' : item.pct > 0 ? String(item.pct) : '0'}
                            onChange={e => updateProgress(item.employee_id, res, Number(e.target.value))}
                            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-0.5 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-violet-500 cursor-pointer"
                          >
                            <option value="0">0% (Enrolled)</option>
                            <option value="25">25% (Started)</option>
                            <option value="50">50% (Halfway)</option>
                            <option value="75">75% (Advanced)</option>
                            <option value="100">100% (Completed)</option>
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-800 p-8 text-center text-xs text-slate-400">
              No learners found matching this filter. Click &quot;Enroll New Learner&quot; to assign a training track.
            </div>
          )}
        </section>
      )}

      {/* ── Add Course Modal ── */}
      {showAddCourseModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200"
          onMouseDown={e => { if (e.target === e.currentTarget) setShowAddCourseModal(false); }}
        >
          <div className="relative w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-[#B14AFF]/10 text-[#B14AFF] p-2 border border-[#B14AFF]/20">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-sora font-semibold text-text-primary">Add Course to Catalog</h3>
                  <p className="text-xs text-text-muted">Add a new verified course or mentorship program.</p>
                </div>
              </div>
              <button onClick={() => setShowAddCourseModal(false)} className="rounded-lg p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateCourse} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block text-2xs font-sora font-semibold text-text-muted uppercase tracking-wider mb-1">Course Title *</label>
                <input
                  type="text"
                  required
                  value={courseTitle}
                  onChange={e => setCourseTitle(e.target.value)}
                  placeholder="e.g. Microservices with Docker and Kubernetes"
                  className="w-full rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs text-text-primary focus:border-[#B14AFF] focus:outline-none focus:ring-1 focus:ring-[#B14AFF]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-2xs font-sora font-semibold text-text-muted uppercase tracking-wider mb-1">Target Skill *</label>
                  <select
                    value={courseSkillId}
                    onChange={e => {
                      setCourseSkillId(e.target.value);
                      setCourseMentorId('');
                    }}
                    className="w-full rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs text-text-primary focus:border-[#B14AFF] focus:outline-none"
                  >
                    {CSV_DATA.skillsData.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-2xs font-sora font-semibold text-text-muted uppercase tracking-wider mb-1">Provider *</label>
                  <input
                    type="text"
                    required
                    value={courseProvider}
                    onChange={e => setCourseProvider(e.target.value)}
                    placeholder="e.g. Coursera, Udemy, Internal"
                    className="w-full rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs text-text-primary focus:border-[#B14AFF] focus:outline-none focus:ring-1 focus:ring-[#B14AFF]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-2xs font-sora font-semibold text-text-muted uppercase tracking-wider mb-1">Type</label>
                  <select
                    value={courseType}
                    onChange={e => setCourseType(e.target.value)}
                    className="w-full rounded-xl border border-border bg-surface-muted px-2.5 py-2 text-xs text-text-primary focus:border-[#B14AFF] focus:outline-none"
                  >
                    <option value="course">Course</option>
                    <option value="cert">Cert</option>
                    <option value="project">Project</option>
                    <option value="mentor">Mentorship</option>
                  </select>
                </div>
                <div>
                  <label className="block text-2xs font-sora font-semibold text-text-muted uppercase tracking-wider mb-1">Duration (wks)</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={courseWeeks}
                    onChange={e => setCourseWeeks(e.target.value)}
                    className="w-full rounded-xl border border-border bg-surface-muted px-2.5 py-2 text-xs text-text-primary focus:border-[#B14AFF] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-2xs font-sora font-semibold text-text-muted uppercase tracking-wider mb-1">Target Level</label>
                  <select
                    value={courseTargetLevel}
                    onChange={e => setCourseTargetLevel(e.target.value)}
                    className="w-full rounded-xl border border-border bg-surface-muted px-2.5 py-2 text-xs text-text-primary focus:border-[#B14AFF] focus:outline-none"
                  >
                    <option value="Intermediate">Intermediate</option>
                    <option value="Advanced">Advanced</option>
                    <option value="Expert">Expert</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-2xs font-sora font-semibold text-text-muted uppercase tracking-wider mb-1">Assigned Mentor (Optional - Expert or Master only)</label>
                <select
                  value={courseMentorId}
                  onChange={e => setCourseMentorId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs text-text-primary focus:border-[#B14AFF] focus:outline-none"
                >
                  <option value="">No dedicated mentor (Self-paced)</option>
                  {qualifiedMentors.map(e => {
                    const sk = e.skills.find(s => s.skillId === courseSkillId);
                    return (
                      <option key={e.id} value={e.id}>{e.name} ({e.role}) — {sk?.proficiencyLevel}</option>
                    );
                  })}
                </select>
                {qualifiedMentors.length === 0 && (
                  <p className="mt-1 text-2xs text-text-muted">
                    No employees currently hold Expert or Master proficiency in this skill.
                  </p>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowAddCourseModal(false)}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-text-muted hover:bg-surface-elevated cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-xl aurora-btn-primary text-white px-5 py-2 text-xs font-sora font-semibold shadow-md transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'Saving...' : 'Add to Catalog'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Enroll Employee Modal ── */}
      {showEnrollModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200"
          onMouseDown={e => { if (e.target === e.currentTarget) setShowEnrollModal(false); }}
        >
          <div className="relative w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-[#B14AFF]/10 text-[#B14AFF] p-2 border border-[#B14AFF]/20">
                  <UserCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-sora font-semibold text-text-primary">Enroll Learner</h3>
                  <p className="text-xs text-text-muted">Assign an employee to a learning track.</p>
                </div>
              </div>
              <button onClick={() => setShowEnrollModal(false)} className="rounded-lg p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleEnrollEmployee} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block text-2xs font-sora font-semibold text-text-muted uppercase tracking-wider mb-1">Select Employee *</label>
                <select
                  value={enrollEmpId || uniqueEmployees[0]?.id || ''}
                  onChange={e => setEnrollEmpId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs text-text-primary focus:border-[#B14AFF] focus:outline-none"
                >
                  {uniqueEmployees.map(e => (
                    <option key={e.id} value={e.id}>{(e as any).display_label || e.name} - {e.role} ({e.department})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-2xs font-sora font-semibold text-text-muted uppercase tracking-wider mb-1">Target Role / Project *</label>
                <select
                  value={enrollRoleId || openRoles[0]?.id || role.id || ''}
                  onChange={e => setEnrollRoleId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs text-text-primary focus:border-[#B14AFF] focus:outline-none"
                >
                  {openRoles.map(r => (
                    <option key={r.id} value={r.id}>{r.title}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-2xs font-sora font-semibold text-text-muted uppercase tracking-wider mb-1">Learning Resource *</label>
                <select
                  value={enrollResourceId || resources[0]?.resource_id || ''}
                  onChange={e => setEnrollResourceId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs text-text-primary focus:border-[#B14AFF] focus:outline-none"
                >
                  {resources.map(res => (
                    <option key={res.resource_id} value={res.resource_id}>{res.title} ({res.provider})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-2xs font-sora font-semibold text-text-muted uppercase tracking-wider mb-1">Initial Status / Progress</label>
                <select
                  value={enrollProgress}
                  onChange={e => setEnrollProgress(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs text-text-primary focus:border-[#B14AFF] focus:outline-none"
                >
                  <option value="0">0% (Enrolled / Not Started)</option>
                  <option value="25">25% (In Progress)</option>
                  <option value="50">50% (Halfway Completed)</option>
                  <option value="100">100% (Completed)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowEnrollModal(false)}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-text-muted hover:bg-surface-elevated cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-xl aurora-btn-primary text-white px-5 py-2 text-xs font-sora font-semibold shadow-md transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'Enrolling...' : 'Confirm Enrollment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
