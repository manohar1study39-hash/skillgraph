import React, { useMemo, useState, useEffect } from 'react';
import {
  GraduationCap,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Clock,
  BookOpen,
  Award,
  Users,
  Target,
  ChevronRight,
  TrendingUp,
  Check,
  Briefcase,
  Layers,
  HelpCircle,
  Plus,
  Hourglass,
  RotateCcw
} from 'lucide-react';
import type { Employee, MarketplaceRole } from '../../types';
import { CSV_DATA } from '../../services/dataLoader';
import {
  analyzeRoleGap,
  LearningResourceRow,
  ProgressRow,
  RoleRequirement,
  SkillGap
} from '../../services/upskillingEngine';
import { Avatar } from '../ui/Avatar';
import { ProgressRing, ProgressBar } from '../ui/ProgressBar';
import { LogHoursModal } from './LogHoursModal';
import { RequestCompletionModal } from './RequestCompletionModal';
import { SuggestCourseModal } from './SuggestCourseModal';

interface EmployeeUpskillingTabProps {
  currentEmployee: Employee;
  allEmployees: Employee[];
  roles: MarketplaceRole[];
  requirements: RoleRequirement[];
  resources: LearningResourceRow[];
  progress: ProgressRow[];
  onUpdateProgress: (row: ProgressRow) => Promise<void> | void;
  onShowToast: (message: string) => void;
  onOpenEditProfile: () => void;
}

interface ServerProgressItem {
  id: number;
  resource_id: string;
  role_id: string;
  status: string;
  progress_percent: number;
  hours_logged: number;
  estimated_hours: number;
  completion_proof_url?: string;
  approval_status: string;
  approval_note?: string;
  updated_at?: string;
}

interface CourseSuggestionItem {
  id: number;
  title: string;
  provider?: string;
  url?: string;
  skill_id?: string;
  estimated_hours: number;
  why_helpful?: string;
  status: string;
  created_at?: string;
}

