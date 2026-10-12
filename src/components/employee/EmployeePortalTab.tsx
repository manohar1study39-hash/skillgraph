import React, { useState, useMemo, useEffect } from 'react';
import {
  Mail,
  MapPin,
  Calendar,
  Briefcase,
  ShieldCheck,
  Award,
  FolderGit2,
  Clock,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  GraduationCap,
  ChevronRight,
  Sliders,
  Check,
  Plus,
  ExternalLink,
  Target,
  BarChart3,
  Layers,
  Search,
  BookOpen,
  Send,
  Building2,
  AlertCircle,
  FileCheck,
  Trash2,
  Flame,
  TrendingUp,
  Bell,
  RotateCcw,
  CheckCheck,
  X
} from 'lucide-react';
import type { Employee, MarketplaceRole, ToastUndoAction } from '../../types';
import { Avatar } from '../ui/Avatar';
import { CSV_DATA } from '../../services/dataLoader';
import {
  LearningResourceRow,
  ProgressRow,
  RoleRequirement,
  analyzeRoleGap
} from '../../services/upskillingEngine';
import { ProgressRing } from '../ui/ProgressBar';
import { SubmitEvidenceModal } from '../evidence/SubmitEvidenceModal';
import { ApplyOpportunityModal, OpportunityItem } from './ApplyOpportunityModal';
import { LogHoursModal } from './LogHoursModal';
import { RequestCompletionModal } from './RequestCompletionModal';
import { SuggestCourseModal } from './SuggestCourseModal';
import { SkillLevelExplanationModal } from './SkillLevelExplanationModal';
import { apiFetch } from '../../services/apiClient';

interface ApplicationRow {
  application_id: string;
  opportunity_id: string;
  opportunity_type: string;
  employee_id: string;
  employee_name: string;
  note: string;
  hours_per_week: string;
  applied_at: string;
  status: string;
  hr_decision_note?: string;
}

interface EmployeeNotification {
  id: string;
  category: string;
  type: string;
  title: string;
  message: string;
  badge_variant: 'success' | 'danger' | 'warning' | 'info' | string;
  action_tab: string;
  timestamp: string;
}

interface EmployeePortalTabProps {
  currentEmployee: Employee;
  allEmployees?: Employee[];
  roles?: MarketplaceRole[];
  requirements: RoleRequirement[];
  resources: LearningResourceRow[];
  progress: ProgressRow[];
  onInspectEvidence: (employee: Employee, skillName: string) => void;
  onOpenUpskilling: () => void;
  onOpenOpportunities: () => void;
  onOpenEditProfile: () => void;
  onShowToast: (message: string, undoAction?: ToastUndoAction) => void;
  onUpdateProgress?: (row: ProgressRow) => Promise<void> | void;
  onReloadData?: () => Promise<void>;
  onUpdateAvailability?: (availabilityPercent: number, hoursPerWeekFree: number) => Promise<void>;
}

