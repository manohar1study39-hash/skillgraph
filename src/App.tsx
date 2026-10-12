import React, { useEffect, useMemo, useState, useRef } from 'react';
import { AlertCircle, X, Shield, Briefcase, UserRound, ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';
import { Sidebar, NavTab } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { TalentSearchTab } from './components/talent-search/TalentSearchTab';
import { NearQualifiedTab } from './components/near-qualified/NearQualifiedTab';
import { SkillGraphTab } from './components/skill-graph/SkillGraphTab';
import { MarketplaceTab } from './components/marketplace/MarketplaceTab';
import { EvidenceModal } from './components/evidence/EvidenceModal';
import { EmployeeProfileModal } from './components/talent-search/EmployeeProfileModal';
import { EmployeePortalTab } from './components/employee/EmployeePortalTab';
import { EmployeeUpskillingTab } from './components/employee/EmployeeUpskillingTab';
import { EmployeeProfileEditorModal } from './components/employee/EmployeeProfileEditorModal';
import { AuthModal, type CompanyUser } from './components/auth/AuthModal';
import { UserManagementPanel } from './components/auth/UserManagementPanel';
import { EmployeeDirectoryTab } from './components/employee/EmployeeDirectoryTab';
import { CSV_DATA, fetchInitialData } from './services/dataLoader';
import { analyzeAllEmployees, LearningResourceRow, RoleRequirement } from './services/upskillingEngine';
import { StyleguidePage } from './components/styleguide/StyleguidePage';
import { AmbientCursorGlow } from './components/ui/AmbientCursorGlow';
import { ConflictModal } from './components/ui/ConflictModal';
import { applyTheme, getInitialTheme } from './services/theme';
import { useDataVersionPolling } from './services/queryClient';
import { apiFetch } from './services/apiClient';
import type { Employee, ToastUndoAction } from './types';

type ProgressRow = { employee_id: string; role_id: string; resource_id: string; status: string; progress_percent: string; updated_at: string };
type AuthMode = 'login' | 'signup' | null;

export function App() {
  const [user, setUser]                 = useState<CompanyUser | null>(null);
  const [appReady, setAppReady]         = useState(false);
  const [authChecked, setAuthChecked]   = useState(false);
  const [authMode, setAuthMode]         = useState<AuthMode>(null);
  const [authNotice, setAuthNotice]     = useState('');
  const [dataLoadError, setDataLoadError] = useState('');
  const [activeTab, setActiveTab]       = useState<NavTab>('search');
  const [searchQueryText, setSearchQueryText] = useState('Find employees capable of building a React + Node.js fintech application');
  const [employees, setEmployees]       = useState<Employee[]>([]);
  const [progress, setProgress]         = useState<ProgressRow[]>([]);
  const [learningResources, setLearningResources] = useState<LearningResourceRow[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [profileModalEmployee, setProfileModalEmployee] = useState<Employee | null>(null);
  const [inspectModal, setInspectModal] = useState<{ employee: Employee | null; skillName: string | null }>({ employee: null, skillName: null });
  const [toastState, setToastState] = useState<{
    message: string;
    undoAction?: ToastUndoAction;
    countdown: number;
  } | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const [collapsed, setCollapsed]       = useState(() => { try { return localStorage.getItem('skillgraph-sidebar-collapsed') === 'true'; } catch { return false; } });
  const [mobileOpen, setMobileOpen]     = useState(false);
  const [showUserMgmt, setShowUserMgmt] = useState(false);
  const [showEditProfileModal, setShowEditProfileModal] = useState(false);
  const [isSyncing, setIsSyncing]       = useState(false);
  const [isStyleguide, setIsStyleguide] = useState(() => {
    return Boolean(import.meta.env.DEV && typeof window !== 'undefined' && (window.location.pathname === '/styleguide' || window.location.search.includes('tab=styleguide')));
  });

  useEffect(() => {
    applyTheme(getInitialTheme());
  }, []);


  /* ── Data loading ── */
  const reloadAllData = async () => {
    try {
      const data = await fetchInitialData();
      setEmployees(data.employeesData);
      setProgress(data.records.upskillingProgress as ProgressRow[]);
      setLearningResources(data.records.learningResources as unknown as LearningResourceRow[]);
    } catch (error) {
      console.error('Failed to reload company data:', error);
    }
  };

  useDataVersionPolling(reloadAllData, appReady);

  const loadStaffData = async (staff: CompanyUser) => {
    setDataLoadError(''); setUser(staff);
    try {
      const data = await fetchInitialData();
      setEmployees(data.employeesData);
      setProgress(data.records.upskillingProgress as ProgressRow[]);
      setLearningResources(data.records.learningResources as unknown as LearningResourceRow[]);
      setAppReady(true);
      if (staff.role === 'Employee') {
        setActiveTab('employee-hub');
      } else {
        setActiveTab('search');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to load company data.';
      setAppReady(false); setDataLoadError(message); throw error;
    }
  };

  /* ── Session restore on mount ── */
  useEffect(() => {
    fetch('/api/session', { credentials: 'same-origin' })
      .then(r => r.json())
      .then(async result => { if (result.user) await loadStaffData(result.user); })
      .catch(() => undefined)
      .finally(() => setAuthChecked(true));
  }, []);

  // Safeguard role-appropriate tabs
  useEffect(() => {
    if (user) {
      if (user.role === 'Employee' && activeTab === 'search') {
        setActiveTab('employee-hub');
      } else if (user.role !== 'Employee' && activeTab === 'employee-hub') {
        setActiveTab('search');
      }
    }
  }, [user, activeTab]);

  /* ── Auth helpers ── */
  const openAuth = (mode: Exclude<AuthMode, null>) => setAuthMode(mode);

  const handleAuthSuccess = async (staff: CompanyUser) => {
    setAuthMode(null);
    await loadStaffData(staff);
  };

  const handleAuthPending = () => {
    setAuthMode(null);
    setAuthNotice('Your account request is waiting for HR approval. You\'ll be able to sign in once it\'s approved.');
  };

  const logout = async () => {
    await fetch('/api/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } });
    setUser(null); setEmployees([]); setProgress([]);
    setAppReady(false); setActiveTab('search'); setDataLoadError('');
  };

  /* ── Misc helpers ── */
  const showToast = (message: string, undoAction?: ToastUndoAction) => {
    if (toastTimerRef.current) {
      window.clearInterval(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    const duration = undoAction?.durationSeconds || (undoAction ? 10 : 4);
    setToastState({
      message,
      undoAction,
      countdown: duration,
    });

    const timer = window.setInterval(() => {
      setToastState(prev => {
        if (!prev) return null;
        if (prev.countdown <= 1) {
          window.clearInterval(timer);
          return null;
        }
        return { ...prev, countdown: prev.countdown - 1 };
      });
    }, 1000);
    toastTimerRef.current = timer;
  };

  const toggleSidebar = () => setCollapsed(v => {
    const next = !v;
    try { localStorage.setItem('skillgraph-sidebar-collapsed', String(next)); } catch { }
    return next;
  });

  /* ── Near-qualified derived state ── */
  const defaultRole   = appReady ? CSV_DATA.rolesData.find(role => CSV_DATA.records.roles.find(row => (row as any).role_id === role.id)?.status === 'Open') || CSV_DATA.rolesData[0] : undefined;
  const requirements  = appReady ? CSV_DATA.records.roleSkills as unknown as RoleRequirement[] : [];
  const resources     = learningResources.length > 0 ? learningResources : (appReady ? CSV_DATA.records.learningResources as unknown as LearningResourceRow[] : []);
  const nearQualifiedEmployees = useMemo(
    () => defaultRole ? analyzeAllEmployees(employees, defaultRole, requirements, resources, progress, CSV_DATA.skillsData).map(m => m.employee) : [],
    [employees, defaultRole, requirements, resources, progress]
  );

  /* ── Current employee for employee portal ── */
  const currentEmployee = useMemo(() => {
    if (!user || user.role !== 'Employee') return null;
    const userEmail = (user.email || '').trim().toLowerCase();
    const userName = (user.name || '').trim().toLowerCase();

    // Canonical link for demo accounts
    if (
      userEmail === 'employee@skillgraph.demo' ||
      userEmail === 'employee@gmail.com' ||
      userEmail === 'alex.chen@company.com' ||
      user.user_id === 'user-employee-demo' ||
      user.user_id === 'user-employee-alex'
    ) {
      const emp1 = employees.find(e => e.id === 'emp-1');
      if (emp1) return emp1;
    }

    const found = employees.find(e =>
      (e.email && e.email.toLowerCase() === userEmail) ||
      (e.name && e.name.toLowerCase() === userName)
    );
    if (found) return found;

    // For fresh or newly registered employees, give them an empty fresh profile instead of predefined data
    return {
      id: `emp-${user.user_id}`,
      name: user.name || 'New Employee',
      avatar: '',
      role: 'Software Engineer',
      department: 'Engineering',
      team: 'General Team',
      email: user.email || '',
      location: 'Remote',
      availabilityPercent: 100,
      currentWorkloadPercent: 0,
      hoursPerWeekFree: 40,
      bio: 'New team member profile.',
      yearsExperience: 1,
      skills: [],
      topProjects: [],
      certifications: []
    };
  }, [user, employees]);

  /* ── Employee active learning courses count for sidebar badge ── */
  const myEnrolledCoursesCount = useMemo(() => {
    if (!currentEmployee) return 0;
    return progress.filter(p =>
      (p.employee_id === currentEmployee.id || p.employee_id.includes(currentEmployee.id)) &&
      p.status !== 'Dropped' &&
      p.status !== 'Done' &&
      Number(p.progress_percent || 0) < 100
    ).length;
  }, [currentEmployee, progress]);

  useDataVersionPolling(async () => {
    await reloadAllData();
  }, Boolean(user && appReady));

  const handleUpdateProgress = async (row: ProgressRow) => {
    const res = await apiFetch('/api/upskilling-progress', {
      method: 'POST',
      body: JSON.stringify(row),
      onConflictReload: reloadAllData,
    });
    if (!res.ok) {
      if (res.status !== 409) showToast(res.error || 'Progress could not be saved.');
      return;
    }
    const savedRow: ProgressRow = (res.data as any)?.row || row;
    setProgress(prev => {
      const filtered = prev.filter(item => !(
        (item.employee_id === savedRow.employee_id || item.employee_id === row.employee_id || (currentEmployee && item.employee_id === currentEmployee.id)) &&
        item.role_id === savedRow.role_id &&
        item.resource_id === savedRow.resource_id
      ));
      return [...filtered, savedRow];
    });
    showToast('Learning progress saved.');
  };

  if (isStyleguide) {
    return (
      <StyleguidePage
        onBack={() => {
          window.history.pushState({}, '', '/');
          setIsStyleguide(false);
        }}
        onShowToast={showToast}
      />
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background font-sans text-text-primary relative">
      <AmbientCursorGlow />
      <ConflictModal onGlobalReload={reloadAllData} />

      <Sidebar
        activeTab={activeTab}
        setActiveTab={tab => {
          if (user?.role === 'Employee' && tab === 'search') {
            setActiveTab('employee-hub');
          } else {
            setActiveTab(tab);
          }
          if (!user) openAuth('login');
        }}
        nearQualifiedCount={user?.role === 'Employee' ? myEnrolledCoursesCount : nearQualifiedEmployees.length}
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        user={user}
        onSignIn={() => openAuth('login')}
        onSignUp={() => openAuth('signup')}
        onLogout={() => void logout()}
        onUserMgmt={() => setShowUserMgmt(true)}
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header
          onQuickSearch={query => {
            if (user?.role === 'Employee') {
              setActiveTab('marketplace');
            } else {
              setSearchQueryText(query);
              setActiveTab('search');
            }
            if (!user) openAuth('login');
          }}
          collapsed={collapsed}
          onToggleSidebar={toggleSidebar}
          onOpenMobile={() => setMobileOpen(true)}
          onSyncData={async () => {
            setIsSyncing(true);
            await reloadAllData();
            setIsSyncing(false);
            showToast('Company records synchronized.');
          }}
          isSyncing={isSyncing}
          user={user}
          activeTab={activeTab}
          onLogout={() => void logout()}
          onUserMgmt={() => setShowUserMgmt(true)}
        />

        {/* Auth notice banner */}
        {authNotice && (
          <div role="status" className="flex items-center justify-between gap-3 border-b border-border bg-highlight px-5 py-3 text-sm text-highlight-strong">
            <span>{authNotice}</span>
            <button onClick={() => setAuthNotice('')} aria-label="Dismiss" className="rounded p-1 hover:bg-surface">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-7">
          <div className="mx-auto w-full max-w-7xl">
            {/* Data load error */}
            {dataLoadError && (
              <div className="mb-5 flex items-center justify-between rounded-xl border border-danger/30 bg-surface p-4 text-sm text-danger">
                <span className="flex items-center gap-2"><AlertCircle className="h-4 w-4" />{dataLoadError}</span>
                <button
                  onClick={async () => {
                    setDataLoadError('');
                    try {
                      if (user) {
                        await loadStaffData(user);
                      } else {
                        const sessionRes = await fetch('/api/session', { credentials: 'same-origin' }).then(r => r.json()).catch(() => ({}));
                        if (sessionRes?.user) {
                          await loadStaffData(sessionRes.user);
                        } else {
                          await reloadAllData();
                        }
                      }
                    } catch (err) {
                      console.error('Retry failed:', err);
                    }
                  }}
                  className="font-semibold underline hover:text-danger/80 transition-colors"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Session checking indicator */}
            {!authChecked && !user && (
              <div role="status" className="mb-4 flex items-center gap-2 text-xs text-text-muted">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-border border-t-accent" />
                Checking your session…
              </div>
            )}

            {/* App content */}
            {/* App content */}
            {!user || !appReady
              ? (
                <div className="relative flex min-h-[78vh] flex-col items-center justify-center px-4 py-12 sm:py-16 text-center animate-in fade-in duration-300 before:pointer-events-none before:absolute before:top-1/4 before:left-1/2 before:-translate-x-1/2 before:-translate-y-1/2 before:w-[600px] before:h-[300px] before:bg-aurora before:opacity-15 before:blur-[120px] before:rounded-full">
                  <div className="relative mb-6 group">
                    <div className="absolute -inset-1.5 rounded-3xl bg-aurora opacity-35 blur-xl group-hover:opacity-60 transition duration-slow" />
                    <div className="relative h-20 w-20 sm:h-24 sm:w-24 rounded-2xl overflow-hidden shadow-2xl border border-white/20 bg-[#0B1020]">
                      <img src="/logo.jpg" alt="SkillGraph Main Logo" className="h-full w-full object-cover" />
                    </div>
                  </div>

                  <div className="inline-flex items-center gap-2 rounded-chip border border-primary/20 bg-primary-tint px-3.5 py-1 text-xs font-semibold text-primary shadow-xs mb-6">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    <span>Next-Gen Enterprise Skill &amp; Workforce Mobility</span>
                  </div>
                  <h1 className="text-hero font-heading text-ink text-wrap-balance max-w-3xl mx-auto">
                    Find the talent you already have
                  </h1>
                  <p className="mt-4 text-base text-muted max-w-xl mx-auto leading-relaxed text-wrap-pretty">
                    Graph-based skill ontology, auditable evidence verification, automated gap analysis, and friction-free initiative staffing.
                  </p>

                  <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                    <button
                      onClick={() => openAuth('login')}
                      className="aurora-btn-primary button-primary h-11 px-7 text-sm font-semibold rounded-button inline-flex items-center justify-center gap-2.5 shadow-glow"
                    >
                      <span>Sign In to Your Portal</span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => openAuth('signup')}
                      className="h-11 px-7 text-sm font-semibold rounded-button border border-border bg-surface text-ink hover:bg-surface-hover hover:border-border-strong transition-all duration-base shadow-xs inline-flex items-center justify-center"
                    >
                      Register New Account
                    </button>
                  </div>

                  {/* 3 Role Cards with role accents */}
                  <div className="mt-14 grid grid-cols-1 sm:grid-cols-3 gap-6 w-full max-w-5xl text-left">
                    {/* HR Administration */}
                    <div
                      onClick={() => openAuth('login')}
                      className="group cursor-pointer rounded-card border border-border bg-surface p-6 card-hover-lift shadow-card hover:border-[#B14AFF]/50 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <div className="rounded-button bg-[#F6EEFF] text-[#6B21A8] dark:bg-[#B14AFF]/15 dark:text-[#D8B4FE] p-2.5 group-hover:scale-105 transition-transform duration-base">
                            <Shield className="h-5 w-5" />
                          </div>
                          <span className="rounded-chip bg-[#F6EEFF] text-[#6B21A8] dark:bg-[#B14AFF]/15 dark:text-[#D8B4FE] border border-[#E9D5FF] dark:border-[#B14AFF]/30 px-2.5 py-0.5 text-2xs font-semibold">
                            HR Admin
                          </span>
                        </div>
                        <h3 className="text-card-title font-heading text-ink">HR Administration</h3>
                        <p className="mt-2 text-xs text-muted leading-relaxed">
                          Track company-wide skill gaps, manage learning resources, add employees, and monitor readiness across active initiatives.
                        </p>
                      </div>
                      <div className="mt-5 pt-3 border-t border-border/60 flex items-center gap-1.5 text-xs font-semibold text-primary group-hover:translate-x-0.5 transition-transform">
                        <span>Access Admin Suite</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </div>
                    </div>

                    {/* Engineering Managers */}
                    <div
                      onClick={() => openAuth('login')}
                      className="group cursor-pointer rounded-card border border-border bg-surface p-6 card-hover-lift shadow-card hover:border-[#19C3E6]/50 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <div className="rounded-button bg-[#E3F8FD] text-[#0369A1] dark:bg-[#19C3E6]/15 dark:text-[#3AD3F0] p-2.5 group-hover:scale-105 transition-transform duration-base">
                            <Briefcase className="h-5 w-5" />
                          </div>
                          <span className="rounded-chip bg-[#E3F8FD] text-[#0369A1] dark:bg-[#19C3E6]/15 dark:text-[#3AD3F0] border border-[#BAE6FD] dark:border-[#19C3E6]/30 px-2.5 py-0.5 text-2xs font-semibold">
                            Manager
                          </span>
                        </div>
                        <h3 className="text-card-title font-heading text-ink">Engineering Managers</h3>
                        <p className="mt-2 text-xs text-muted leading-relaxed">
                          Identify near-qualified talent, staff internal initiatives, build project teams, and match verified competencies.
                        </p>
                      </div>
                      <div className="mt-5 pt-3 border-t border-border/60 flex items-center gap-1.5 text-xs font-semibold text-primary group-hover:translate-x-0.5 transition-transform">
                        <span>Access Manager Console</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </div>
                    </div>

                    {/* Employee Career Hub */}
                    <div
                      onClick={() => openAuth('login')}
                      className="group cursor-pointer rounded-card border border-border bg-surface p-6 card-hover-lift shadow-card hover:border-[#10B981]/50 flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-4">
                          <div className="rounded-button bg-[#ECFDF5] text-[#065F46] dark:bg-[#10B981]/15 dark:text-[#34D399] p-2.5 group-hover:scale-105 transition-transform duration-base">
                            <UserRound className="h-5 w-5" />
                          </div>
                          <span className="rounded-chip bg-[#ECFDF5] text-[#065F46] dark:bg-[#10B981]/15 dark:text-[#34D399] border border-[#A7F3D0] dark:border-[#10B981]/30 px-2.5 py-0.5 text-2xs font-semibold">
                            Employee
                          </span>
                        </div>
                        <h3 className="text-card-title font-heading text-ink">Employee Career Hub</h3>
                        <p className="mt-2 text-xs text-muted leading-relaxed">
                          Manage your verified skill proofs, enroll in upskilling tracks, set workload availability, and discover open project gigs.
                        </p>
                      </div>
                      <div className="mt-5 pt-3 border-t border-border/60 flex items-center gap-1.5 text-xs font-semibold text-primary group-hover:translate-x-0.5 transition-transform">
                        <span>Access Career Hub</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </div>
                    </div>
                  </div>
                </div>
              )
              : (
                <>
                  {activeTab === 'employee-hub' && currentEmployee && (
                    <EmployeePortalTab
                      currentEmployee={currentEmployee}
                      allEmployees={employees}
                      roles={CSV_DATA.rolesData}
                      requirements={requirements}
                      resources={resources}
                      progress={progress}
                      onInspectEvidence={(employee, skillName) => setInspectModal({ employee, skillName })}
                      onOpenUpskilling={() => setActiveTab('upskilling')}
                      onOpenOpportunities={() => setActiveTab('marketplace')}
                      onOpenEditProfile={() => setShowEditProfileModal(true)}
                      onShowToast={showToast}
                      onUpdateProgress={handleUpdateProgress}
                      onReloadData={reloadAllData}
                      onUpdateAvailability={async (availabilityPercent, hoursPerWeekFree) => {
                        const res = await fetch('/api/employee-availability', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          credentials: 'same-origin',
                          body: JSON.stringify({ availabilityPercent, hoursPerWeekFree })
                        });
                        if (!res.ok) throw new Error('Failed to update availability');
                        const data = await res.json().catch(() => ({}));
                        const targetId = (data as any).employee_id || currentEmployee.id;
                        setEmployees(prev => {
                          const exists = prev.some(e => e.id === targetId || e.id === currentEmployee.id);
                          if (!exists) {
                            return [...prev, {
                              ...currentEmployee,
                              id: targetId,
                              availabilityPercent,
                              hoursPerWeekFree,
                              currentWorkloadPercent: Math.max(0, 100 - availabilityPercent)
                            }];
                          }
                          return prev.map(e => (e.id === currentEmployee.id || e.id === targetId) ? {
                            ...e,
                            id: targetId,
                            availabilityPercent,
                            hoursPerWeekFree,
                            currentWorkloadPercent: Math.max(0, 100 - availabilityPercent)
                          } : e);
                        });
                        await reloadAllData();
                      }}
                    />
                  )}
                  {user.role !== 'Employee' && (activeTab === 'search' || activeTab === 'employee-hub') && (
                    <TalentSearchTab
                      employees={employees}
                      searchQueryText={searchQueryText}
                      setSearchQueryText={setSearchQueryText}
                      onSelectEmployee={employee => {
                        setSelectedEmployee(employee);
                        setProfileModalEmployee(employee);
                      }}
                      onOpenUpskilling={employee => { setSelectedEmployee(employee); setActiveTab('upskilling'); }}
                      onInspectEvidence={(employee, skillName) => setInspectModal({ employee, skillName })}
                      onShowToast={showToast}
                      onReloadData={reloadAllData}
                    />
                  )}
                  {activeTab === 'directory' && (
                    <EmployeeDirectoryTab
                      employees={employees}
                      userRole={user.role}
                      onSelectEmployee={employee => {
                        setSelectedEmployee(employee);
                        setProfileModalEmployee(employee);
                      }}
                      onOpenUpskilling={employee => {
                        setSelectedEmployee(employee);
                        setActiveTab('upskilling');
                      }}
                      onReloadData={reloadAllData}
                      onShowToast={showToast}
                    />
                  )}
                  {activeTab === 'upskilling' && (
                    user.role === 'Employee' && currentEmployee ? (
                      <EmployeeUpskillingTab
                        currentEmployee={currentEmployee}
                        allEmployees={employees}
                        roles={CSV_DATA.rolesData}
                        requirements={requirements}
                        resources={resources}
                        progress={progress}
                        onUpdateProgress={handleUpdateProgress}
                        onShowToast={showToast}
                        onOpenEditProfile={() => setShowEditProfileModal(true)}
                      />
                    ) : (
                      <NearQualifiedTab
                        employees={employees}
                        selectedEmployee={selectedEmployee}
                        onSelectEmployee={employee => {
                          setSelectedEmployee(employee);
                          setProfileModalEmployee(employee);
                        }}
                        onUpdateProgress={(user.role === 'HR_Admin' || user.role === 'Manager') ? handleUpdateProgress : undefined}
                        roles={CSV_DATA.rolesData}
                        requirements={requirements}
                        resources={resources}
                        progress={progress}
                        userRole={user.role}
                        onReloadData={reloadAllData}
                        onShowToast={showToast}
                      />
                    )
                  )}
                  {activeTab === 'graph' && (
                    <SkillGraphTab
                      employees={employees}
                      currentEmployee={currentEmployee}
                      onInspectEvidence={(employee, skillName) => setInspectModal({ employee, skillName })}
                    />
                  )}
                  {activeTab === 'marketplace' && (
                    <MarketplaceTab
                      employees={employees}
                      currentEmployee={currentEmployee}
                      onSelectEmployee={employee => {
                        setSelectedEmployee(employee);
                        setProfileModalEmployee(employee);
                      }}
                      onInspectEvidence={(employee, skillName) => setInspectModal({ employee, skillName })}
                      onShowToast={showToast}
                      userRole={user.role}
                      onReloadData={reloadAllData}
                    />
                  )}
                </>
              )}
          </div>
        </main>
      </div>

      {/* Toast with 10s Undo Window */}
      {toastState && (
        <div
          role="status"
          className="fixed bottom-5 right-5 z-50 flex items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/95 backdrop-blur-md px-4 py-3 text-xs font-semibold text-white shadow-2xl animate-in slide-in-from-bottom-2 duration-150"
        >
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
            <CheckCircle2 className="h-3.5 w-3.5" />
          </span>
          <span>{toastState.message}</span>
          {toastState.undoAction && (
            <button
              type="button"
              onClick={async () => {
                if (toastTimerRef.current) {
                  window.clearInterval(toastTimerRef.current);
                  toastTimerRef.current = null;
                }
                const action = toastState.undoAction;
                setToastState(null);
                if (action) {
                  await action.onUndo();
                }
              }}
              className="ml-2 px-2.5 py-1 rounded-lg bg-teal-500/20 hover:bg-teal-500/30 text-teal-300 font-bold text-xs flex items-center gap-1 border border-teal-500/40 cursor-pointer transition-colors shadow-2xs"
            >
              {toastState.undoAction.label} ({toastState.countdown}s)
            </button>
          )}
        </div>
      )}

      {/* Employee Profile Modal */}
      {profileModalEmployee && (
        <EmployeeProfileModal
          employee={profileModalEmployee}
          onClose={() => setProfileModalEmployee(null)}
          onOpenUpskilling={employee => {
            setSelectedEmployee(employee);
            setActiveTab('upskilling');
          }}
          onInspectEvidence={(employee, skillName) => setInspectModal({ employee, skillName })}
          userRole={user?.role}
          onReloadData={reloadAllData}
          onShowToast={showToast}
        />
      )}

      {/* Employee Self-Profile Editor Modal */}
      {showEditProfileModal && currentEmployee && (
        <EmployeeProfileEditorModal
          employee={currentEmployee}
          onClose={() => setShowEditProfileModal(false)}
          onSaveSuccess={async () => {
            setShowEditProfileModal(false);
            await reloadAllData();
          }}
          onShowToast={showToast}
        />
      )}

      {/* Evidence modal */}
      {inspectModal.employee && inspectModal.skillName && (
        <EvidenceModal
          employee={inspectModal.employee}
          skillName={inspectModal.skillName}
          onClose={() => setInspectModal({ employee: null, skillName: null })}
          currentUser={user}
          onShowToast={showToast}
          onReloadData={reloadAllData}
        />
      )}

      {/* Auth modal */}
      {authMode && (
        <AuthModal
          initialMode={authMode}
          onClose={() => setAuthMode(null)}
          onSuccess={handleAuthSuccess}
          onPending={handleAuthPending}
        />
      )}

      {/* User management panel (HR only) */}
      {showUserMgmt && user && (
        <UserManagementPanel
          currentUserId={user.user_id}
          onClose={() => setShowUserMgmt(false)}
          onShowToast={showToast}
        />
      )}
    </div>
  );
}