export const EmployeeUpskillingTab: React.FC<EmployeeUpskillingTabProps> = ({
  currentEmployee,
  allEmployees,
  roles,
  requirements,
  resources,
  progress,
  onUpdateProgress,
  onShowToast,
  onOpenEditProfile
}) => {
  // Default target role: pick the first open role or roles[0]
  const [selectedRoleId, setSelectedRoleId] = useState<string>(
    roles.find(r => r.status === 'Open')?.id || roles[0]?.id || ''
  );

  const selectedRole = useMemo(() => {
    return roles.find(r => r.id === selectedRoleId) || roles[0];
  }, [roles, selectedRoleId]);

  // Server progress state from /api/upskilling/progress
  const [serverProgress, setServerProgress] = useState<ServerProgressItem[]>([]);
  const [loadingProgress, setLoadingProgress] = useState<boolean>(true);

  // Weekly learning hours slider state & remaining calculation
  const [weeklyLearningHours, setWeeklyLearningHours] = useState<number>(
    (currentEmployee as any).weekly_learning_hours || 5.0
  );
  const [savingWeeklyHours, setSavingWeeklyHours] = useState<boolean>(false);

  // Suggestions state
  const [suggestions, setSuggestions] = useState<CourseSuggestionItem[]>([]);
  const [showSuggestionsDrawer, setShowSuggestionsDrawer] = useState<boolean>(false);

  // Modals state
  const [logHoursTarget, setLogHoursTarget] = useState<{
    resourceId: string;
    courseTitle: string;
    roleId?: string;
    currentHours: number;
    totalHours: number;
  } | null>(null);

  const [completionTarget, setCompletionTarget] = useState<{
    resourceId: string;
    courseTitle: string;
    roleId?: string;
    skillName?: string;
  } | null>(null);

  const [showSuggestModal, setShowSuggestModal] = useState<boolean>(false);
  const [reqFilter, setReqFilter] = useState<'all' | 'gaps' | 'met'>('all');

  // Fetch real progress from backend
  const fetchProgress = async () => {
    try {
      const res = await fetch('/api/upskilling/progress', { credentials: 'same-origin' });
      if (res.ok) {
        const data = await res.json();
        if (data.progress) {
          setServerProgress(data.progress);
        }
      }
    } catch {}
    finally {
      setLoadingProgress(false);
    }
  };

  // Fetch weekly learning hours & estimate from backend
  const fetchWeeklyHours = async () => {
    try {
      const res = await fetch('/api/employee/weekly-learning-hours', { credentials: 'same-origin' });
      if (res.ok) {
        const data = await res.json();
        if (typeof data.weekly_learning_hours === 'number') {
          setWeeklyLearningHours(data.weekly_learning_hours);
        }
      }
    } catch {}
  };

  // Fetch suggestions
  const fetchSuggestions = async () => {
    try {
      const res = await fetch('/api/learning-suggestions', { credentials: 'same-origin' });
      if (res.ok) {
        const data = await res.json();
        if (data.suggestions) {
          setSuggestions(data.suggestions);
        }
      }
    } catch {}
  };

  useEffect(() => {
    fetchProgress();
    fetchWeeklyHours();
    fetchSuggestions();
  }, [currentEmployee.id, progress]);

  // Compute effective progress merging serverProgress with prop progress
  const effectiveProgress = useMemo(() => {
    const list: ProgressRow[] = [...progress];
    serverProgress.forEach(sp => {
      const idx = list.findIndex(p => p.resource_id === sp.resource_id);
      const row: ProgressRow = {
        employee_id: currentEmployee.id,
        role_id: sp.role_id || selectedRoleId,
        resource_id: sp.resource_id,
        status: sp.status,
        progress_percent: String(sp.progress_percent),
        updated_at: sp.updated_at || new Date().toISOString()
      };
      if (idx >= 0) {
        list[idx] = row;
      } else {
        list.push(row);
      }
    });
    return list;
  }, [progress, serverProgress, currentEmployee.id, selectedRoleId]);

  // Compute total remaining hours for enrolled courses
  const totalRemainingHours = useMemo(() => {
    let sum = 0;
    serverProgress.forEach(p => {
      if (['In progress', 'Not started', 'Awaiting approval'].includes(p.status)) {
        const rem = Math.max(0, (p.estimated_hours || 10) - (p.hours_logged || 0));
        sum += rem;
      }
    });
    return Math.round(sum * 10) / 10;
  }, [serverProgress]);

  // Live estimated weeks to target completion
  const liveEstimatedWeeks = useMemo(() => {
    if (weeklyLearningHours <= 0) return 0;
    return Math.round((totalRemainingHours / weeklyLearningHours) * 10) / 10;
  }, [totalRemainingHours, weeklyLearningHours]);

  // Handle Weekly Learning Hours Slider Change
  const handleWeeklyHoursChange = async (newVal: number) => {
    setWeeklyLearningHours(newVal);
    setSavingWeeklyHours(true);
    try {
      await fetch('/api/employee/weekly-learning-hours', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ weekly_learning_hours: newVal })
      });
    } catch {}
    finally {
      setSavingWeeklyHours(false);
    }
  };

  // Handle Course Enrollment
  const handleEnroll = async (resourceId: string) => {
    try {
      const res = await fetch('/api/upskilling/enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ resource_id: resourceId, role_id: selectedRoleId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || data.error || 'Could not enroll in course.');
      }
      onShowToast(data.message || 'Successfully enrolled in course!');
      await fetchProgress();
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Could not enroll in course.');
    }
  };

  // Handle Course Unenroll (Drop Course)
  const handleUnenroll = async (resourceId: string) => {
    if (!window.confirm('Are you sure you want to drop this course? Your logged hours will be preserved in your learning audit history.')) {
      return;
    }
    try {
      const res = await fetch('/api/upskilling/unenroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ resource_id: resourceId, role_id: selectedRoleId })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || data.error || 'Could not drop course.');
      }
      onShowToast(data.message || 'Course dropped. Logged hours preserved in audit history.');
      await fetchProgress();
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Could not drop course.');
    }
  };

  // Compute personal gap analysis for this employee against the selected target role
  const analysis = useMemo(() => {
    if (!selectedRole) return null;
    return analyzeRoleGap(
      currentEmployee,
      selectedRole,
      requirements,
      resources,
      allEmployees,
      effectiveProgress,
      CSV_DATA.skillsData
    );
  }, [currentEmployee, selectedRole, requirements, resources, allEmployees, effectiveProgress]);

  if (!selectedRole || !analysis) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-12 text-center text-text-muted">
        No active roles available for upskilling analysis.
      </div>
    );
  }

  const { readinessPercent, status, readyInWeeksRange, breakdown, gaps } = analysis;
  const mustItems = breakdown.filter(b => b.importance === 'Must');
  const metMustCount = mustItems.filter(b => b.credit >= 1).length;

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      {/* ── Header & Target Role Selector ─────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl border border-[#10B981]/20 bg-gradient-to-br from-[#10B981]/[0.08] via-surface to-surface p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-[#10B981]/10 border border-[#10B981]/30 px-3 py-0.5 text-xs font-semibold text-[#059669] dark:text-[#34D399] mb-2">
              <GraduationCap className="w-3.5 h-3.5 text-[#10B981]" /> Career Pathways & Upskilling
            </div>
            <h1 className="text-2xl sm:text-3xl font-heading font-semibold text-text-primary tracking-tight">
              Target Role Pathway Analysis
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-text-muted">
              Select your career ambition target role to analyze your skill readiness, log learning hours, and request verified completions.
            </p>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Suggest Course Button */}
            <button
              type="button"
              onClick={() => setShowSuggestModal(true)}
              className="rounded-2xl border border-teal-500/30 bg-teal-500/10 hover:bg-teal-500/20 px-3.5 py-2.5 text-xs font-bold text-teal-700 dark:text-teal-300 flex items-center gap-1.5 transition-colors shadow-2xs"
            >
              <Sparkles className="w-4 h-4 text-teal-500" /> Suggest a Course
            </button>

            {/* Target Role Selector dropdown */}
            <div className="w-full sm:w-72">
              <label className="block text-[11px] font-bold text-text-muted mb-1 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-[#10B981]" /> Target Role Ambition:
              </label>
              <select
                value={selectedRoleId}
                onChange={e => setSelectedRoleId(e.target.value)}
                className="w-full rounded-2xl border border-border bg-surface px-3 py-2 text-xs font-bold text-text-primary shadow-xs focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
              >
                {roles.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.title} ({r.department})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Readiness Metric Summary Bar & Weekly Hours Slider */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-6 border-t border-border/80">
          {/* Readiness Score with Progress Ring */}
          <div className="rounded-2xl border border-border bg-surface/90 backdrop-blur-xs p-4 flex items-center gap-4 shadow-xs">
            <ProgressRing
              value={readinessPercent}
              size={64}
              strokeWidth={6}
              variant={readinessPercent >= 80 ? 'success' : readinessPercent >= 50 ? 'accent' : 'primary'}
              label={
                <span className="text-xs font-heading font-bold tabular-nums text-text-primary">
                  {readinessPercent}%
                </span>
              }
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-semibold text-text-muted">Readiness</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  status === 'Qualified'
                    ? 'bg-[#10B981]/15 text-[#059669] dark:text-[#34D399] border border-[#10B981]/30'
                    : status === 'Near-Qualified'
                    ? 'bg-[#FFB547]/20 text-[#D97706] dark:text-[#FFB547] border border-[#FFB547]/40'
                    : 'bg-surface-alt text-text-muted border border-border'
                }`}>
                  {status}
                </span>
              </div>
              <div className="mt-1 text-sm font-bold text-text-primary truncate">
                {selectedRole.title}
              </div>
              <p className="text-[11px] text-text-muted truncate mt-0.5">
                {metMustCount} of {mustItems.length} Must requirements met
              </p>
            </div>
          </div>

          {/* Interactive Weekly Learning Pace Slider */}
          <div className="rounded-2xl border border-border bg-surface/90 backdrop-blur-xs p-4 shadow-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text-muted flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-teal-500" /> Target Learning Pace
              </span>
              <span className="text-xs font-bold text-teal-600 dark:text-teal-400 font-mono">
                {weeklyLearningHours} hrs / week
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="20"
              step="1"
              value={weeklyLearningHours}
              onChange={e => handleWeeklyHoursChange(Number(e.target.value))}
              className="w-full accent-teal-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-text-muted">
              <span>1h (Casual)</span>
              <span>5h (Standard)</span>
              <span>10h+ (Intensive)</span>
            </div>
          </div>

          {/* Live Calculated Timeline to Goal */}
          <div className="rounded-2xl border border-border bg-surface/90 backdrop-blur-xs p-4 shadow-xs">
            <span className="text-xs font-semibold text-text-muted">Est. Upskilling Timeline</span>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-heading font-bold tabular-nums text-[#059669] dark:text-[#34D399]">
                {totalRemainingHours > 0 ? `~${liveEstimatedWeeks} wks` : 'Ready!'}
              </span>
              <span className="text-xs text-text-muted font-mono">
                ({totalRemainingHours}h remaining)
              </span>
            </div>
            <p className="mt-1 text-xs text-text-muted">
              Live calculation based on your enrolled courses at {weeklyLearningHours} hrs/week
            </p>
          </div>
        </div>

        {/* Employee Understanding Guide Banner */}
        <div className="mt-6 p-4 rounded-2xl border border-teal-500/20 bg-surface/80 backdrop-blur-xs text-xs space-y-2.5">
          <div className="flex items-center gap-2 font-bold text-teal-700 dark:text-teal-300">
            <Sparkles className="w-4 h-4 text-teal-500" />
            <span>Employee Quick Guide: How Upskilling &amp; Gaps Work</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-text-muted">
            <div className="p-3 rounded-xl bg-surface border border-border/80 space-y-1 shadow-2xs">
              <strong className="text-teal-600 dark:text-teal-400 block font-bold">1. Select Ambition</strong>
              <span>Choose your target role from the dropdown to benchmark your evaluated skills against real role expectations.</span>
            </div>
            <div className="p-3 rounded-xl bg-surface border border-border/80 space-y-1 shadow-2xs">
              <strong className="text-red-500 block font-bold">2. Must vs. Nice Skills</strong>
              <span><strong>Must</strong> requirements are mandatory to qualify. <strong>Nice-to-have</strong> skills grant bonus readiness credit.</span>
            </div>
            <div className="p-3 rounded-xl bg-surface border border-border/80 space-y-1 shadow-2xs">
              <strong className="text-amber-500 block font-bold">3. Log Study Hours</strong>
              <span>Enroll in courses and log your learning time weekly. The pace slider calculates your estimated weeks to reach your goal.</span>
            </div>
            <div className="p-3 rounded-xl bg-surface border border-border/80 space-y-1 shadow-2xs">
              <strong className="text-emerald-500 block font-bold">4. Complete (100%)</strong>
              <span>When 100% of study hours are met, submit for completion review to unlock certified skill credit &amp; level advancement!</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Skills Gap & Requirements Breakdown ───────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Requirements Breakdown */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
                <Target className="w-4 h-4 text-[#10B981]" /> Role Requirements ({breakdown.length})
              </h3>
              <span className="text-xs text-text-muted">
                {metMustCount}/{mustItems.length} Must Satisfied
              </span>
            </div>

            {/* Filter Pills for Requirements */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none border-b border-border/60 pb-2">
              {[
                { id: 'all', label: `All (${breakdown.length})` },
                { id: 'gaps', label: `⚠️ Gaps (${breakdown.filter(b => b.credit < 1).length})` },
                { id: 'met', label: `✅ Met (${breakdown.filter(b => b.credit >= 1).length})` },
              ].map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setReqFilter(f.id as typeof reqFilter)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    reqFilter === f.id
                      ? 'bg-teal-600 text-white font-bold shadow-2xs'
                      : 'bg-surface-alt border border-border text-text-muted hover:text-text-primary'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {breakdown
                .filter(item => {
                  if (reqFilter === 'gaps') return item.credit < 1;
                  if (reqFilter === 'met') return item.credit >= 1;
                  return true;
                })
                .map(item => {
                  const isMet = item.credit >= 1;
                  const matchingGap = gaps.find(g => g.skillId === item.skillId);
                  return (
                    <div
                      key={item.skillId}
                      className={`p-3.5 rounded-xl border transition-all text-xs space-y-2 ${
                        isMet
                          ? 'border-emerald-500/30 bg-emerald-500/[0.03]'
                          : 'border-amber-500/30 bg-amber-500/[0.04]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5 font-bold text-text-primary flex-wrap">
                            <span>{item.skillName}</span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded font-semibold ${
                              item.importance === 'Must'
                                ? 'bg-red-500/10 text-red-600 border border-red-500/20'
                                : 'bg-blue-500/10 text-blue-600 border border-blue-500/20'
                            }`}>
                              {item.importance === 'Must' ? 'Mandatory Must' : 'Bonus Nice-to-Have'}
                            </span>
                          </div>
                          <span className="text-text-muted text-[11px] mt-0.5 block">
                            Evaluated: <strong className="text-text-primary">Level {item.currentLevel}</strong> → Required: <strong className="text-text-primary">Level {item.requiredLevel}</strong>
                          </span>
                        </div>

                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                          isMet
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                            : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                        }`}>
                          {isMet ? 'Met ✓' : 'Skill Gap'}
                        </span>
                      </div>

                      {!isMet && (
                        <div className="pt-2 border-t border-border/60 flex items-center justify-between gap-2">
                          {matchingGap?.resource ? (
                            <button
                              type="button"
                              onClick={() => {
                                const el = document.getElementById(`gap-${item.skillId}`);
                                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                              }}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 cursor-pointer"
                            >
                              <span>Bridge Gap with Recommended Course ↓</span>
                              <ChevronRight className="w-3 h-3" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setShowSuggestModal(true)}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 hover:text-amber-700 dark:text-amber-400 cursor-pointer"
                            >
                              <Plus className="w-3 h-3" />
                              <span>Suggest a Course to Close Gap</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>

          {/* My Submitted Suggestions Section */}
          {suggestions.length > 0 && (
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-text-primary flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-teal-500" /> My Course Suggestions ({suggestions.length})
                </h4>
              </div>
              <div className="space-y-2">
                {suggestions.map(sug => (
                  <div key={sug.id} className="p-2.5 rounded-xl border border-border bg-surface-alt text-xs space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <strong className="text-text-primary truncate">{sug.title}</strong>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        sug.status === 'Approved'
                          ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                          : sug.status === 'Rejected'
                          ? 'bg-red-500/10 text-red-600 border border-red-500/20'
                          : 'bg-blue-500/10 text-blue-600 border border-blue-500/20'
                      }`}>
                        {sug.status}
                      </span>
                    </div>
                    <span className="text-[11px] text-text-muted block">
                      {sug.provider || 'External'} • {sug.estimated_hours}h
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Personalized Courses & Mentors */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs space-y-4">
            <div>
              <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-teal-500" /> Recommended Courses &amp; Gap Closures
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                Curated learning tracks. Log your hours, enroll, or request completion approval to close your skill gaps for {selectedRole.title}.
              </p>
            </div>

            {gaps.length > 0 ? (
              <div className="space-y-4">
                {gaps.map((gap: SkillGap) => {
                  const sProg = serverProgress.find(p => p.resource_id === gap.resource?.resource_id);
                  const isEnrolled = Boolean(sProg && sProg.status !== 'Dropped');
                  const currentHours = sProg ? sProg.hours_logged : 0;
                  const totalHours = sProg ? sProg.estimated_hours : (gap.resource?.estimated_hours ? Number(gap.resource.estimated_hours) : 16);
                  const isHoursMet = isEnrolled && (currentHours >= totalHours || (sProg?.progress_percent || 0) >= 99);
                  const currentPct = sProg ? (isHoursMet ? 100 : sProg.progress_percent) : 0;
                  const rawStatus = sProg ? sProg.status : 'Not enrolled';
                  const isAwaiting = rawStatus === 'Awaiting approval';
                  const isDone = rawStatus === 'Done' || (sProg?.progress_percent === 100 && rawStatus !== 'In progress');
                  const currentStatus = isDone
                    ? 'Completed'
                    : isAwaiting
                    ? 'Awaiting approval'
                    : isHoursMet
                    ? '100% Hours Met • Ready for Review'
                    : rawStatus;

                  return (
                    <div
                      key={gap.skillId}
                      id={`gap-${gap.skillId}`}
                      className="rounded-2xl border border-border bg-surface-alt p-4 sm:p-5 space-y-4 hover:border-teal-500/40 transition-colors shadow-xs"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-base text-text-primary">{gap.skillName}</h4>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 border border-amber-500/20">
                              Gap: {gap.currentLevel} → {gap.requiredLevel}
                            </span>
                          </div>
                          <p className="text-xs text-text-muted mt-0.5">{gap.explanation}</p>
                        </div>
                      </div>

                      {/* Course Card */}
                      {gap.resource && (
                        <div className="rounded-xl border border-border bg-surface p-4 space-y-3.5 shadow-2xs">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">
                                {gap.resource.provider} • {gap.resource.duration_weeks} Weeks • {totalHours} Total Hours
                              </span>
                              <h5 className="font-bold text-sm text-text-primary mt-0.5">
                                {gap.resource.title}
                              </h5>
                            </div>
                            <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                              isDone || isHoursMet
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                                : isAwaiting
                                ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                                : isEnrolled
                                ? 'bg-teal-500/10 text-teal-600 border border-teal-500/20'
                                : 'bg-surface-alt text-text-muted border border-border'
                            }`}>
                              {currentStatus}
                            </span>
                          </div>

                          {/* Hours-based Progress Bar */}
                          {isEnrolled && (
                            <div className="space-y-2 pt-1 border-t border-border">
                              <div className="flex justify-between text-xs font-semibold">
                                <span className="text-text-muted flex items-center gap-1.5">
                                  <Clock className="w-3.5 h-3.5 text-teal-500" /> Logged Learning Time:
                                </span>
                                <span className="text-text-primary font-mono font-bold">
                                  {currentHours} / {totalHours} hrs ({currentPct}%)
                                </span>
                              </div>
                              <div className="h-2.5 w-full rounded-full bg-border overflow-hidden">
                                <div
                                  className={`h-full rounded-full transition-all duration-300 ${
                                    isDone || isHoursMet
                                      ? 'bg-emerald-500'
                                      : isAwaiting
                                      ? 'bg-amber-500'
                                      : 'bg-gradient-to-r from-teal-500 to-emerald-400'
                                  }`}
                                  style={{ width: `${Math.min(100, currentPct)}%` }}
                                />
                              </div>

                              {isAwaiting && (
                                <div className="p-2.5 rounded-xl border border-amber-500/30 bg-amber-500/5 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
                                  <Hourglass className="w-4 h-4 shrink-0" />
                                  <span>
                                    <strong>Awaiting HR review.</strong> Granted +0.2 partial level credit towards {gap.skillName}.
                                  </span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Action Buttons: Log Hours, Request Completion, Enroll, Drop */}
                          <div className="pt-2 border-t border-border flex items-center justify-between gap-2 flex-wrap">
                            {isEnrolled ? (
                              <>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setLogHoursTarget({
                                      resourceId: gap.resource!.resource_id,
                                      courseTitle: gap.resource!.title,
                                      roleId: selectedRoleId,
                                      currentHours,
                                      totalHours
                                    })}
                                    className="px-3 py-1.5 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white flex items-center gap-1.5 transition-all shadow-xs"
                                  >
                                    <Clock className="w-3.5 h-3.5" /> Log Hours
                                  </button>

                                  {!isDone && !isAwaiting && (
                                    <button
                                      type="button"
                                      onClick={() => setCompletionTarget({
                                        resourceId: gap.resource!.resource_id,
                                        courseTitle: gap.resource!.title,
                                        roleId: selectedRoleId,
                                        skillName: gap.skillName
                                      })}
                                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 shadow-xs ${
                                        isHoursMet
                                          ? 'border-emerald-500 bg-emerald-600 hover:bg-emerald-700 text-white'
                                          : 'border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300'
                                      }`}
                                    >
                                      <Award className="w-3.5 h-3.5" />
                                      {isHoursMet ? '✨ Request Completion (100% Met)' : 'Request Completion'}
                                    </button>
                                  )}
                                </div>

                                <button
                                  type="button"
                                  onClick={() => handleUnenroll(gap.resource!.resource_id)}
                                  className="text-xs text-text-muted hover:text-red-500 transition-colors ml-auto"
                                  title="Drop course without deleting logged hours"
                                >
                                  Drop Course
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleEnroll(gap.resource!.resource_id)}
                                className="w-full py-2 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white flex items-center justify-center gap-1.5 transition-all shadow-xs"
                              >
                                <Plus className="w-3.5 h-3.5" /> Enroll in Learning Track
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Fallback when no course is mapped yet */}
                      {!gap.resource && (
                        <div className="rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                                No Internal Course Catalog Entry Yet
                              </span>
                              <h5 className="font-bold text-sm text-text-primary">
                                Looking to learn {gap.skillName}?
                              </h5>
                              <p className="text-xs text-text-muted">
                                We haven&apos;t mapped an academy course for this competency yet. You can suggest an online course (Coursera, Udemy, etc.) or submit verified evidence if you already have experience.
                              </p>
                            </div>
                          </div>
                          <div className="pt-2 border-t border-border flex items-center gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => setShowSuggestModal(true)}
                              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                            >
                              <Sparkles className="w-3.5 h-3.5" /> Suggest Course for {gap.skillName}
                            </button>
                            <button
                              type="button"
                              onClick={onOpenEditProfile}
                              className="px-3 py-1.5 rounded-xl text-xs font-bold border border-border bg-surface hover:bg-surface-alt text-text-primary flex items-center gap-1.5 transition-all shadow-xs cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" /> Submit Evidence
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Peer Mentor */}
                      {gap.mentor && (
                        <div className="flex items-center justify-between rounded-xl border border-border bg-surface p-3 text-xs shadow-2xs">
                          <div className="flex items-center gap-3">
                            <Avatar name={gap.mentor.name} className="h-8 w-8 text-[10px] ring-2 ring-teal-500/20" />
                            <div>
                              <strong className="block text-text-primary font-semibold">{gap.mentor.name}</strong>
                              <span className="text-text-muted">{gap.mentor.role} • {gap.mentor.department}</span>
                            </div>
                          </div>
                          <span className="text-[11px] font-semibold text-teal-600 dark:text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded-full border border-teal-500/20">
                            Peer Expert
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-emerald-500/30 bg-emerald-500/5 p-8 text-center space-y-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                <h4 className="text-base font-bold text-text-primary">No Skill Gaps Detected!</h4>
                <p className="text-xs text-text-muted max-w-sm mx-auto">
                  You already meet all required capabilities for {selectedRole.title}. You are fully qualified to apply for this role.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Modals ─────────────────────────────────────────────────── */}
      {logHoursTarget && (
        <LogHoursModal
          resourceId={logHoursTarget.resourceId}
          courseTitle={logHoursTarget.courseTitle}
          roleId={logHoursTarget.roleId}
          currentHoursLogged={logHoursTarget.currentHours}
          totalEstimatedHours={logHoursTarget.totalHours}
          onClose={() => setLogHoursTarget(null)}
          onSuccess={async () => {
            await fetchProgress();
            await fetchWeeklyHours();
          }}
          onShowToast={onShowToast}
        />
      )}

      {completionTarget && (
        <RequestCompletionModal
          resourceId={completionTarget.resourceId}
          courseTitle={completionTarget.courseTitle}
          roleId={completionTarget.roleId}
          skillName={completionTarget.skillName}
          onClose={() => setCompletionTarget(null)}
          onSuccess={async () => {
            await fetchProgress();
          }}
          onShowToast={onShowToast}
        />
      )}

      {showSuggestModal && (
        <SuggestCourseModal
          onClose={() => setShowSuggestModal(false)}
          onSuccess={async () => {
            await fetchSuggestions();
          }}
          onShowToast={onShowToast}
        />
      )}
    </div>
  );
};