export const EmployeePortalTab: React.FC<EmployeePortalTabProps> = ({
  currentEmployee,
  allEmployees = [],
  roles = [],
  requirements,
  resources,
  progress,
  onInspectEvidence,
  onOpenUpskilling,
  onOpenOpportunities,
  onOpenEditProfile,
  onShowToast,
  onUpdateProgress,
  onReloadData,
  onUpdateAvailability
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'projects' | 'skills' | 'courses' | 'opportunities' | 'notifications'>('overview');
  const [availabilityPercent, setAvailabilityPercent] = useState(currentEmployee.availabilityPercent || 80);
  const [hoursPerWeekFree, setHoursPerWeekFree] = useState(currentEmployee.hoursPerWeekFree || 32);
  const [savingAvailability, setSavingAvailability] = useState(false);

  // Ambition / Target Career Role state
  const availableRoles = useMemo(() => {
    return roles.length > 0 ? roles : CSV_DATA.rolesData || [];
  }, [roles]);

  const [selectedAmbitionRoleId, setSelectedAmbitionRoleId] = useState<string>(() => {
    const openRole = availableRoles.find(r => r.status === 'Open');
    return openRole ? openRole.id : availableRoles[0]?.id || 'role-fintech-app-lead';
  });

  const [committedHours, setCommittedHours] = useState<number>(0);

  // Sync ambition and availability with SQLite database on mount
  useEffect(() => {
    fetch('/api/employee/ambition', { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.target_role_id) {
          setSelectedAmbitionRoleId(data.target_role_id);
        }
      })
      .catch(() => {});

    fetch('/api/employee/availability', { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          if (typeof data.committed_hours === 'number') setCommittedHours(data.committed_hours);
          if (typeof data.hours_per_week_free === 'number') setHoursPerWeekFree(data.hours_per_week_free);
          if (typeof data.availability_percent === 'number') setAvailabilityPercent(data.availability_percent);
        }
      })
      .catch(() => {});
  }, [currentEmployee.id]);

  const selectedAmbitionRole = useMemo(() => {
    return availableRoles.find(r => r.id === selectedAmbitionRoleId) || availableRoles[0];
  }, [availableRoles, selectedAmbitionRoleId]);

  const handleSelectAmbitionRole = async (roleId: string) => {
    setSelectedAmbitionRoleId(roleId);
    try {
      const res = await fetch('/api/employee/ambition', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ target_role_id: roleId })
      });
      if (res.ok) {
        const roleObj = availableRoles.find(r => r.id === roleId);
        if (roleObj) {
          onShowToast(`Career target updated to ${roleObj.title}!`);
        }
      }
    } catch {
      onShowToast('Could not save target ambition role.');
    }
  };

  // Keep local availability in sync when currentEmployee prop changes
  useEffect(() => {
    setAvailabilityPercent(currentEmployee.availabilityPercent || 80);
    setHoursPerWeekFree(currentEmployee.hoursPerWeekFree || 32);
  }, [currentEmployee.availabilityPercent, currentEmployee.hoursPerWeekFree]);

  // Filters and search states
  const [skillSearchQuery, setSkillSearchQuery] = useState('');
  const [skillCategoryFilter, setSkillCategoryFilter] = useState('All');
  const [courseFilter, setCourseFilter] = useState<'all' | 'enrolled' | 'recommended'>('all');
  const [courseSearchQuery, setCourseSearchQuery] = useState('');
  const [opportunityFilter, setOpportunityFilter] = useState<'all' | 'projects' | 'roles' | 'applied' | 'approved'>('all');
  const [approvalCategoryFilter, setApprovalCategoryFilter] = useState<'all' | 'projects' | 'courses' | 'evidence'>('all');
  const [projectSubFilter, setProjectSubFilter] = useState<'all' | 'assigned' | 'working_on' | 'approved' | 'pending'>('all');

  // Notifications feed state
  const [notifications, setNotifications] = useState<EmployeeNotification[]>([]);
  const [notificationsFilter, setNotificationsFilter] = useState<'all' | 'unread' | 'assigned' | 'decisions' | 'learning' | 'evidence'>('all');
  const [notificationSearchQuery, setNotificationSearchQuery] = useState<string>('');
  const [loadingNotifications, setLoadingNotifications] = useState<boolean>(false);
  const [readNotificationIds, setReadNotificationIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(`read_notifications_${currentEmployee.id}`);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const markNotificationAsRead = (id: string) => {
    setReadNotificationIds(prev => {
      const next = new Set(prev);
      next.add(id);
      try {
        localStorage.setItem(`read_notifications_${currentEmployee.id}`, JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });
  };

  const markAllNotificationsAsRead = () => {
    const allIds = notifications.map(n => n.id);
    setReadNotificationIds(new Set(allIds));
    try {
      localStorage.setItem(`read_notifications_${currentEmployee.id}`, JSON.stringify(allIds));
    } catch {}
    onShowToast('All notifications marked as read');
  };

  const handleNotificationJump = (n: EmployeeNotification) => {
    markNotificationAsRead(n.id);
    if (n.action_tab === 'projects') {
      setProjectSubFilter('assigned');
      setActiveSubTab('projects');
    } else if (n.action_tab === 'courses') {
      setCourseFilter('enrolled');
      setActiveSubTab('courses');
    } else if (n.action_tab === 'opportunities') {
      setOpportunityFilter('all');
      setActiveSubTab('opportunities');
    } else if (n.action_tab === 'skills') {
      setActiveSubTab('skills');
    } else {
      setActiveSubTab('overview');
    }
  };

  const unreadCount = useMemo(() => {
    return notifications.filter(n => !readNotificationIds.has(n.id)).length;
  }, [notifications, readNotificationIds]);

  const filteredNotifications = useMemo(() => {
    let list = notifications;
    if (notificationsFilter === 'unread') {
      list = list.filter(n => !readNotificationIds.has(n.id));
    } else if (notificationsFilter === 'assigned') {
      list = list.filter(n => n.type === 'assigned');
    } else if (notificationsFilter === 'decisions') {
      list = list.filter(n => n.category === 'Application Decision');
    } else if (notificationsFilter === 'learning') {
      list = list.filter(n => n.category === 'Learning Track');
    } else if (notificationsFilter === 'evidence') {
      list = list.filter(n => n.category === 'Skill Verification');
    }

    if (notificationSearchQuery.trim()) {
      const q = notificationSearchQuery.toLowerCase();
      list = list.filter(n =>
        n.title.toLowerCase().includes(q) ||
        n.message.toLowerCase().includes(q) ||
        n.category.toLowerCase().includes(q) ||
        n.type.toLowerCase().includes(q)
      );
    }
    return list;
  }, [notifications, notificationsFilter, notificationSearchQuery, readNotificationIds]);

  // Modals state
  const [showSubmitEvidenceModal, setShowSubmitEvidenceModal] = useState(false);
  const [evidenceTargetSkill, setEvidenceTargetSkill] = useState<string>('');
  const [applyModalOpportunity, setApplyModalOpportunity] = useState<OpportunityItem | null>(null);
  const [breakdownOpportunity, setBreakdownOpportunity] = useState<OpportunityItem | null>(null);
  const [apiOpportunities, setApiOpportunities] = useState<OpportunityItem[] | null>(null);

  // Phase 4 Upskilling modals state
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
  } | null>(null);
  const [showSuggestModal, setShowSuggestModal] = useState<boolean>(false);
  const [explanationSkill, setExplanationSkill] = useState<{ id: string; name: string } | null>(null);
  const [bridgeGapsFilter, setBridgeGapsFilter] = useState<string[]>([]);

  // Applications state
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);

  // Evidence deletion state (for undo and instant optimistic update)
  const [deletingEvidenceId, setDeletingEvidenceId] = useState<string | null>(null);
  const [deletedEvidenceIds, setDeletedEvidenceIds] = useState<Set<string>>(new Set());
  const [droppedCourseIds, setDroppedCourseIds] = useState<Set<string>>(new Set());

  // Optimistic course progress map for instant feedback
  const [optimisticProgress, setOptimisticProgress] = useState<Record<string, { status: string; percent: string }>>({});

  // Fetch opportunities from deterministic database engine
  const fetchOpportunities = async () => {
    try {
      const res = await fetch('/api/opportunities', { credentials: 'same-origin' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.opportunities)) {
          const normalized = data.opportunities.map((o: any) => ({
            ...o,
            name: o.name || o.title || 'Opportunity',
            commitment: o.commitment || `${o.hours_per_week || 10} hrs/wk`,
            technologies: Array.isArray(o.technologies)
              ? o.technologies
              : String(o.technologies || '').split('|').filter(Boolean)
          }));
          setApiOpportunities(normalized);
        }
      }
    } catch {
      // ignore
    }
  };

  // Fetch applications
  const fetchApplications = async () => {
    setLoadingApps(true);
    try {
      const res = await fetch('/api/project-applications', { credentials: 'same-origin' });
      if (res.ok) {
        const data = await res.json();
        setApplications(data.applications || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingApps(false);
    }
  };

  // Fetch employee notifications feed
  const fetchNotifications = async () => {
    setLoadingNotifications(true);
    try {
      const res = await apiFetch('/api/employee/notifications');
      if (res.ok && res.data) {
        if (Array.isArray(res.data.notifications)) {
          setNotifications(res.data.notifications);
        }
      }
    } catch (err) {
      console.warn('Failed to fetch employee notifications:', err);
    } finally {
      setLoadingNotifications(false);
    }
  };

  useEffect(() => {
    fetchApplications();
    fetchOpportunities();
    fetchNotifications();
  }, [currentEmployee.id, currentEmployee.version, progress, activeSubTab]);

  // Compute stats
  const totalEvidenceArtifacts = useMemo(() => {
    return currentEmployee.skills.reduce(
      (sum, sk) => sum + (sk.evidenceList ? sk.evidenceList.filter(e => !e.expired).length : 0),
      0
    );
  }, [currentEmployee]);

  const primarySkills = useMemo(() => {
    return currentEmployee.skills.filter(s => s.isPrimary || ['Expert', 'Master'].includes(s.proficiencyLevel));
  }, [currentEmployee]);

  // Profile completeness score
  const completenessScore = useMemo(() => {
    let score = 20; // base identity
    if (currentEmployee.role && currentEmployee.department) score += 20;
    if (currentEmployee.skills.length >= 3) score += 20;
    else if (currentEmployee.skills.length > 0) score += 10;
    if (totalEvidenceArtifacts > 0) score += 20;
    if (currentEmployee.topProjects.length > 0 || currentEmployee.certifications.length > 0) score += 20;
    return Math.min(100, score);
  }, [currentEmployee, totalEvidenceArtifacts]);

  // Effective progress combining props + optimistic state
  const effectiveProgress = useMemo(() => {
    let result = [...progress];
    Object.entries(optimisticProgress).forEach(([key, val]) => {
      const [roleId, resourceId] = key.split(':');
      const filtered = result.filter(
        p => !(p.role_id === roleId && p.resource_id === resourceId && (p.employee_id === currentEmployee.id || p.employee_id.includes(currentEmployee.id)))
      );
      result = [
        ...filtered,
        {
          employee_id: currentEmployee.id,
          role_id: roleId,
          resource_id: resourceId,
          status: val.status,
          progress_percent: val.percent,
          updated_at: new Date().toISOString().slice(0, 10)
        }
      ];
    });
    return result;
  }, [progress, optimisticProgress, currentEmployee.id]);

  // Employee's active enrolled courses
  const employeeProgress = useMemo(() => {
    return effectiveProgress.filter(
      p => p.employee_id === currentEmployee.id || (p.employee_id && currentEmployee.id && (p.employee_id.includes(currentEmployee.id) || currentEmployee.id.includes(p.employee_id)))
    );
  }, [effectiveProgress, currentEmployee.id]);

  // Gap analysis against the employee's ambition target role
  const ambitionAnalysis = useMemo(() => {
    if (!selectedAmbitionRole) return null;
    const teamEmployees = allEmployees.length > 0 ? allEmployees : [currentEmployee];
    return analyzeRoleGap(
      currentEmployee,
      selectedAmbitionRole,
      requirements,
      resources,
      teamEmployees,
      effectiveProgress,
      CSV_DATA.skillsData
    );
  }, [currentEmployee, selectedAmbitionRole, requirements, resources, allEmployees, effectiveProgress]);

  // Internal project gigs (from projects.csv)
  const projectGigs = useMemo(() => {
    const rawProjects = CSV_DATA?.records?.projects || [];
    const empSkillNames = new Set(currentEmployee.skills.map(s => s.skillName.toLowerCase()));

    return rawProjects.map(p => {
      const techList = (p.technologies || '').split('|').filter(Boolean);
      const matchedCount = techList.filter(t => empSkillNames.has(t.toLowerCase())).length;
      const matchScore = techList.length > 0 ? Math.round((matchedCount / techList.length) * 100) : 60;
      return {
        id: p.project_id,
        name: p.project_name,
        type: 'project' as const,
        department: p.domain || 'Engineering',
        complexity: Number(p.complexity || 3),
        startDate: p.start_date,
        technologies: p.technologies,
        commitment: 'Flexible (Part-time Gig)',
        matchScore,
        matchedCount,
        requirementsCount: techList.length,
        description: `High-impact initiative requiring ${techList.join(', ')}.`
      };
    });
  }, [currentEmployee]);

  // Matched internal roles (from roles.csv)
  const matchedRoleOpportunities = useMemo(() => {
    const empSkillIds = new Set(currentEmployee.skills.map(s => s.skillId));
    return availableRoles.map(role => {
      const roleReqs = requirements.filter(r => r.role_id === role.id);
      if (roleReqs.length === 0) return null;
      const matchedCount = roleReqs.filter(r => empSkillIds.has(r.skill_id)).length;
      const matchScore = Math.round((matchedCount / roleReqs.length) * 100);
      return {
        id: role.id,
        name: role.title,
        type: 'role' as const,
        department: role.department,
        commitment: role.commitment || 'Full-time',
        matchScore,
        matchedCount,
        requirementsCount: roleReqs.length,
        description: role.description || `Internal position seeking ${role.title}.`,
        technologies: roleReqs.map(r => {
          const sk = CSV_DATA.skillsData.find(s => s.id === r.skill_id);
          return sk?.name || r.skill_id;
        }).join('|')
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => b.matchScore - a.matchScore);
  }, [currentEmployee, requirements, availableRoles]);

  // Combined opportunities
  const allOpportunities = useMemo<OpportunityItem[]>(() => {
    if (apiOpportunities && apiOpportunities.length > 0) {
      return apiOpportunities;
    }
    return [...projectGigs, ...matchedRoleOpportunities];
  }, [apiOpportunities, projectGigs, matchedRoleOpportunities]);

  const filteredOpportunities = useMemo(() => {
    const myAppOppIds = new Set(
      applications
        .filter(a => (a.employee_id === currentEmployee.id || a.employee_id.includes(currentEmployee.id)) && a.status !== 'Withdrawn')
        .map(a => a.opportunity_id)
    );

    const approvedOppIds = new Set(
      applications
        .filter(a => a.status === 'Accepted' && (a.employee_id === currentEmployee.id || a.employee_id.includes(currentEmployee.id)))
        .map(a => a.opportunity_id)
    );

    if (opportunityFilter === 'approved') {
      return allOpportunities.filter(o => approvedOppIds.has(o.id));
    }
    if (opportunityFilter === 'applied') {
      return allOpportunities.filter(o => myAppOppIds.has(o.id));
    }
    if (opportunityFilter === 'projects') {
      return allOpportunities.filter(o => o.type === 'project');
    }
    if (opportunityFilter === 'roles') {
      return allOpportunities.filter(o => o.type === 'role');
    }
    return allOpportunities;
  }, [allOpportunities, opportunityFilter, applications, currentEmployee.id]);

  // Skill category list
  const skillCategories = useMemo(() => {
    const cats = new Set<string>();
    cats.add('All');
    currentEmployee.skills.forEach(s => { if (s.category) cats.add(s.category); });
    return Array.from(cats);
  }, [currentEmployee.skills]);

  // Filtered skills
  const filteredSkills = useMemo(() => {
    let result = currentEmployee.skills;
    if (skillCategoryFilter !== 'All') {
      result = result.filter(s => s.category === skillCategoryFilter);
    }
    if (skillSearchQuery.trim()) {
      const q = skillSearchQuery.toLowerCase();
      result = result.filter(
        s => s.skillName.toLowerCase().includes(q) ||
             s.category.toLowerCase().includes(q) ||
             s.proficiencyLevel.toLowerCase().includes(q)
      );
    }
    return result;
  }, [currentEmployee.skills, skillCategoryFilter, skillSearchQuery]);

  // HR Approvals & Verified Competencies data
  const hrApprovalActivity = useMemo(() => {
    const rawEvidenceRows = CSV_DATA?.records?.evidence || [];
    const seenEvidenceIds = new Set<string>();
    const seenEvidenceTitles = new Set<string>();
    const verifiedEvidenceList: Array<{
      id: string;
      type: 'evidence';
      title: string;
      skillName: string;
      skillId: string;
      level: string;
      date: string;
      status: string;
      weightMultiplier: number;
    }> = [];

    // 1. Verified Evidence items (deduplicated by ID & normalized title, mapped to precise skill)
    currentEmployee.skills.forEach(s => {
      (s.evidenceList || [])
        .filter(e => e.verified || e.verificationStatus === 'Verified by HR' || e.verificationStatus === 'Link checked')
        .forEach(e => {
          const evId = e.id || (e as any).evidenceId;
          if (evId && (deletedEvidenceIds.has(evId) || seenEvidenceIds.has(evId))) return;

          const rawEv = rawEvidenceRows.find(r => r.evidence_id === evId);
          if (rawEv && (rawEv.is_duplicate === '1' || rawEv.is_duplicate === 'true' || rawEv.deleted_at)) {
            return;
          }

          const rawSkillId = rawEv?.skill_id || s.skillId;
          const actualSkill = CSV_DATA?.skillsData?.find(sk => sk.id === rawSkillId);
          const actualSkillName = actualSkill ? actualSkill.name : s.skillName;

          const rawTitle = e.title || (e as any).description || 'Verified Evidence';
          const cleanTitle = rawTitle.replace(/^App\s+/, '').replace(/\s+\d{10,14}$/, '').trim();
          const normTitle = cleanTitle.toLowerCase();

          if (seenEvidenceTitles.has(normTitle)) return;
          if (evId) seenEvidenceIds.add(evId);
          seenEvidenceTitles.add(normTitle);

          verifiedEvidenceList.push({
            id: evId || `ev-${verifiedEvidenceList.length}`,
            type: 'evidence',
            title: cleanTitle,
            skillName: actualSkillName,
            skillId: rawSkillId,
            level: s.proficiencyLevel,
            date: e.date || 'Recent',
            status: e.verificationStatus || 'Verified by HR',
            weightMultiplier: Math.min(e.weightMultiplier || 1.0, 1.0)
          });
        });
    });

    // 2. Approved Courses (deduplicated by resource_id)
    const seenResourceIds = new Set<string>();
    const approvedCourseList = employeeProgress
      .filter(p => !droppedCourseIds.has(p.resource_id) && (p.status === 'Done' || (p as any).approval_status === 'Approved'))
      .filter(p => {
        if (seenResourceIds.has(p.resource_id)) return false;
        seenResourceIds.add(p.resource_id);
        return true;
      })
      .map(p => {
        const res = resources.find(r => r.resource_id === p.resource_id);
        const skill = CSV_DATA?.skillsData?.find(s => s.id === res?.skill_id);
        return {
          id: `course-${p.resource_id}`,
          type: 'course' as const,
          title: res?.title || p.resource_id,
          skillName: skill?.name || res?.skill_id || 'Learning Track',
          date: p.updated_at || 'Recent',
          status: 'Course Approved',
          provider: res?.provider || 'Internal Academy'
        };
      });

    // 3. Accepted Applications (Project Gigs / Roles, deduplicated by opportunity_id)
    const seenOppIds = new Set<string>();
    const acceptedAppList = applications
      .filter(a => a.status === 'Accepted' && (a.employee_id === currentEmployee.id || a.employee_id.includes(currentEmployee.id)))
      .filter(a => {
        if (seenOppIds.has(a.opportunity_id)) return false;
        seenOppIds.add(a.opportunity_id);
        return true;
      })
      .map(a => {
        const opp = allOpportunities.find(o => o.id === a.opportunity_id);
        const rawProj = CSV_DATA?.records?.projects?.find(p => p.project_id === a.opportunity_id);
        return {
          id: a.application_id,
          type: 'application' as const,
          title: opp?.name || rawProj?.project_name || (opp as any)?.title || a.opportunity_id,
          department: opp?.department || rawProj?.domain || 'Fintech & Engineering',
          date: a.applied_at || 'Recent',
          status: 'Accepted by HR',
          note: a.hr_decision_note || a.note || 'Assigned to Project Team',
          hoursPerWeek: Number(a.hours_per_week || 10)
        };
      });

    const totalApprovalsCount = verifiedEvidenceList.length + approvedCourseList.length + acceptedAppList.length;

    return {
      verifiedEvidenceList,
      approvedCourseList,
      acceptedAppList,
      totalApprovalsCount
    };
  }, [currentEmployee.skills, employeeProgress, applications, resources, allOpportunities, currentEmployee.id, deletedEvidenceIds, droppedCourseIds]);

  // Active and Approved Projects the employee is currently working on
  const myActiveProjects = useMemo(() => {
    const rawProjects = CSV_DATA?.records?.projects || [];
    const rawEmpProjects = CSV_DATA?.records?.employeeProjects || [];
    const empId = currentEmployee.id;

    const assignedProjectIds = new Set<string>();
    const list: Array<{
      projectId: string;
      projectName: string;
      role: string;
      domain: string;
      technologies: string[];
      hoursPerWeek: number;
      isHrApproved: boolean;
      isAssigned: boolean;
      assignmentSource: string;
      approvalNote?: string;
      contributionSummary: string;
      startDate?: string;
      endDate?: string;
      complexity: number;
    }> = [];

    // 1. Projects from employeeProjects
    rawEmpProjects
      .filter(ep => ep.employee_id === empId || ep.employee_id === 'emp-1')
      .forEach(ep => {
        const p = rawProjects.find(proj => proj.project_id === ep.project_id);
        if (p) {
          assignedProjectIds.add(p.project_id);
          const acceptedApp = applications.find(
            a => a.opportunity_id === p.project_id && a.status === 'Accepted' && (a.employee_id === empId || a.employee_id === 'emp-1')
          );
          const isGig = Boolean(acceptedApp) || ep.project_id === 'proj-102';
          list.push({
            projectId: p.project_id,
            projectName: p.project_name,
            role: ep.role || (isGig ? 'Full Stack Contributor' : 'Lead Frontend Architect'),
            domain: p.domain || 'Fintech & Payment Security',
            technologies: (p.technologies || '').split('|').filter(Boolean),
            hoursPerWeek: isGig ? (acceptedApp ? Number(acceptedApp.hours_per_week || 10) : 10) : 25,
            isHrApproved: isGig,
            isAssigned: true,
            assignmentSource: isGig ? 'HR Approved Gig' : 'Direct Staffing',
            approvalNote: acceptedApp?.hr_decision_note || (isGig ? 'Team has approved capacity and matched required competencies.' : undefined),
            contributionSummary: ep.contribution_summary || 'Active initiative contribution',
            startDate: p.start_date,
            endDate: p.end_date,
            complexity: Number(p.complexity || 5)
          });
        }
      });

    // 2. Also ensure any accepted project applications are included
    applications
      .filter(a => a.status === 'Accepted' && (a.employee_id === empId || a.employee_id === 'emp-1') && !assignedProjectIds.has(a.opportunity_id))
      .forEach(a => {
        const p = rawProjects.find(proj => proj.project_id === a.opportunity_id);
        if (p) {
          assignedProjectIds.add(p.project_id);
          list.push({
            projectId: p.project_id,
            projectName: p.project_name,
            role: 'Contributor',
            domain: p.domain || 'Engineering',
            technologies: (p.technologies || '').split('|').filter(Boolean),
            hoursPerWeek: Number(a.hours_per_week || 10),
            isHrApproved: true,
            isAssigned: true,
            assignmentSource: 'Marketplace Application Accepted',
            approvalNote: a.hr_decision_note || 'Application accepted by HR administrator.',
            contributionSummary: a.note || 'Active marketplace project gig',
            startDate: p.start_date,
            endDate: p.end_date,
            complexity: Number(p.complexity || 4)
          });
        }
      });

    return list;
  }, [currentEmployee.id, applications]);

  // Assigned Projects subset
  const myAssignedProjects = useMemo(() => {
    return myActiveProjects.filter(p => p.isAssigned !== false);
  }, [myActiveProjects]);

  // Pending project and role applications awaiting HR review
  const myPendingApplications = useMemo(() => {
    const rawProjects = CSV_DATA?.records?.projects || [];
    const empId = currentEmployee.id;
    return applications
      .filter(a => a.status !== 'Accepted' && a.status !== 'Withdrawn' && (a.employee_id === empId || a.employee_id === 'emp-1'))
      .map(a => {
        const p = rawProjects.find(proj => proj.project_id === a.opportunity_id);
        const role = CSV_DATA?.rolesData?.find(r => r.id === a.opportunity_id);
        return {
          applicationId: a.application_id,
          targetId: a.opportunity_id,
          title: p?.project_name || role?.title || a.opportunity_id,
          type: a.opportunity_type || (p ? 'Project Gig' : 'Career Role'),
          status: a.status || 'Pending Review',
          appliedAt: a.applied_at || 'Recent',
          hoursPerWeek: Number(a.hours_per_week || 20),
          note: a.note || 'Application submitted for consideration.',
          hrDecisionNote: a.hr_decision_note
        };
      });
  }, [currentEmployee.id, applications]);

  // Handle saving availability
  const handleSaveAvailability = async () => {
    setSavingAvailability(true);
    try {
      if (onUpdateAvailability) {
        await onUpdateAvailability(availabilityPercent, hoursPerWeekFree);
      } else {
        const res = await apiFetch('/api/employee/availability', {
          method: 'PUT',
          body: JSON.stringify({
            availability_percent: availabilityPercent,
            hours_per_week_free: hoursPerWeekFree,
            version: currentEmployee.version
          })
        });
        if (!res.ok) {
          throw new Error(res.error || 'Failed to update availability');
        }
      }
      if (onReloadData) await onReloadData();
      onShowToast('Availability settings updated and synced successfully!');
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Could not save availability. Please try again.');
    } finally {
      setSavingAvailability(false);
    }
  };

  // Course progress change handler
  const handleCourseProgressUpdate = async (resourceId: string, roleId: string, status: string, progressPercent: string) => {
    const targetRoleId = roleId || selectedAmbitionRoleId || 'role-fintech-app-lead';

    // Optimistic UI update
    setOptimisticProgress(prev => ({
      ...prev,
      [`${targetRoleId}:${resourceId}`]: { status, percent: progressPercent }
    }));

    const row: ProgressRow = {
      employee_id: currentEmployee.id,
      role_id: targetRoleId,
      resource_id: resourceId,
      status,
      progress_percent: progressPercent,
      updated_at: new Date().toISOString()
    };

    try {
      if (onUpdateProgress) {
        await onUpdateProgress(row);
      } else {
        const res = await apiFetch('/api/upskilling-progress', {
          method: 'POST',
          body: JSON.stringify(row)
        });
        if (!res.ok) throw new Error(res.error || 'Failed to save progress');
      }
      if (onReloadData) await onReloadData();
      onShowToast(
        progressPercent === '100'
          ? '🎉 Course completed! Your skill score and readiness have increased!'
          : `Learning progress updated to ${progressPercent}% (${status})!`
      );
    } catch {
      onShowToast('Could not save progress. Please try again.');
    }
  };

  // Enroll in course via backend API
  const handleEnrollCourse = async (resourceId: string) => {
    try {
      const res = await apiFetch('/api/upskilling/enroll', {
        method: 'POST',
        body: JSON.stringify({ resource_id: resourceId, role_id: selectedAmbitionRoleId })
      });
      if (!res.ok) {
        throw new Error(res.error || 'Failed to enroll in course.');
      }
      onShowToast(res.data?.message || 'Enrolled in course successfully!');
      if (onReloadData) await onReloadData();
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Could not enroll in course.');
    }
  };

  // Drop enrolled course via backend API (preserves logged hours)
  const handleUnenrollCourse = async (resourceId: string) => {
    if (!window.confirm('Drop this course? Your logged hours will be preserved in your learning audit history.')) {
      return;
    }
    // Optimistic immediate update
    setDroppedCourseIds(prev => new Set(prev).add(resourceId));
    try {
      const res = await apiFetch('/api/upskilling/unenroll', {
        method: 'POST',
        body: JSON.stringify({ resource_id: resourceId, role_id: selectedAmbitionRoleId })
      });
      if (!res.ok) {
        throw new Error(res.error || 'Failed to drop course.');
      }
      onShowToast(res.data?.message || 'Course dropped. Logged hours preserved in audit history.');
      if (onReloadData) await onReloadData();
    } catch (err) {
      setDroppedCourseIds(prev => {
        const next = new Set(prev);
        next.delete(resourceId);
        return next;
      });
      onShowToast(err instanceof Error ? err.message : 'Could not drop course.');
    }
  };

  // Handle evidence deletion with 10s undo
  const handleDeleteEvidence = async (evidenceId: string, evidenceTitle: string) => {
    setDeletingEvidenceId(evidenceId);
    // Optimistic immediate removal from views
    setDeletedEvidenceIds(prev => new Set(prev).add(evidenceId));
    try {
      const res = await apiFetch(`/api/evidence/${evidenceId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(res.error || 'Failed to delete evidence.');
      onShowToast(
        `Proof "${evidenceTitle}" deleted.`,
        {
          label: 'Undo',
          durationSeconds: 10,
          onUndo: async () => {
            setDeletedEvidenceIds(prev => {
              const next = new Set(prev);
              next.delete(evidenceId);
              return next;
            });
            await apiFetch(`/api/evidence/${evidenceId}/undo-delete`, { method: 'POST' });
            if (onReloadData) await onReloadData();
          }
        } as any
      );
      if (onReloadData) await onReloadData();
    } catch (err) {
      setDeletedEvidenceIds(prev => {
        const next = new Set(prev);
        next.delete(evidenceId);
        return next;
      });
      onShowToast(err instanceof Error ? err.message : 'Could not delete proof.');
    } finally {
      setDeletingEvidenceId(null);
    }
  };

  // Handle withdraw application
  const handleWithdrawApplication = async (opportunityId: string) => {
    // 1. Optimistic immediate state update: mark as Withdrawn so cards and buttons flip instantly
    setApplications(prev =>
      prev.map(a =>
        (a.opportunity_id === opportunityId || a.application_id === opportunityId)
          ? { ...a, status: 'Withdrawn' }
          : a
      )
    );
    try {
      const res = await apiFetch('/api/project-applications', {
        method: 'DELETE',
        body: JSON.stringify({ opportunity_id: opportunityId, delete: true })
      });
      if (!res.ok) throw new Error(res.error || 'Failed to withdraw');
      await fetchApplications();
      if (onReloadData) await onReloadData();
      onShowToast('Application and interest withdrawn successfully.');
    } catch {
      await fetchApplications();
      onShowToast('Could not withdraw application.');
    }
  };

  const myAppliedSet = useMemo(() => {
    return new Set(
      applications
        .filter(a => (a.employee_id === currentEmployee.id || a.employee_id.includes(currentEmployee.id)) && a.status !== 'Withdrawn')
        .map(a => a.opportunity_id)
    );
  }, [applications, currentEmployee.id]);

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      {/* ── Employee Portal Hero Card ──────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl border border-teal-500/20 bg-gradient-to-br from-teal-500/[0.08] via-surface to-surface p-6 sm:p-8 shadow-xs">
        {/* Decorative background glow */}
        <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-teal-500/10 blur-3xl pointer-events-none" />

        <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
            {/* 64px Avatar with Emerald Role Ring */}
            <div className="relative shrink-0">
              <Avatar
                name={currentEmployee.name}
                role="Employee"
                size="xl"
                className="h-16 w-16 text-lg rounded-2xl shadow-md ring-4 ring-[#10B981]/30 font-bold"
              />
              <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#10B981] text-white shadow-xs ring-2 ring-surface">
                <Check className="h-3 w-3 stroke-[3]" />
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-500/10 border border-teal-500/30 px-3 py-0.5 text-xs font-semibold text-teal-600 dark:text-teal-400">
                  <ShieldCheck className="w-3.5 h-3.5 text-teal-500" /> Career Profile
                </span>
                <span className="rounded-full bg-surface border border-border px-2.5 py-0.5 text-xs font-medium text-text-muted">
                  {currentEmployee.department}
                </span>
                <button
                  type="button"
                  onClick={onOpenEditProfile}
                  className="rounded-full border border-[#10B981]/40 bg-[#10B981]/10 px-3 py-0.5 text-xs font-bold text-[#059669] dark:text-[#34D399] hover:bg-[#10B981]/20 transition-all flex items-center gap-1"
                >
                  <Sparkles className="w-3 h-3 text-[#10B981]" /> Edit Profile &amp; Skills
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEvidenceTargetSkill('');
                    setShowSubmitEvidenceModal(true);
                  }}
                  className="rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-0.5 text-xs font-bold text-teal-700 dark:text-teal-300 hover:bg-teal-500/20 transition-all flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Submit Skill Proof
                </button>
              </div>

              <h1 className="mt-2 text-2xl font-heading font-semibold text-text-primary tracking-tight">
                {currentEmployee.name}
              </h1>
              <p className="mt-1 text-sm font-semibold text-text-muted flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-[#10B981]" />
                <span>{currentEmployee.role}</span>
                <span className="text-text-muted/60">•</span>
                <span>{currentEmployee.team}</span>
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-text-muted">
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-text-muted/80" /> {currentEmployee.location}
                </span>
                <span className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-text-muted/80" /> {currentEmployee.email}
                </span>
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-text-muted/80" /> {currentEmployee.yearsExperience || 0} yrs tenure
                </span>
              </div>
            </div>
          </div>

          {/* Completeness Ring & Quick Metrics Grid */}
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full md:w-auto">
            {/* Profile Completeness Ring Card */}
            <div className="flex items-center gap-3.5 rounded-2xl border border-[#10B981]/20 bg-surface/90 backdrop-blur-xs p-3.5 px-4 shadow-xs w-full sm:w-auto">
              <ProgressRing
                value={completenessScore}
                size={52}
                strokeWidth={5}
                variant="accent"
                label={
                  <span className="text-[11px] font-bold tabular-nums text-[#059669] dark:text-[#34D399]">
                    {completenessScore}%
                  </span>
                }
              />
              <div className="text-left">
                <div className="text-xs font-bold text-text-primary">Profile Score</div>
                <div className="text-[11px] text-text-muted">
                  {completenessScore === 100 ? 'Fully completed' : 'Profile strength'}
                </div>
              </div>
            </div>

            {/* Quick Metrics Grid (Clickable) */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setActiveSubTab('skills')}
                className="rounded-2xl border border-border bg-surface/90 backdrop-blur-xs p-3 text-center min-w-[76px] hover:border-teal-500/50 hover:bg-surface transition-all cursor-pointer shadow-2xs group"
                title="View my skills portfolio"
              >
                <div className="text-xl font-heading font-bold tabular-nums text-text-primary group-hover:text-teal-600 transition-colors">{currentEmployee.skills.length}</div>
                <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider mt-0.5 group-hover:text-teal-600/80 transition-colors">Skills</div>
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab('skills')}
                className="rounded-2xl border border-teal-500/25 bg-teal-500/5 p-3 text-center min-w-[76px] hover:border-teal-500/50 hover:bg-teal-500/10 transition-all cursor-pointer shadow-2xs group"
                title="View evidence proofs portfolio"
              >
                <div className="text-xl font-heading font-bold tabular-nums text-teal-600 dark:text-teal-400">{totalEvidenceArtifacts}</div>
                <div className="text-[10px] font-bold text-teal-600/80 dark:text-teal-400/80 uppercase tracking-wider mt-0.5">Evidence</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setCourseFilter('enrolled');
                  setActiveSubTab('courses');
                }}
                className="rounded-2xl border border-border bg-surface/90 backdrop-blur-xs p-3 text-center min-w-[76px] hover:border-teal-500/50 hover:bg-surface transition-all cursor-pointer shadow-2xs group"
                title="View enrolled courses"
              >
                <div className="text-xl font-heading font-bold tabular-nums text-teal-600 dark:text-teal-400">{employeeProgress.length}</div>
                <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider mt-0.5 group-hover:text-teal-600/80 transition-colors">Courses</div>
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab('projects')}
                className="rounded-2xl border border-purple-500/25 bg-purple-500/5 p-3 text-center min-w-[76px] hover:border-purple-500/50 hover:bg-purple-500/10 transition-all cursor-pointer shadow-2xs group"
                title="View my active and approved projects"
              >
                <div className="text-xl font-heading font-bold tabular-nums text-purple-600 dark:text-purple-400">{myActiveProjects.length}</div>
                <div className="text-[10px] font-bold text-purple-600/80 dark:text-purple-400/80 uppercase tracking-wider mt-0.5">Projects</div>
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab('opportunities')}
                className="rounded-2xl border border-border bg-surface/90 backdrop-blur-xs p-3 text-center min-w-[76px] hover:border-teal-500/50 hover:bg-surface transition-all cursor-pointer shadow-2xs group"
                title="View matched opportunities & gigs"
              >
                <div className="text-xl font-heading font-bold tabular-nums text-teal-600 dark:text-teal-400">{allOpportunities.length}</div>
                <div className="text-[10px] font-bold text-text-muted uppercase tracking-wider mt-0.5 group-hover:text-teal-600 transition-colors">Opportunities</div>
              </button>
              <button
                type="button"
                onClick={() => setActiveSubTab('notifications')}
                className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-3 text-center min-w-[76px] hover:border-amber-500/50 hover:bg-amber-500/10 transition-all cursor-pointer shadow-2xs group"
                title="View my activity notifications & decisions"
              >
                <div className="text-xl font-heading font-bold tabular-nums text-amber-600 dark:text-amber-400 flex items-center justify-center gap-1">
                  <Bell className="w-3.5 h-3.5 text-amber-500" />
                  <span>{notifications.length}</span>
                  {unreadCount > 0 && (
                    <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-rose-500 text-white font-extrabold ml-1">
                      {unreadCount}
                    </span>
                  )}
                </div>
                <div className="text-[10px] font-bold text-amber-600/80 dark:text-amber-400/80 uppercase tracking-wider mt-0.5">Activity</div>
              </button>
            </div>
          </div>
        </div>

        {/* Navigation Tabs within Employee Hub */}
        <div className="mt-8 flex items-center gap-1.5 border-b border-border/80 overflow-x-auto pb-px scrollbar-none">
          {[
            { id: 'overview', label: 'Overview & Pathways', icon: Sliders },
            { id: 'projects', label: `My Projects (${myActiveProjects.length})`, icon: FolderGit2 },
            { id: 'skills', label: `My Skills (${currentEmployee.skills.length})`, icon: ShieldCheck },
            { id: 'courses', label: `Learning & Upskilling (${employeeProgress.length})`, icon: GraduationCap },
            { id: 'opportunities', label: `Internal Opportunities (${allOpportunities.length})`, icon: Briefcase },
            {
              id: 'notifications',
              label: `Notifications & Activity (${notifications.length})`,
              icon: Bell,
              unread: unreadCount > 0 ? unreadCount : undefined
            },
          ].map(tab => {
            const Icon = tab.icon;
            const active = activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id as typeof activeSubTab)}
                className={`relative flex items-center gap-2 px-4 py-3 text-xs sm:text-sm font-semibold rounded-t-xl transition-all whitespace-nowrap cursor-pointer ${
                  active
                    ? 'text-text-primary bg-surface/90 shadow-2xs font-bold'
                    : 'text-text-muted hover:text-text-primary hover:bg-surface/50'
                }`}
              >
                <Icon className={`w-4 h-4 ${active ? 'text-[#10B981]' : 'text-text-muted'}`} />
                <span>{tab.label}</span>
                {tab.unread !== undefined && (
                  <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-black text-white shadow-2xs">
                    {tab.unread} new
                  </span>
                )}
                {active && (
                  <span className="absolute bottom-0 left-0 right-0 h-[2.5px] bg-[#10B981] rounded-t-full shadow-xs" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Fresh Employee Welcome Banner ──────────────────────────── */}
      {currentEmployee.skills.length === 0 && (
        <div className="rounded-3xl border border-dashed border-[#10B981]/40 bg-gradient-to-r from-[#10B981]/10 via-surface to-[#10B981]/5 p-6 sm:p-7 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#059669] dark:text-[#34D399] uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" /> Welcome to your Career Hub
              </span>
              <h3 className="text-lg font-bold text-text-primary">Complete your technical profile to unlock matches</h3>
              <p className="text-xs text-text-muted max-w-xl">
                Add your core programming languages, frameworks, and submit repository proof artifacts to view personalized skill gap analysis and internal project matches.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenEditProfile}
              className="rounded-xl px-5 py-2.5 text-xs font-bold flex items-center justify-center gap-2 shrink-0 self-start sm:self-center text-white bg-teal-600 hover:bg-teal-700 shadow-xs"
            >
              <Plus className="w-4 h-4" /> Add Your Skills
            </button>
          </div>
        </div>
      )}

      {/* ── SubTab 1: Overview & Availability ──────────────────────── */}
      {activeSubTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Availability Control Card */}
          <div className="lg:col-span-1 space-y-6">
            <div className="rounded-2xl border border-border bg-surface p-6 space-y-5 shadow-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
                  <Clock className="w-4 h-4 text-teal-500" /> Availability &amp; Bandwidth
                </h3>
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                  availabilityPercent >= 50
                    ? 'bg-teal-500/10 text-teal-600 border border-teal-500/30'
                    : 'bg-amber-500/10 text-amber-600 border border-amber-500/30'
                }`}>
                  {availabilityPercent}% Free
                </span>
              </div>
              <p className="text-xs text-text-muted leading-relaxed">
                Keep your available bandwidth up to date so team leads can invite you to high-impact internal project gigs.
              </p>

              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs font-semibold text-text-muted mb-2">
                    <span>Available Capacity</span>
                    <span className="text-text-primary font-bold">{availabilityPercent}% ({hoursPerWeekFree} hrs/wk)</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={availabilityPercent}
                    onChange={e => {
                      const val = Number(e.target.value);
                      setAvailabilityPercent(val);
                      setHoursPerWeekFree(Math.round((val / 100) * 40));
                    }}
                    className="w-full accent-teal-500 cursor-pointer h-2 bg-surface-alt rounded-lg appearance-none"
                  />
                </div>

                {/* Preset buttons */}
                <div className="grid grid-cols-4 gap-2 pt-1">
                  {[
                    { label: 'Full (40h)', pct: 100, hrs: 40 },
                    { label: 'Part (20h)', pct: 50, hrs: 20 },
                    { label: 'Side (10h)', pct: 25, hrs: 10 },
                    { label: 'Busy (0h)', pct: 0, hrs: 0 },
                  ].map(p => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => {
                        setAvailabilityPercent(p.pct);
                        setHoursPerWeekFree(p.hrs);
                      }}
                      className={`rounded-xl border py-1.5 text-xs font-semibold transition-all ${
                        availabilityPercent === p.pct
                          ? 'border-teal-500 bg-teal-500/10 text-teal-700 dark:text-teal-300'
                          : 'border-border bg-surface-alt text-text-muted hover:border-border/80 hover:text-text-primary'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleSaveAvailability}
                  disabled={savingAvailability}
                  className="w-full rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white transition-all shadow-xs disabled:opacity-50"
                >
                  {savingAvailability ? (
                    <span>Saving to Database…</span>
                  ) : (
                    <>
                      <Check className="w-4 h-4" /> Save Availability
                    </>
                  )}
                </button>
              </div>

              {/* Bandwidth tip */}
              <div className="rounded-xl border border-border bg-surface-alt p-3.5 text-xs text-text-muted space-y-1.5">
                <div className="font-semibold text-text-primary flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-teal-500" /> Internal Mobility Tip
                </div>
                <p>Employees with 15+ hours/week free capacity are matched to 2.8x more cross-functional team initiatives.</p>
              </div>

              {/* Direct Opportunities CTA on Overview */}
              <div className="rounded-xl border border-teal-500/30 bg-teal-500/5 p-3.5 text-xs space-y-2">
                <div className="font-semibold text-text-primary flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-bold">
                    <Briefcase className="w-3.5 h-3.5 text-teal-500" /> Internal Opportunities
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-600">
                    {allOpportunities.length} Matched
                  </span>
                </div>
                <p className="text-text-muted leading-relaxed">
                  Explore open project gigs and transfer roles tailored to your evaluated skills.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveSubTab('opportunities')}
                  className="w-full rounded-xl py-2 text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white transition-all flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  Browse Opportunities ({allOpportunities.length}) <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Career Ambition Selector Card */}
            <div className="rounded-2xl border border-border bg-surface p-6 space-y-4 shadow-xs">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
                  <Target className="w-4 h-4 text-teal-500" /> My Career Ambition
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-600">
                  Target Role
                </span>
              </div>
              <p className="text-xs text-text-muted">
                Choose your target ambition role in the company to view your skill readiness and access gap-closing courses.
              </p>

              <div>
                <label className="block text-xs font-semibold text-text-muted mb-1.5">Select Ambition Role</label>
                <select
                  value={selectedAmbitionRoleId}
                  onChange={e => handleSelectAmbitionRole(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface-alt px-3 py-2 text-xs text-text-primary font-semibold focus:border-teal-500 focus:outline-none"
                >
                  {availableRoles.map(role => (
                    <option key={role.id} value={role.id}>
                      {role.title} ({role.department})
                    </option>
                  ))}
                </select>
              </div>

              {ambitionAnalysis && (
                <div className="rounded-xl border border-teal-500/20 bg-teal-500/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-text-muted">Promotion Readiness</span>
                    <span className="text-sm font-bold text-teal-600 dark:text-teal-400 font-mono">
                      {ambitionAnalysis.readinessPercent}%
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-border overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full transition-all duration-300"
                      style={{ width: `${ambitionAnalysis.readinessPercent}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-text-muted">
                    <span>Est. Time to Ready:</span>
                    <strong className="text-text-primary">{ambitionAnalysis.readyInWeeksRange}</strong>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (ambitionAnalysis?.gaps && ambitionAnalysis.gaps.length > 0) {
                        setBridgeGapsFilter(ambitionAnalysis.gaps.map(g => g.skillName));
                        setCourseSearchQuery('');
                      }
                      setActiveSubTab('courses');
                    }}
                    className="w-full rounded-xl py-2 text-xs font-semibold bg-teal-600 hover:bg-teal-700 text-white transition-all flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <GraduationCap className="w-3.5 h-3.5" /> View Upskilling Plan
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Core Profile, Ambition Breakdown & Skills Highlight */}
          <div className="lg:col-span-2 space-y-6">
            {/* ── HR Approvals & Verified Status Activity Feed ── */}
            <div className="rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 via-teal-500/5 to-surface p-6 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 uppercase tracking-wider flex items-center gap-1.5 border border-emerald-500/30">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      HR Audit &amp; Verification Live
                    </span>
                    <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Live in Employee Record
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
                    <Award className="w-5 h-5 text-emerald-500 shrink-0" />
                    HR Approvals &amp; Verified Competencies
                  </h3>
                  <p className="text-xs text-text-muted leading-relaxed">
                    Live updates from HR reviews: verified proofs apply 1.0 weight to boost skill levels, completed courses award credentials, and accepted applications join project teams.
                  </p>
                </div>
                <div className="shrink-0 self-start sm:self-center">
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-xl shadow-2xs whitespace-nowrap">
                    {hrApprovalActivity.totalApprovalsCount} Total Approved
                  </span>
                </div>
              </div>

              {/* 3 Metric Summary Buttons (Interactive Category Filters) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setApprovalCategoryFilter(f => f === 'evidence' ? 'all' : 'evidence')}
                  className={`text-left rounded-xl border p-3.5 space-y-1.5 transition-all cursor-pointer ${
                    approvalCategoryFilter === 'evidence'
                      ? 'border-emerald-500 bg-emerald-500/15 ring-2 ring-emerald-500/30 shadow-xs'
                      : 'border-border/80 bg-surface/90 hover:bg-emerald-500/5 hover:border-emerald-500/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-text-muted flex items-center gap-1.5">
                      <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" /> Verified Proofs
                    </span>
                    <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 font-mono">
                      {hrApprovalActivity.verifiedEvidenceList.length}
                    </span>
                  </div>
                  <p className="text-[11px] text-text-muted">Weight 1.0 active • Boosts proficiency level</p>
                </button>

                <button
                  type="button"
                  onClick={() => setApprovalCategoryFilter(f => f === 'courses' ? 'all' : 'courses')}
                  className={`text-left rounded-xl border p-3.5 space-y-1.5 transition-all cursor-pointer ${
                    approvalCategoryFilter === 'courses'
                      ? 'border-blue-500 bg-blue-500/15 ring-2 ring-blue-500/30 shadow-xs'
                      : 'border-border/80 bg-surface/90 hover:bg-blue-500/5 hover:border-blue-500/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-text-muted flex items-center gap-1.5">
                      <GraduationCap className="w-4 h-4 text-blue-500 shrink-0" /> Approved Courses
                    </span>
                    <span className="text-sm font-bold text-blue-600 dark:text-blue-400 font-mono">
                      {hrApprovalActivity.approvedCourseList.length}
                    </span>
                  </div>
                  <p className="text-[11px] text-text-muted">100% Completed • Certificate issued</p>
                </button>

                <button
                  type="button"
                  onClick={() => setApprovalCategoryFilter(f => f === 'projects' ? 'all' : 'projects')}
                  className={`text-left rounded-xl border p-3.5 space-y-1.5 transition-all cursor-pointer ${
                    approvalCategoryFilter === 'projects'
                      ? 'border-purple-500 bg-purple-500/15 ring-2 ring-purple-500/30 shadow-xs'
                      : 'border-border/80 bg-surface/90 hover:bg-purple-500/5 hover:border-purple-500/40'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-text-muted flex items-center gap-1.5">
                      <Briefcase className="w-4 h-4 text-purple-500 shrink-0" /> Accepted Gigs
                    </span>
                    <span className="text-sm font-bold text-purple-600 dark:text-purple-400 font-mono">
                      {hrApprovalActivity.acceptedAppList.length}
                    </span>
                  </div>
                  <p className="text-[11px] text-text-muted">Assigned to team • Bandwidth booked</p>
                </button>
              </div>

              {/* Filter Tabs Bar */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-border/60 scrollbar-none">
                {[
                  { id: 'all', label: `All Approvals (${hrApprovalActivity.totalApprovalsCount})` },
                  { id: 'projects', label: `🏢 Approved Projects (${hrApprovalActivity.acceptedAppList.length})` },
                  { id: 'courses', label: `🎓 Approved Courses (${hrApprovalActivity.approvedCourseList.length})` },
                  { id: 'evidence', label: `🛡️ Verified Proofs (${hrApprovalActivity.verifiedEvidenceList.length})` }
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setApprovalCategoryFilter(tab.id as typeof approvalCategoryFilter)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                      approvalCategoryFilter === tab.id
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-surface-alt border border-border/70 text-text-muted hover:text-text-primary hover:border-border'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Approvals Feed Display */}
              {hrApprovalActivity.totalApprovalsCount > 0 ? (
                <div className="space-y-3 max-h-96 overflow-y-auto pr-1.5">
                  {/* Category 1: Accepted Project Applications */}
                  {(approvalCategoryFilter === 'all' || approvalCategoryFilter === 'projects') && hrApprovalActivity.acceptedAppList.length > 0 && (
                    <div className="space-y-2">
                      {approvalCategoryFilter === 'all' && (
                        <div className="flex items-center gap-2 text-xs font-bold text-purple-700 dark:text-purple-300 px-1 pt-1">
                          <Briefcase className="w-3.5 h-3.5 text-purple-500" />
                          <span>Approved Projects &amp; Gigs ({hrApprovalActivity.acceptedAppList.length})</span>
                        </div>
                      )}
                      {hrApprovalActivity.acceptedAppList.map((app, idx) => (
                        <div
                          key={`app-${app.id}-${idx}`}
                          className="rounded-xl border border-purple-500/30 bg-purple-500/5 hover:bg-purple-500/10 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all shadow-2xs"
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-purple-500/15 text-purple-600 flex items-center justify-center shrink-0 mt-0.5">
                              <Briefcase className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-text-primary">{app.title}</span>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-500/30 flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 text-purple-500" /> HR Approved • Joined Team
                                </span>
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-surface border border-border text-text-muted">
                                  {app.hoursPerWeek} hrs/week
                                </span>
                              </div>
                              <p className="text-[11px] text-text-muted leading-relaxed">
                                <strong>HR Decision Note:</strong> &quot;{app.note}&quot; • Department: {app.department}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveSubTab('projects')}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-purple-500/30 bg-surface hover:bg-purple-500/10 text-purple-600 flex items-center gap-1.5 shrink-0 self-end sm:self-center transition-colors cursor-pointer"
                          >
                            View Project <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Category 2: Approved Courses */}
                  {(approvalCategoryFilter === 'all' || approvalCategoryFilter === 'courses') && hrApprovalActivity.approvedCourseList.length > 0 && (
                    <div className="space-y-2 pt-1">
                      {approvalCategoryFilter === 'all' && (
                        <div className="flex items-center gap-2 text-xs font-bold text-blue-700 dark:text-blue-300 px-1 pt-1">
                          <GraduationCap className="w-3.5 h-3.5 text-blue-500" />
                          <span>Approved Courses &amp; Certificates ({hrApprovalActivity.approvedCourseList.length})</span>
                        </div>
                      )}
                      {hrApprovalActivity.approvedCourseList.map((crs, idx) => (
                        <div
                          key={`crs-${crs.id}-${idx}`}
                          className="rounded-xl border border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all shadow-2xs"
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-600 flex items-center justify-center shrink-0 mt-0.5">
                              <GraduationCap className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-text-primary">{crs.title}</span>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/30 flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 text-blue-500" /> Course Verified &amp; Certified
                                </span>
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-surface border border-border text-text-muted">
                                  {crs.skillName}
                                </span>
                              </div>
                              <p className="text-[11px] text-text-muted leading-relaxed">
                                {crs.provider} • 100% Completed • Certificate awarded &amp; level advancement unlocked
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setActiveSubTab('courses')}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-blue-500/30 bg-surface hover:bg-blue-500/10 text-blue-600 flex items-center gap-1.5 shrink-0 self-end sm:self-center transition-colors cursor-pointer"
                          >
                            View Courses <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Category 3: Verified Evidence */}
                  {(approvalCategoryFilter === 'all' || approvalCategoryFilter === 'evidence') && hrApprovalActivity.verifiedEvidenceList.length > 0 && (
                    <div className="space-y-2 pt-1">
                      {approvalCategoryFilter === 'all' && (
                        <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-300 px-1 pt-1">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Verified Skill Proofs ({hrApprovalActivity.verifiedEvidenceList.length})</span>
                        </div>
                      )}
                      {hrApprovalActivity.verifiedEvidenceList.map((ev, idx) => (
                        <div
                          key={`ev-${ev.id}-${idx}`}
                          className="rounded-xl border border-emerald-500/20 bg-surface/95 hover:bg-surface p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all shadow-2xs"
                        >
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                              <CheckCircle2 className="w-4 h-4" />
                            </div>
                            <div className="min-w-0 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-text-primary">{ev.title}</span>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25">
                                  Verified by HR
                                </span>
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-surface-alt border border-border text-text-muted">
                                  {ev.skillName} ({ev.level})
                                </span>
                              </div>
                              <p className="text-[11px] text-text-muted leading-relaxed">
                                Full {Math.round(ev.weightMultiplier * 100)}% confidence weight applied to {ev.skillName} score • Level boosted
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => onInspectEvidence(currentEmployee, ev.skillName)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-500/30 bg-surface hover:bg-emerald-500/10 text-emerald-600 flex items-center gap-1.5 shrink-0 self-end sm:self-center transition-colors cursor-pointer"
                          >
                            Inspect <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-surface/50 p-6 text-center text-xs text-text-muted space-y-1">
                  <p className="font-semibold text-text-primary">No approvals found for this category</p>
                  <p>Select &quot;All Approvals&quot; to review your full verification record.</p>
                </div>
              )}
            </div>

            {/* ── My Active Projects & Assignments (Currently Working On) ── */}
            <div className="rounded-2xl border border-teal-500/30 bg-surface p-6 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-teal-500/10 text-teal-700 dark:text-teal-300 uppercase tracking-wider border border-teal-500/20">
                      Team Allocations &amp; Gigs
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-text-primary mt-1.5 flex items-center gap-2">
                    <FolderGit2 className="w-5 h-5 text-teal-500" />
                    Currently Working On &amp; Approved Projects
                  </h3>
                  <p className="text-xs text-text-muted mt-0.5">
                    Your active core project assignments and marketplace gigs approved by HR administrators.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-teal-700 dark:text-teal-300 bg-teal-500/10 border border-teal-500/20 px-3 py-1.5 rounded-xl shadow-2xs">
                    {myActiveProjects.length} Active {myActiveProjects.length === 1 ? 'Project' : 'Projects'}
                  </span>
                </div>
              </div>

              {/* Workload Capacity Allocation Bar */}
              <div className="rounded-xl border border-border bg-surface-alt p-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-text-primary flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-teal-500" /> Weekly Bandwidth Allocation
                  </span>
                  <span className="font-bold text-text-primary">
                    {myActiveProjects.reduce((s, p) => s + p.hoursPerWeek, 0)} hrs committed / 40 hrs total ({hoursPerWeekFree} hrs free)
                  </span>
                </div>
                <div className="h-3 w-full rounded-full bg-border overflow-hidden flex">
                  {myActiveProjects.map((p, idx) => {
                    const pct = (p.hoursPerWeek / 40) * 100;
                    const colors = [
                      'bg-teal-500',
                      'bg-purple-500',
                      'bg-blue-500',
                      'bg-emerald-500'
                    ];
                    return (
                      <div
                        key={p.projectId}
                        style={{ width: `${pct}%` }}
                        className={`${colors[idx % colors.length]} h-full transition-all`}
                        title={`${p.projectName}: ${p.hoursPerWeek} hrs/wk`}
                      />
                    );
                  })}
                </div>
                <div className="flex items-center gap-4 text-[11px] text-text-muted flex-wrap pt-0.5">
                  {myActiveProjects.map((p, idx) => {
                    const dots = [
                      'bg-teal-500',
                      'bg-purple-500',
                      'bg-blue-500',
                      'bg-emerald-500'
                    ];
                    return (
                      <div key={p.projectId} className="flex items-center gap-1.5">
                        <span className={`w-2.5 h-2.5 rounded-full ${dots[idx % dots.length]}`} />
                        <span className="font-medium text-text-primary">{p.projectName}</span>
                        <span className="text-text-muted">({p.hoursPerWeek}h/wk)</span>
                      </div>
                    );
                  })}
                  <div className="flex items-center gap-1.5 ml-auto">
                    <span className="w-2.5 h-2.5 rounded-full bg-border" />
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">Available Bandwidth: {hoursPerWeekFree}h</span>
                  </div>
                </div>
              </div>

              {/* Sub-Filters: All, Assigned, Working On, Approved, Pending */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none border-b border-border/60 pb-2">
                {[
                  { id: 'all', label: `All Active & Approved (${myActiveProjects.length})` },
                  { id: 'assigned', label: `🎯 Assigned Projects (${myAssignedProjects.length})` },
                  { id: 'working_on', label: `⚡ Currently Working On (${myActiveProjects.length})` },
                  { id: 'approved', label: `✅ HR Approved Gigs (${myActiveProjects.filter(p => p.isHrApproved).length})` },
                  { id: 'pending', label: `⏳ Pending HR Review (${myPendingApplications.length})` },
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setProjectSubFilter(tab.id as typeof projectSubFilter)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                      projectSubFilter === tab.id
                        ? 'bg-teal-600 text-white shadow-2xs font-bold'
                        : 'bg-surface border border-border text-text-muted hover:text-text-primary hover:bg-surface-alt'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Projects Grid Display */}
              {projectSubFilter === 'pending' ? (
                <div className="grid grid-cols-1 gap-3.5">
                  {myPendingApplications.length > 0 ? (
                    myPendingApplications.map(app => (
                      <div
                        key={app.applicationId}
                        className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-2.5 transition-all shadow-2xs"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-bold text-sm text-text-primary">{app.title}</h4>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1">
                                <Clock className="w-3 h-3 text-amber-500" /> Pending HR Review
                              </span>
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface border border-border text-text-muted">
                                {app.type}
                              </span>
                            </div>
                            <p className="text-xs text-text-muted mt-1 leading-relaxed italic">
                              &quot;{app.note}&quot;
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg">
                              {app.hoursPerWeek} hrs/week requested
                            </span>
                            <div className="text-[11px] text-text-muted mt-1">Submitted: {app.appliedAt}</div>
                          </div>
                        </div>
                        <div className="rounded-lg border border-amber-500/20 bg-surface/80 p-2 text-xs text-text-muted flex items-center gap-2">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span>This application has been submitted to HR administrators and is awaiting review and team capacity approval.</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-text-muted">
                      No applications currently pending HR review. All submitted gigs have been processed.
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3.5">
                  {myActiveProjects
                    .filter(proj => {
                      if (projectSubFilter === 'assigned') return proj.isAssigned !== false;
                      if (projectSubFilter === 'approved') return proj.isHrApproved;
                      return true;
                    })
                    .map(proj => (
                      <div
                        key={proj.projectId}
                        className="rounded-xl border border-border bg-surface-alt/60 hover:bg-surface-alt hover:border-teal-500/30 p-4 transition-all shadow-2xs space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h4 className="font-bold text-sm text-text-primary">{proj.projectName}</h4>
                              {proj.isHrApproved ? (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-500" /> HR Approved &amp; Assigned
                                </span>
                              ) : (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/25 flex items-center gap-1">
                                  <Building2 className="w-3 h-3 text-teal-500" /> Active Core Project
                                </span>
                              )}
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface border border-border text-text-muted">
                                {proj.domain}
                              </span>
                            </div>
                            <p className="text-xs text-text-muted mt-1 leading-relaxed">
                              {proj.contributionSummary}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-xs font-bold text-teal-700 dark:text-teal-300 bg-teal-500/10 border border-teal-500/20 px-2.5 py-1 rounded-lg">
                              {proj.hoursPerWeek} hrs/week
                            </span>
                            <div className="text-[11px] text-text-muted mt-1 font-medium">Role: {proj.role}</div>
                          </div>
                        </div>

                        {proj.approvalNote && (
                          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-800 dark:text-emerald-200 flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span><strong>HR Approval Note:</strong> &quot;{proj.approvalNote}&quot;</span>
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-2 border-t border-border/50 text-[11px] text-text-muted flex-wrap gap-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-text-primary">Tech Stack:</span>
                            {proj.technologies.map((t, idx) => (
                              <span key={idx} className="bg-surface border border-border px-2 py-0.5 rounded-md font-mono text-[10px] text-text-primary">
                                {t}
                              </span>
                            ))}
                          </div>
                          {proj.startDate && proj.endDate && (
                            <span>Timeline: {proj.startDate} – {proj.endDate}</span>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* Career Pathway Readiness Breakdown */}
            {selectedAmbitionRole && ambitionAnalysis && (
              <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-600 uppercase tracking-wider">
                      Career Pathway Analysis
                    </span>
                    <h3 className="text-base font-bold text-text-primary mt-1 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-teal-500" /> Pathway to {selectedAmbitionRole.title}
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (ambitionAnalysis?.gaps && ambitionAnalysis.gaps.length > 0) {
                        setBridgeGapsFilter(ambitionAnalysis.gaps.map(g => g.skillName));
                        setCourseSearchQuery('');
                      }
                      setActiveSubTab('courses');
                    }}
                    className="text-xs font-semibold text-teal-600 hover:underline flex items-center gap-1 self-start sm:self-auto cursor-pointer"
                  >
                    Bridge Skill Gaps <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Breakdown items */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {ambitionAnalysis.breakdown.map((item, idx) => {
                    const isMet = item.credit >= 0.8;
                    return (
                      <div
                        key={idx}
                        className={`rounded-xl border p-3.5 space-y-2 transition-all ${
                          isMet
                            ? 'border-emerald-500/30 bg-emerald-500/5'
                            : 'border-amber-500/30 bg-amber-500/5'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="text-xs font-bold text-text-primary">{item.skillName}</h4>
                            <span className="text-[11px] text-text-muted">Target: {item.requiredLevel}</span>
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isMet
                              ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                              : 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                          }`}>
                            {isMet ? 'Skill Met' : 'Gap to Close'}
                          </span>
                        </div>
                        <div className="flex justify-between text-[11px] text-text-muted pt-1 border-t border-border/40">
                          <span>Current: <strong className="text-text-primary">{item.currentLevel}</strong></span>
                          <span>Credit: <strong className="text-text-primary">{Math.round(item.credit * 100)}%</strong></span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Primary Skills */}
            <div className="rounded-2xl border border-border bg-surface p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-teal-500" /> Top Skills &amp; Competencies
                  </h3>
                  <p className="text-xs text-text-muted mt-0.5">Backed by repository commits, PR reviews, and peer feedback</p>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveSubTab('skills')}
                  className="text-xs font-semibold text-teal-600 hover:underline flex items-center gap-1"
                >
                  View all ({currentEmployee.skills.length}) <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {primarySkills.slice(0, 4).map(skill => {
                  return (
                    <div
                      key={skill.skillId}
                      className="group rounded-xl border border-border bg-surface-alt hover:border-teal-500/40 p-4 transition-all shadow-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="font-bold text-sm text-text-primary group-hover:text-teal-600 transition-colors">
                            {skill.skillName}
                          </h4>
                          <span className="text-[11px] text-text-muted">{skill.category}</span>
                        </div>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-600 border border-teal-500/20">
                          {skill.proficiencyLevel}
                        </span>
                      </div>

                      <div className="mt-3 flex items-center justify-between text-xs">
                        <span className="text-text-muted">Logged Artifacts:</span>
                        <span className="font-bold text-text-primary">{skill.evidenceList.length} artifacts</span>
                      </div>

                      {/* Skill Level Bar */}
                      <div className="mt-2 h-2 w-full rounded-full bg-border/70 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full transition-all duration-300"
                          style={{ width: `${Math.min(100, skill.proficiencyScore)}%` }}
                        />
                      </div>

                      {/* Claimed vs Evidenced Neutral Display */}
                      <div className="mt-2 pt-1 border-t border-border/40 flex items-center justify-between text-[11px] text-text-muted">
                        <span>Claimed: <strong className="text-text-primary">{skill.claimedLevel || 'Self-declared'}</strong></span>
                        <span>Evidenced: <strong className="text-teal-600 dark:text-teal-400 font-semibold">{skill.proficiencyLevel}</strong></span>
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setExplanationSkill({ id: skill.skillId, name: skill.skillName })}
                          className="rounded-lg border border-teal-500/30 bg-teal-500/10 px-2.5 py-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300 hover:bg-teal-500/20 transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
                          title="Why is my level this? View deterministic scoring engine breakdown"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-teal-500" /> Why Level?
                        </button>
                        <button
                          type="button"
                          onClick={() => onInspectEvidence(currentEmployee, skill.skillName)}
                          className="flex-1 rounded-lg border border-border bg-surface py-1.5 text-xs font-semibold text-text-primary hover:border-teal-500 hover:text-teal-600 transition-colors flex items-center justify-center gap-1 shadow-2xs cursor-pointer"
                        >
                          <ShieldCheck className="w-3.5 h-3.5 text-teal-500" /> Proofs
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEvidenceTargetSkill(skill.skillName);
                            setShowSubmitEvidenceModal(true);
                          }}
                          className="rounded-lg border border-teal-500/30 bg-teal-500/10 px-2.5 py-1.5 text-xs font-semibold text-teal-700 dark:text-teal-300 hover:bg-teal-500/20 transition-colors flex items-center gap-1 cursor-pointer"
                          title="Add new proof for this skill"
                        >
                          <Plus className="w-3.5 h-3.5" /> Add Proof
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Past Key Projects & Certifications */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs space-y-3">
                <h4 className="text-sm font-bold text-text-primary flex items-center gap-2">
                  <FolderGit2 className="w-4 h-4 text-teal-500" /> Key Company Projects
                </h4>
                <ul className="space-y-2">
                  {currentEmployee.topProjects.map((proj, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-xs text-text-muted">
                      <div className="h-1.5 w-1.5 rounded-full bg-teal-500 shrink-0" />
                      <span className="truncate text-text-primary font-medium">{proj}</span>
                    </li>
                  ))}
                  {currentEmployee.topProjects.length === 0 && (
                    <li className="text-xs text-text-muted italic">No key projects recorded yet.</li>
                  )}
                </ul>
              </div>

              <div className="rounded-2xl border border-border bg-surface p-5 shadow-xs space-y-3">
                <h4 className="text-sm font-bold text-text-primary flex items-center gap-2">
                  <Award className="w-4 h-4 text-amber-500" /> Active Certifications
                </h4>
                <ul className="space-y-2">
                  {currentEmployee.certifications.length > 0 ? (
                    currentEmployee.certifications.map((cert, idx) => (
                      <li key={idx} className="flex items-center gap-2 text-xs text-text-muted">
                        <div className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                        <span className="truncate text-text-primary font-medium">{cert}</span>
                      </li>
                    ))
                  ) : (
                    <li className="text-xs text-text-muted italic">No external certifications recorded yet.</li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SubTab: My Projects & Active Allocations ────────────────── */}
      {activeSubTab === 'projects' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-text-primary flex items-center gap-2">
                <FolderGit2 className="w-5 h-5 text-purple-500" />
                My Projects &amp; Initiative Allocations
              </h3>
              <p className="text-xs text-text-muted mt-0.5">
                Track what projects you are actively working on, review HR approvals &amp; decision notes, and monitor pending project applications.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveSubTab('opportunities')}
              className="rounded-xl px-4 py-2 text-xs font-semibold flex items-center gap-1.5 self-start bg-teal-600 hover:bg-teal-700 text-white transition-all shadow-xs cursor-pointer"
            >
              Browse Marketplace Gigs <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-border bg-surface p-4 space-y-1 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-text-muted">Active Projects</span>
                <FolderGit2 className="w-4 h-4 text-teal-500" />
              </div>
              <div className="text-xl font-bold font-mono text-text-primary">{myActiveProjects.length}</div>
              <p className="text-[11px] text-text-muted">Core team initiatives &amp; gigs</p>
            </div>

            <div className="rounded-2xl border border-purple-500/30 bg-purple-500/5 p-4 space-y-1 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-purple-700 dark:text-purple-300">HR Approved</span>
                <CheckCircle2 className="w-4 h-4 text-purple-500" />
              </div>
              <div className="text-xl font-bold font-mono text-purple-600 dark:text-purple-400">
                {myActiveProjects.filter(p => p.isHrApproved).length}
              </div>
              <p className="text-[11px] text-text-muted">Marketplace gigs accepted</p>
            </div>

            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-1 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">Pending Review</span>
                <Clock className="w-4 h-4 text-amber-500" />
              </div>
              <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400">
                {myPendingApplications.length}
              </div>
              <p className="text-[11px] text-text-muted">Awaiting HR review</p>
            </div>

            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-1 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Available Bandwidth</span>
                <Building2 className="w-4 h-4 text-emerald-500" />
              </div>
              <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                {hoursPerWeekFree} hrs/wk
              </div>
              <p className="text-[11px] text-text-muted">Out of 40h standard workload</p>
            </div>
          </div>

          {/* Workload Capacity Allocation Bar */}
          <div className="rounded-2xl border border-border bg-surface p-5 space-y-3 shadow-xs">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-text-primary flex items-center gap-1.5">
                <Clock className="w-4 h-4 text-teal-500" /> Weekly Bandwidth Allocation
              </span>
              <span className="font-bold text-text-primary">
                {myActiveProjects.reduce((s, p) => s + p.hoursPerWeek, 0)} hrs committed / 40 hrs total ({hoursPerWeekFree} hrs free)
              </span>
            </div>
            <div className="h-3.5 w-full rounded-full bg-border overflow-hidden flex">
              {myActiveProjects.map((p, idx) => {
                const pct = (p.hoursPerWeek / 40) * 100;
                const colors = ['bg-teal-500', 'bg-purple-500', 'bg-blue-500', 'bg-emerald-500'];
                return (
                  <div
                    key={p.projectId}
                    style={{ width: `${pct}%` }}
                    className={`${colors[idx % colors.length]} h-full transition-all`}
                    title={`${p.projectName}: ${p.hoursPerWeek} hrs/wk`}
                  />
                );
              })}
            </div>
            <div className="flex items-center gap-4 text-xs text-text-muted flex-wrap pt-1">
              {myActiveProjects.map((p, idx) => {
                const dots = ['bg-teal-500', 'bg-purple-500', 'bg-blue-500', 'bg-emerald-500'];
                return (
                  <div key={p.projectId} className="flex items-center gap-1.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${dots[idx % dots.length]}`} />
                    <span className="font-medium text-text-primary">{p.projectName}</span>
                    <span className="text-text-muted">({p.hoursPerWeek}h/wk)</span>
                  </div>
                );
              })}
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="w-2.5 h-2.5 rounded-full bg-border" />
                <span className="font-medium text-emerald-600 dark:text-emerald-400">Available: {hoursPerWeekFree}h</span>
              </div>
            </div>
          </div>

          {/* Sub-Filters */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {[
              { id: 'all', label: `All Items (${myActiveProjects.length + myPendingApplications.length})` },
              { id: 'assigned', label: `🎯 Assigned Projects (${myAssignedProjects.length})` },
              { id: 'working_on', label: `⚡ Currently Working On (${myActiveProjects.length})` },
              { id: 'approved', label: `✅ HR Approved Gigs (${myActiveProjects.filter(p => p.isHrApproved).length})` },
              { id: 'pending', label: `⏳ Pending HR Review (${myPendingApplications.length})` },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setProjectSubFilter(tab.id as typeof projectSubFilter)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  projectSubFilter === tab.id
                    ? 'bg-purple-600 text-white shadow-2xs font-bold'
                    : 'bg-surface border border-border text-text-muted hover:text-text-primary hover:bg-surface-alt'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Projects & Applications Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 1. Active & Approved Projects */}
            {(projectSubFilter === 'all' || projectSubFilter === 'working_on' || projectSubFilter === 'assigned' || projectSubFilter === 'approved') &&
              myActiveProjects
                .filter(p => {
                  if (projectSubFilter === 'assigned') return p.isAssigned !== false;
                  if (projectSubFilter === 'approved') return p.isHrApproved;
                  return true;
                })
                .map(proj => (
                  <div
                    key={proj.projectId}
                    className="rounded-2xl border border-border bg-surface p-5 space-y-4 hover:border-purple-500/40 transition-colors shadow-xs flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            {proj.isHrApproved ? (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-500" /> HR Approved Gig
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/25 flex items-center gap-1">
                                <Building2 className="w-3 h-3 text-teal-500" /> Active Core Project
                              </span>
                            )}
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface-alt border border-border text-text-muted">
                              {proj.domain}
                            </span>
                          </div>
                          <h4 className="font-bold text-base text-text-primary mt-1.5">{proj.projectName}</h4>
                          <p className="text-xs text-text-muted font-medium">Role: {proj.role}</p>
                        </div>
                        <span className="text-xs font-bold text-purple-700 dark:text-purple-300 bg-purple-500/10 border border-purple-500/20 px-2.5 py-1 rounded-lg shrink-0">
                          {proj.hoursPerWeek} hrs/week
                        </span>
                      </div>

                      <p className="text-xs text-text-muted leading-relaxed">
                        {proj.contributionSummary}
                      </p>

                      {proj.approvalNote && (
                        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-200 flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                          <div>
                            <strong>HR Approval Note:</strong>
                            <p className="mt-0.5 italic">&quot;{proj.approvalNote}&quot;</p>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-1 pt-1">
                        {proj.technologies.map((tech, idx) => (
                          <span
                            key={idx}
                            className="text-[10px] font-semibold bg-surface-alt border border-border px-2 py-0.5 rounded-md text-text-primary"
                          >
                            {tech}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-border/60 text-xs text-text-muted">
                      {proj.startDate && proj.endDate ? (
                        <span>Timeline: {proj.startDate} – {proj.endDate}</span>
                      ) : (
                        <span>Status: Active &amp; ongoing</span>
                      )}
                      <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> Allocated
                      </span>
                    </div>
                  </div>
                ))}

            {/* 2. Pending Applications */}
            {(projectSubFilter === 'all' || projectSubFilter === 'pending') &&
              myPendingApplications.map(app => (
                <div
                  key={app.applicationId}
                  className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-5 space-y-4 shadow-xs flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-amber-500" /> Pending HR Review
                          </span>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface border border-border text-text-muted">
                            {app.type}
                          </span>
                        </div>
                        <h4 className="font-bold text-base text-text-primary mt-1.5">{app.title}</h4>
                      </div>
                      <span className="text-xs font-bold text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg shrink-0">
                        {app.hoursPerWeek} hrs/week requested
                      </span>
                    </div>

                    <p className="text-xs text-text-muted leading-relaxed italic">
                      &quot;{app.note}&quot;
                    </p>

                    <div className="rounded-xl border border-amber-500/20 bg-surface/80 p-3 text-xs text-text-muted flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
                      <span>This application has been submitted to HR administrators and is awaiting review and team capacity approval.</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-border/60 text-xs text-text-muted">
                    <span>Submitted: {app.appliedAt}</span>
                    <button
                      type="button"
                      onClick={() => handleWithdrawApplication(app.targetId)}
                      className="text-xs font-semibold text-red-500 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Withdraw
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ── SubTab 2: My Skills ───────────────────────────────────── */}
      {activeSubTab === 'skills' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-text-primary">Skills &amp; Evidence Portfolio</h3>
              <p className="text-xs text-text-muted">
                Evaluated dynamically based on repository commits, PR reviews, verified certificates, and peer endorsements.
              </p>
            </div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={onOpenEditProfile}
                className="rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-text-primary hover:border-teal-500 flex items-center gap-1.5 shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5 text-teal-500" /> Add New Skill
              </button>
              <button
                type="button"
                onClick={() => {
                  setEvidenceTargetSkill('');
                  setShowSubmitEvidenceModal(true);
                }}
                className="rounded-xl px-3.5 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 flex items-center gap-1.5 shadow-xs"
              >
                <ShieldCheck className="w-3.5 h-3.5" /> Submit Proof / Evidence
              </button>
            </div>
          </div>

          {/* Search & Category Filter Pills */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {skillCategories.map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSkillCategoryFilter(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${
                    skillCategoryFilter === cat
                      ? 'bg-teal-600 text-white shadow-2xs'
                      : 'bg-surface border border-border text-text-muted hover:text-text-primary hover:bg-surface-alt'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="relative shrink-0 sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                placeholder="Search skills..."
                value={skillSearchQuery}
                onChange={e => setSkillSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface pl-8 pr-3 py-1.5 text-xs text-text-primary focus:border-teal-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Skills Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSkills.map(skill => {
              const activeSkillEvidence = (skill.evidenceList || []).filter((e: any) => !deletedEvidenceIds.has(e.id || e.evidenceId));
              return (
                <div
                  key={skill.skillId}
                  className="rounded-2xl border border-border bg-surface p-5 flex flex-col justify-between hover:shadow-md transition-shadow space-y-4"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="font-bold text-base text-text-primary">{skill.skillName}</h4>
                          {(skill.verified || skill.verificationStatus === 'Verified by HR' || activeSkillEvidence.some(e => e.verified || e.verificationStatus === 'Verified by HR')) && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 flex items-center gap-1 shadow-2xs">
                              <CheckCircle2 className="w-3 h-3 text-emerald-500" /> Verified by HR
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-text-muted">{skill.category}</span>
                      </div>
                      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-teal-500/10 text-teal-600 border border-teal-500/20">
                        {skill.proficiencyLevel}
                      </span>
                    </div>

                    <div className="mt-4 space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-text-muted">Proficiency Score</span>
                        <span className="font-bold text-text-primary font-mono">{skill.proficiencyScore} / 100</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-border/70 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full"
                          style={{ width: `${Math.min(100, skill.proficiencyScore)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[11px] text-text-muted pt-1">
                        <span>Confidence: <strong className="text-text-primary">{skill.confidenceScore}%</strong></span>
                        <span>Last used: <strong className="text-text-primary">{skill.lastUsedDate || 'Active'}</strong></span>
                      </div>
                      <div className="flex justify-between text-[11px] text-text-muted pt-1 border-t border-border/40">
                        <span>Claimed: <strong className="text-text-primary">{skill.claimedLevel || 'Self-declared'}</strong></span>
                        <span>Evidenced: <strong className="text-teal-600 dark:text-teal-400 font-semibold">{skill.proficiencyLevel}</strong></span>
                      </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-border bg-surface-alt p-3 text-xs space-y-1">
                      <div className="font-semibold text-text-primary flex items-center justify-between">
                        <span className="flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-teal-500" /> Evidence Logs
                        </span>
                        {activeSkillEvidence.some(e => e.verified || e.verificationStatus === 'Verified by HR') && (
                          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                            {activeSkillEvidence.filter(e => e.verified || e.verificationStatus === 'Verified by HR').length} Verified
                          </span>
                        )}
                      </div>
                      <p className="text-text-muted">
                        {activeSkillEvidence.length} evidence artifact{activeSkillEvidence.length === 1 ? '' : 's'} recorded in audit log.
                        {activeSkillEvidence.some(e => e.verified || e.verificationStatus === 'Verified by HR') ? ' Verified proofs applied with 100% weight.' : ''}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1 border-t border-border/60">
                    <button
                      type="button"
                      onClick={() => setExplanationSkill({ id: skill.skillId, name: skill.skillName })}
                      className="rounded-xl border border-teal-500/30 bg-teal-500/10 px-3 py-2 text-xs font-semibold text-teal-700 dark:text-teal-300 hover:bg-teal-500/20 transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                      title="Why is my level this? View deterministic scoring breakdown"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-teal-500" /> Why Level?
                    </button>
                    <button
                      type="button"
                      onClick={() => onInspectEvidence(currentEmployee, skill.skillName)}
                      className="flex-1 rounded-xl py-2 text-xs font-semibold flex items-center justify-center gap-1.5 border border-border bg-surface hover:border-teal-500 hover:text-teal-600 transition-colors cursor-pointer"
                    >
                      <ShieldCheck className="w-3.5 h-3.5 text-teal-500" /> Inspect
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEvidenceTargetSkill(skill.skillName);
                        setShowSubmitEvidenceModal(true);
                      }}
                      className="rounded-xl border border-border bg-surface px-3 py-2 text-xs font-semibold text-text-primary hover:border-teal-500 hover:text-teal-600 transition-colors flex items-center gap-1 cursor-pointer"
                      title="Submit new proof for this skill"
                    >
                      <Plus className="w-3.5 h-3.5" /> Proof
                    </button>
                    {/* Evidence artifacts listed with delete (§2.3) */}
                    {activeSkillEvidence.length > 0 && activeSkillEvidence.slice(0, 1).map((ev: any) => (
                      <button
                        key={ev.id || ev.evidenceId}
                        type="button"
                        onClick={() => handleDeleteEvidence(ev.id || ev.evidenceId, ev.title || ev.description || 'proof')}
                        disabled={deletingEvidenceId === (ev.id || ev.evidenceId)}
                        className="rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 px-2 py-2 text-xs font-semibold text-red-600 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                        title="Delete this proof (10s undo available)"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {filteredSkills.length === 0 && (
              <div className="col-span-full rounded-2xl border border-dashed border-border p-8 text-center text-xs text-text-muted">
                No skills matching &quot;{skillSearchQuery}&quot; found in category &quot;{skillCategoryFilter}&quot;.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SubTab 3: Learning & Upskilling ────────────────────────── */}
      {activeSubTab === 'courses' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-text-primary">Interactive Upskilling &amp; Courses</h3>
              <p className="text-xs text-text-muted">
                Track assigned courses, update completion progress, and enroll in gap-closing learning tracks.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowSuggestModal(true)}
                className="rounded-xl border border-teal-500/30 bg-teal-500/10 hover:bg-teal-500/20 px-3.5 py-2 text-xs font-bold text-teal-700 dark:text-teal-300 flex items-center gap-1.5 transition-colors shadow-2xs"
              >
                <Sparkles className="w-3.5 h-3.5 text-teal-500" /> Suggest Course
              </button>
              <button
                type="button"
                onClick={onOpenUpskilling}
                className="rounded-xl px-4 py-2 text-xs font-semibold flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white transition-all shadow-xs"
              >
                Full Upskilling Hub <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {[
                { id: 'all', label: 'All Courses' },
                { id: 'enrolled', label: `My Enrolled (${employeeProgress.length})` },
                { id: 'recommended', label: 'Recommended Catalog' }
              ].map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setCourseFilter(f.id as typeof courseFilter)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    courseFilter === f.id
                      ? 'bg-teal-600 text-white shadow-2xs'
                      : 'bg-surface border border-border text-text-muted hover:text-text-primary hover:bg-surface-alt'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="relative shrink-0 sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                placeholder="Search courses..."
                value={courseSearchQuery}
                onChange={e => setCourseSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface pl-8 pr-3 py-1.5 text-xs text-text-primary focus:border-teal-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Bridge Gaps Active Filter Notice */}
          {bridgeGapsFilter.length > 0 && (
            <div className="rounded-xl border border-teal-500/30 bg-teal-500/10 p-3.5 flex items-center justify-between text-xs text-teal-900 dark:text-teal-200 shadow-2xs">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-teal-600 shrink-0" />
                <span>
                  Filtering courses for target role gaps: <strong>{bridgeGapsFilter.join(', ')}</strong>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setBridgeGapsFilter([])}
                className="text-xs font-bold text-teal-700 dark:text-teal-300 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" /> Clear Filter
              </button>
            </div>
          )}

          {/* 1. Active Enrolled Courses Section */}
          {(courseFilter === 'all' || courseFilter === 'enrolled') && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-text-primary flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-teal-500" /> Active Enrolled Courses ({employeeProgress.length})
                </h4>
              </div>

              {employeeProgress.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {employeeProgress
                    .filter(prog => {
                      const res = resources.find(r => r.resource_id === prog.resource_id);
                      if (bridgeGapsFilter.length > 0) {
                        const matchesGap = bridgeGapsFilter.some(gap => {
                          const g = gap.toLowerCase();
                          return (res && res.title.toLowerCase().includes(g)) || (res?.skill_id && res.skill_id.toLowerCase().includes(g));
                        });
                        if (!matchesGap) return false;
                      }
                      if (!courseSearchQuery.trim()) return true;
                      const q = courseSearchQuery.toLowerCase();
                      return (res?.title.toLowerCase().includes(q) || res?.provider.toLowerCase().includes(q));
                    })
                    .map(prog => {
                      const resource = resources.find(r => r.resource_id === prog.resource_id);
                      const role = availableRoles.find(r => r.id === prog.role_id);
                      const rawPct = Number(prog.progress_percent || 0);
                      const totalHours = (resource as any)?.estimated_hours ? Number((resource as any).estimated_hours) : 16;
                      const hoursLogged = Number((prog as any).hours_logged || 0);
                      const isHoursMet = (hoursLogged >= totalHours && totalHours > 0) || rawPct >= 99;
                      const pct = isHoursMet ? 100 : rawPct;
                      const isDone = rawPct === 100 || prog.status === 'Done';
                      const isAwaiting = prog.status === 'Awaiting approval';

                      return (
                        <div
                          key={`${prog.role_id}-${prog.resource_id}`}
                          className={`rounded-2xl border p-5 space-y-4 shadow-xs transition-all ${
                            isDone || isHoursMet ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border bg-surface'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-600 border border-teal-500/20">
                                {role?.title || 'Target Ambition'}
                              </span>
                              <h4 className="font-bold text-sm text-text-primary mt-1.5">
                                {resource?.title || prog.resource_id}
                              </h4>
                            </div>
                            <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${
                              isDone
                                ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                                : isAwaiting
                                ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                                : isHoursMet
                                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                                : pct > 0
                                ? 'bg-teal-500/20 text-teal-700 dark:text-teal-300 border border-teal-500/30'
                                : 'bg-surface-alt text-text-muted border border-border'
                            }`}>
                              {isDone ? (
                                <>
                                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                  Verified by HR • Completed
                                </>
                              ) : isAwaiting ? (
                                <>
                                  <Clock className="w-3 h-3 text-amber-500" />
                                  Awaiting HR Verification (100%)
                                </>
                              ) : isHoursMet ? (
                                <>
                                  <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                                  100% Hours Met • Ready for Review
                                </>
                              ) : (
                                prog.status || (pct > 0 ? 'In progress' : 'Not started')
                              )}
                            </span>
                          </div>

                          {isDone && (
                            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-2.5 flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-200">
                              <GraduationCap className="w-4 h-4 text-emerald-600 shrink-0" />
                              <span>HR has verified completion of this course. Full certificate credited &amp; level advancement unlocked!</span>
                            </div>
                          )}

                          {isAwaiting && (
                            <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 p-2.5 flex items-center gap-2 text-xs text-amber-800 dark:text-amber-200">
                              <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                              <span>Completion proof submitted! Awaiting administrator review to finalize certification.</span>
                            </div>
                          )}

                          {/* Hours-based Progress Bar & Actions */}
                          <div className="space-y-2">
                            <div className="flex justify-between text-xs">
                              <span className="text-text-muted">Learning Progress:</span>
                              <span className="font-bold text-text-primary font-mono">{pct}%</span>
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
                                style={{ width: `${Math.min(100, pct)}%` }}
                              />
                            </div>

                            {/* Action Buttons: Log Hours, Request Completion, Drop */}
                            <div className="pt-2 flex items-center justify-between gap-2 flex-wrap">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setLogHoursTarget({
                                    resourceId: prog.resource_id,
                                    courseTitle: resource?.title || prog.resource_id,
                                    roleId: prog.role_id,
                                    currentHours: hoursLogged || Math.round((pct / 100) * totalHours),
                                    totalHours: totalHours
                                  })}
                                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white flex items-center gap-1.5 transition-all shadow-xs"
                                >
                                  <Clock className="w-3.5 h-3.5" /> Log Hours
                                </button>

                                {!isDone && prog.status !== 'Awaiting approval' && (
                                  <button
                                    type="button"
                                    onClick={() => setCompletionTarget({
                                      resourceId: prog.resource_id,
                                      courseTitle: resource?.title || prog.resource_id,
                                      roleId: prog.role_id
                                    })}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-all shadow-xs ${
                                      isHoursMet
                                        ? 'border-emerald-500 bg-emerald-600 hover:bg-emerald-700 text-white'
                                        : 'border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300'
                                    }`}
                                  >
                                    <Award className="w-3.5 h-3.5" /> {isHoursMet ? '✨ Request Completion (100% Met)' : 'Request Completion'}
                                  </button>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() => handleUnenrollCourse(prog.resource_id)}
                                className="text-xs text-text-muted hover:text-red-500 transition-colors ml-auto"
                                title="Drop course without deleting logged hours"
                              >
                                Drop Course
                              </button>
                            </div>
                          </div>

                          {resource && (
                            <div className="flex items-center justify-between text-xs text-text-muted pt-2 border-t border-border/60">
                              <span>Provider: <strong className="text-text-primary">{resource.provider}</strong></span>
                              <span>Duration: <strong className="text-text-primary">{resource.duration_weeks} wks</strong></span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border bg-surface p-6 text-center text-xs text-text-muted">
                  No courses enrolled yet. Browse the catalog below to enroll in your first skill course!
                </div>
              )}
            </div>
          )}

          {/* 2. Recommended Catalog Section */}
          {(courseFilter === 'all' || courseFilter === 'recommended') && (
            <div className="space-y-4 pt-4">
              <h4 className="text-sm font-bold text-text-primary flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-teal-500" /> Recommended Available Courses ({resources.length})
              </h4>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {resources
                  .filter(res => {
                    if (bridgeGapsFilter.length > 0) {
                      const matchesGap = bridgeGapsFilter.some(gap => {
                        const g = gap.toLowerCase();
                        return res.title.toLowerCase().includes(g) || (res.skill_id && res.skill_id.toLowerCase().includes(g));
                      });
                      if (!matchesGap) return false;
                    }
                    if (!courseSearchQuery.trim()) return true;
                    const q = courseSearchQuery.toLowerCase();
                    return res.title.toLowerCase().includes(q) || res.provider.toLowerCase().includes(q);
                  })
                  .map(resource => {
                    const isEnrolled = employeeProgress.some(p => p.resource_id === resource.resource_id);

                    return (
                      <div
                        key={resource.resource_id}
                        className="rounded-2xl border border-border bg-surface p-5 flex flex-col justify-between hover:border-teal-500/40 transition-colors shadow-xs space-y-4"
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-600 border border-teal-500/20">
                              {resource.provider}
                            </span>
                            <span className="text-[10px] font-bold text-text-muted">
                              {resource.duration_weeks} Weeks
                            </span>
                          </div>
                          <h4 className="font-bold text-sm text-text-primary mt-1">
                            {resource.title}
                          </h4>
                          <p className="text-xs text-text-muted">
                            Target Level: <strong className="text-text-primary">{resource.target_level}</strong>
                          </p>
                        </div>

                        <div className="pt-2 border-t border-border/60">
                          {isEnrolled ? (
                            <span className="w-full py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Enrolled in Plan
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleEnrollCourse(resource.resource_id)}
                              className="w-full py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white transition-all shadow-xs"
                            >
                              <Plus className="w-3.5 h-3.5" /> Enroll in Course
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SubTab 4: Internal Opportunities & Gigs ────────────────── */}
      {activeSubTab === 'opportunities' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-text-primary">Internal Mobility &amp; Project Gigs</h3>
              <p className="text-xs text-text-muted">
                Discover cross-functional project initiatives and full-time role transfers matching your evaluated skills &amp; experience.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenOpportunities}
              className="rounded-xl px-4 py-2 text-xs font-semibold flex items-center gap-1.5 self-start bg-teal-600 hover:bg-teal-700 text-white transition-all shadow-xs"
            >
              Full Marketplace <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Sub Filters */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {[
              { id: 'all', label: `All Opportunities (${allOpportunities.length})` },
              { id: 'projects', label: `Project Gigs (${projectGigs.length})` },
              { id: 'roles', label: `Open Career Roles (${matchedRoleOpportunities.length})` },
              { id: 'applied', label: `My Applications (${myAppliedSet.size})` },
              { id: 'approved', label: `Approved Projects (${myActiveProjects.filter(p => p.isHrApproved).length})` },
            ].map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setOpportunityFilter(f.id as typeof opportunityFilter)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  opportunityFilter === f.id
                    ? 'bg-teal-600 text-white shadow-2xs'
                    : 'bg-surface border border-border text-text-muted hover:text-text-primary hover:bg-surface-alt'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Opportunities Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredOpportunities.map(opp => {
              const isApplied = myAppliedSet.has(opp.id);
              const appData = applications.find(a => a.opportunity_id === opp.id && (a.employee_id === currentEmployee.id || a.employee_id.includes(currentEmployee.id)) && a.status !== 'Withdrawn');

              return (
                <div
                  key={opp.id}
                  onClick={() => {
                    if (!isApplied) {
                      setApplyModalOpportunity(opp);
                    }
                  }}
                  className={`rounded-2xl border border-border bg-surface p-5 space-y-4 hover:border-teal-500/40 transition-colors shadow-xs flex flex-col justify-between ${!isApplied ? 'cursor-pointer hover:shadow-md' : ''}`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-600 border border-teal-500/20">
                            {opp.type === 'project' ? 'Project Gig' : 'Career Role'}
                          </span>
                          <span className="text-2xs font-bold text-teal-600 dark:text-teal-400 font-mono">
                            {opp.matchScore}% Match
                          </span>
                          {opp.skill_breakdown && opp.skill_breakdown.length > 0 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setBreakdownOpportunity(opp);
                              }}
                              className="text-[10px] underline text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300 font-semibold transition-colors cursor-pointer"
                              title="View deterministic match breakdown"
                            >
                              Why {opp.matchScore}%?
                            </button>
                          )}
                        </div>
                        <h4 className="font-bold text-base text-text-primary mt-1.5">{opp.name || (opp as any).title}</h4>
                        <p className="text-xs text-text-muted">{opp.department}</p>
                      </div>
                      <span className="text-xs font-bold text-text-muted bg-surface-alt px-2.5 py-1 rounded-lg border border-border shrink-0">
                        {opp.commitment || `${(opp as any).hours_per_week || 10} hrs/wk`}
                      </span>
                    </div>

                    <p className="text-xs text-text-muted line-clamp-2 leading-relaxed">
                      {opp.description}
                    </p>

                    {opp.technologies && (
                      <div className="flex flex-wrap gap-1 pt-1">
                        {(Array.isArray(opp.technologies)
                          ? opp.technologies
                          : String(opp.technologies).split('|').filter(Boolean)
                        ).map((tech: string, idx: number) => (
                          <span
                            key={idx}
                            className="text-[10px] font-semibold bg-surface-alt border border-border px-2 py-0.5 rounded-md text-text-primary"
                          >
                            {tech}
                          </span>
                        ))}
                      </div>
                    )}

                    {isApplied && appData && (
                      <div className={`rounded-xl border p-3 text-xs space-y-1.5 ${
                        appData.status === 'Accepted'
                          ? 'border-emerald-500/40 bg-emerald-500/15'
                          : 'border-teal-500/30 bg-teal-500/10'
                      }`}>
                        <div className="flex items-center justify-between font-bold text-emerald-700 dark:text-emerald-300">
                          <span className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            {appData.status === 'Accepted' ? 'Accepted by HR • Joined Team' : 'Application Active'}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            appData.status === 'Accepted'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-teal-500/20 text-teal-700 dark:text-teal-300'
                          }`}>
                            {appData.status}
                          </span>
                        </div>
                        {appData.hr_decision_note && (
                          <p className="text-emerald-800 dark:text-emerald-200 text-[11px] font-semibold">
                            HR Decision Note: &quot;{appData.hr_decision_note}&quot;
                          </p>
                        )}
                        <p className="text-text-muted text-[11px] line-clamp-1 italic">
                          &quot;{appData.note}&quot;
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-border/60">
                    {isApplied ? (
                      <>
                        <button
                          type="button"
                          disabled
                          className={`flex-1 rounded-xl py-2 text-xs font-bold flex items-center justify-center gap-1.5 ${
                            appData?.status === 'Accepted'
                              ? 'bg-emerald-600 text-white shadow-xs'
                              : 'bg-teal-600 text-white opacity-90'
                          }`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {appData?.status === 'Accepted' ? 'Accepted • Active Team Member' : 'Applied'}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleWithdrawApplication(opp.id);
                          }}
                          className="rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 px-3 py-2 text-xs font-semibold text-red-600 transition-colors flex items-center gap-1 cursor-pointer"
                          title="Withdraw application"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setApplyModalOpportunity(opp);
                        }}
                        className="flex-1 rounded-xl py-2 text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" /> Express Interest / Apply
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {filteredOpportunities.length === 0 && (
              <div className="col-span-full rounded-2xl border border-dashed border-border bg-surface p-8 text-center text-xs text-text-muted">
                No opportunities found in this category.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SubTab 6: Notifications & Activity Feed ──────────────── */}
      {activeSubTab === 'notifications' && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Header Banner */}
          <div className="rounded-3xl border border-amber-500/20 bg-gradient-to-r from-amber-500/10 via-surface to-amber-500/5 p-6 sm:p-7 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                  <Bell className="w-3.5 h-3.5" /> Notifications &amp; Activity Log
                </span>
                <h3 className="text-xl font-bold text-text-primary">Personal Decision &amp; Assignment Updates</h3>
                <p className="text-xs text-text-muted max-w-2xl leading-relaxed">
                  Real-time record of all your project staffings, gig applications (approved or declined), upskilling course verifications, and skill evidence reviews.
                </p>
              </div>

              <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
                <button
                  type="button"
                  onClick={markAllNotificationsAsRead}
                  disabled={unreadCount === 0}
                  className="rounded-xl px-3.5 py-2 text-xs font-bold border border-border bg-surface hover:bg-surface-alt disabled:opacity-40 disabled:cursor-not-allowed text-text-primary flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                  title="Mark all notifications as read"
                >
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Mark all as read</span>
                </button>
                <button
                  type="button"
                  onClick={fetchNotifications}
                  disabled={loadingNotifications}
                  className="rounded-xl px-3.5 py-2 text-xs font-bold border border-border bg-surface hover:bg-surface-alt text-text-primary flex items-center gap-1.5 transition-all shadow-2xs cursor-pointer"
                  title="Refresh notifications"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${loadingNotifications ? 'animate-spin text-amber-500' : 'text-text-muted'}`} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {/* Quick Metrics Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-border/80">
              <div className="p-3 rounded-2xl bg-surface/90 border border-border shadow-2xs">
                <div className="text-[11px] font-semibold text-text-muted">Total Events</div>
                <div className="text-xl font-bold font-heading text-text-primary mt-0.5">{notifications.length}</div>
              </div>
              <div className="p-3 rounded-2xl bg-surface/90 border border-border shadow-2xs">
                <div className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <Bell className="w-3 h-3 text-amber-500" />
                  <span>Unread Updates</span>
                </div>
                <div className="text-xl font-bold font-heading text-amber-600 dark:text-amber-400 mt-0.5 flex items-center gap-2">
                  <span>{unreadCount}</span>
                  {unreadCount > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 font-bold border border-amber-500/30">
                      Needs Attention
                    </span>
                  )}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-surface/90 border border-border shadow-2xs">
                <div className="text-[11px] font-semibold text-teal-600 dark:text-teal-400">Project Staffings</div>
                <div className="text-xl font-bold font-heading text-teal-600 dark:text-teal-400 mt-0.5">
                  {notifications.filter(n => n.type === 'assigned').length}
                </div>
              </div>
              <div className="p-3 rounded-2xl bg-surface/90 border border-border shadow-2xs">
                <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">Certifications &amp; Proofs</div>
                <div className="text-xl font-bold font-heading text-emerald-600 dark:text-emerald-400 mt-0.5">
                  {notifications.filter(n => n.type === 'course_certified' || n.category === 'Skill Verification').length}
                </div>
              </div>
            </div>
          </div>

          {/* Sub-Filters & Search Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              {[
                { id: 'all', label: `All Activity (${notifications.length})` },
                { id: 'unread', label: `🔔 Unread (${unreadCount})`, highlight: unreadCount > 0 },
                { id: 'assigned', label: `🎯 Project Staffings (${notifications.filter(n => n.type === 'assigned').length})` },
                { id: 'decisions', label: `📋 Decisions (${notifications.filter(n => n.category === 'Application Decision').length})` },
                { id: 'learning', label: `🎓 Learning Tracks (${notifications.filter(n => n.category === 'Learning Track').length})` },
                { id: 'evidence', label: `🛡️ Evidence Reviews (${notifications.filter(n => n.category === 'Skill Verification').length})` },
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setNotificationsFilter(tab.id as typeof notificationsFilter)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    notificationsFilter === tab.id
                      ? 'bg-amber-600 text-white shadow-2xs font-bold'
                      : tab.highlight
                      ? 'bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 font-bold hover:bg-amber-500/20'
                      : 'bg-surface border border-border text-text-muted hover:text-text-primary hover:bg-surface-alt'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="relative shrink-0 sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                placeholder="Search notifications..."
                value={notificationSearchQuery}
                onChange={e => setNotificationSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface pl-8 pr-3 py-1.5 text-xs text-text-primary focus:border-amber-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Notifications Feed */}
          <div className="space-y-3">
            {filteredNotifications.map(n => {
              const isUnread = !readNotificationIds.has(n.id);
              const isSuccess = n.badge_variant === 'success';
              const isDanger = n.badge_variant === 'danger';
              const isWarning = n.badge_variant === 'warning';

              return (
                <div
                  key={n.id}
                  onClick={() => {
                    if (isUnread) markNotificationAsRead(n.id);
                  }}
                  className={`rounded-2xl border p-5 space-y-3 shadow-2xs hover:shadow-xs transition-all cursor-pointer ${
                    isUnread
                      ? 'border-amber-500/40 bg-amber-500/[0.04] dark:bg-amber-500/[0.06] border-l-4 border-l-amber-500'
                      : isSuccess
                      ? 'border-emerald-500/30 bg-emerald-500/[0.02]'
                      : isDanger
                      ? 'border-rose-500/30 bg-rose-500/[0.02]'
                      : isWarning
                      ? 'border-amber-500/30 bg-amber-500/[0.02]'
                      : 'border-border bg-surface'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                        isSuccess
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          : isDanger
                          ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                          : isWarning
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                          : 'bg-teal-500/15 text-teal-600 dark:text-teal-400'
                      }`}>
                        {n.category === 'Project Assignment' ? (
                          <FolderGit2 className="w-4 h-4" />
                        ) : n.category === 'Application Decision' ? (
                          isDanger ? <X className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />
                        ) : n.category === 'Learning Track' ? (
                          <GraduationCap className="w-4 h-4" />
                        ) : (
                          <ShieldCheck className="w-4 h-4" />
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-sm text-text-primary">{n.title}</h4>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            isSuccess
                              ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                              : isDanger
                              ? 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30'
                              : isWarning
                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30'
                              : 'bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/30'
                          }`}>
                            {n.category}
                          </span>
                          {isUnread && (
                            <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-500 text-white flex items-center gap-1 shadow-2xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                              NEW
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-text-muted leading-relaxed max-w-3xl">
                          {n.message}
                        </p>
                      </div>
                    </div>

                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2.5 shrink-0 pt-1 sm:pt-0">
                      <span className="text-[11px] font-medium text-text-muted">{n.timestamp}</span>
                      <div className="flex items-center gap-2">
                        {isUnread && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              markNotificationAsRead(n.id);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-2xs font-bold border border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 transition-all cursor-pointer shadow-2xs"
                            title="Mark this notification as read"
                          >
                            <Check className="w-3 h-3" />
                            <span>Mark read</span>
                          </button>
                        )}
                        {n.action_tab && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleNotificationJump(n);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-2xs font-bold bg-teal-600 hover:bg-teal-700 text-white shadow-2xs transition-all cursor-pointer"
                          >
                            <span>Open {n.action_tab}</span>
                            <ChevronRight className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredNotifications.length === 0 && !loadingNotifications && (
              <div className="rounded-2xl border border-dashed border-border bg-surface p-12 text-center space-y-3">
                <Bell className="w-10 h-10 text-text-muted mx-auto opacity-50" />
                <h4 className="text-sm font-bold text-text-primary">
                  {notificationsFilter === 'unread' ? 'All Caught Up!' : 'No Notifications Found'}
                </h4>
                <p className="text-xs text-text-muted max-w-md mx-auto">
                  {notificationsFilter === 'unread'
                    ? 'You have reviewed all your assignment, gig application, and skill verification updates.'
                    : notificationSearchQuery.trim()
                    ? `No notifications matched "${notificationSearchQuery}".`
                    : 'When you are staffed on a project, submit a gig application, enroll in a course, or have your skill evidence reviewed, your updates will appear right here.'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Submit Evidence Modal ──────────────────────────────────── */}
      {showSubmitEvidenceModal && (
        <SubmitEvidenceModal
          employee={currentEmployee}
          initialSkillName={evidenceTargetSkill}
          onClose={() => setShowSubmitEvidenceModal(false)}
          onSuccess={async () => {
            if (onReloadData) await onReloadData();
          }}
          onShowToast={onShowToast}
        />
      )}

      {/* ── Apply Opportunity Modal ────────────────────────────────── */}
      {applyModalOpportunity && (
        <ApplyOpportunityModal
          currentEmployee={currentEmployee}
          opportunity={applyModalOpportunity}
          onClose={() => setApplyModalOpportunity(null)}
          onSuccess={async () => {
            await fetchApplications();
            if (onReloadData) await onReloadData();
          }}
          onShowToast={onShowToast}
        />
      )}

      {/* ── Phase 4: Log Hours Modal ───────────────────────────────── */}
      {logHoursTarget && (
        <LogHoursModal
          resourceId={logHoursTarget.resourceId}
          courseTitle={logHoursTarget.courseTitle}
          roleId={logHoursTarget.roleId}
          currentHoursLogged={logHoursTarget.currentHours}
          totalEstimatedHours={logHoursTarget.totalHours}
          onClose={() => setLogHoursTarget(null)}
          onSuccess={async () => {
            if (onReloadData) await onReloadData();
          }}
          onShowToast={onShowToast}
        />
      )}

      {/* ── Phase 4: Request Completion Modal ──────────────────────── */}
      {completionTarget && (
        <RequestCompletionModal
          resourceId={completionTarget.resourceId}
          courseTitle={completionTarget.courseTitle}
          roleId={completionTarget.roleId}
          onClose={() => setCompletionTarget(null)}
          onSuccess={async () => {
            if (onReloadData) await onReloadData();
          }}
          onShowToast={onShowToast}
        />
      )}

      {/* ── Phase 4: Suggest Course Modal ──────────────────────────── */}
      {showSuggestModal && (
        <SuggestCourseModal
          onClose={() => setShowSuggestModal(false)}
          onSuccess={async () => {
            if (onReloadData) await onReloadData();
          }}
          onShowToast={onShowToast}
        />
      )}

      {/* ── Phase 5: Opportunity Match Breakdown Modal ──────────────── */}
      {breakdownOpportunity && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200"
          onClick={() => setBreakdownOpportunity(null)}
        >
          <div
            className="bg-surface border border-border rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl my-auto animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border p-6 bg-surface-alt">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-text-primary">Match Calculation Breakdown</h3>
                  <p className="text-xs text-text-muted">{breakdownOpportunity.name}</p>
                </div>
              </div>
              <button
                onClick={() => setBreakdownOpportunity(null)}
                className="w-8 h-8 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="p-3 rounded-2xl bg-surface-alt border border-border">
                  <div className="text-2xs text-text-muted font-semibold">Final Match</div>
                  <div className="text-lg font-bold text-teal-600 dark:text-teal-400 mt-0.5">{breakdownOpportunity.matchScore}%</div>
                </div>
                <div className="p-3 rounded-2xl bg-surface-alt border border-border">
                  <div className="text-2xs text-text-muted font-semibold">Skill Readiness</div>
                  <div className="text-lg font-bold text-text-primary mt-0.5">{breakdownOpportunity.base_match_percent ?? breakdownOpportunity.matchScore}%</div>
                </div>
                <div className="p-3 rounded-2xl bg-surface-alt border border-border">
                  <div className="text-2xs text-text-muted font-semibold">Capacity Factor</div>
                  <div className="text-lg font-bold text-text-primary mt-0.5">{breakdownOpportunity.availability_factor !== undefined ? `${breakdownOpportunity.availability_factor}x` : '1.0x'}</div>
                </div>
              </div>

              {breakdownOpportunity.availability_factor !== undefined && breakdownOpportunity.availability_factor < 1.0 && (
                <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-700 dark:text-amber-300">
                  ⚠️ <strong>Availability penalty applied:</strong> You have {breakdownOpportunity.free_hours}h/wk free but this opportunity requires {breakdownOpportunity.required_hours}h/wk.
                </div>
              )}

              <div className="space-y-2">
                <div className="text-xs font-bold text-text-primary">Deterministic Skill Criteria</div>
                <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                  {breakdownOpportunity.skill_breakdown?.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2.5 rounded-xl border border-border bg-surface-alt text-xs">
                      <div>
                        <div className="font-semibold text-text-primary">{item.skill_name}</div>
                        <div className="text-[11px] text-text-muted">
                          Req: <span className="font-medium text-text-primary">{item.required_level}</span> · You: <span className="font-medium text-text-primary">{item.current_level || item.employee_level}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          item.status === 'Exceeds' || item.status === 'Meets'
                            ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                            : item.status === '1 Level Below'
                            ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                            : 'bg-rose-500/10 text-rose-600 border border-rose-500/20'
                        }`}>
                          {item.status} ({Math.round(item.credit * 100)}%)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex justify-end border-t border-border">
                <button
                  type="button"
                  onClick={() => setBreakdownOpportunity(null)}
                  className="rounded-xl px-4 py-2 text-xs font-semibold bg-surface border border-border text-text-muted hover:text-text-primary"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Skill Level Explanation Drill-down Modal ("Why is my level X?") */}
      {explanationSkill && (
        <SkillLevelExplanationModal
          employeeId={currentEmployee.id}
          skillId={explanationSkill.id}
          skillName={explanationSkill.name}
          onClose={() => setExplanationSkill(null)}
        />
      )}
    </div>
  );
};
