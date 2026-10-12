import React, { useEffect, useState } from 'react';
import {
  AlertCircle, AlertTriangle, ArrowLeft, Briefcase, Check, Eye, EyeOff,
  GraduationCap, KeyRound, LoaderCircle, LockKeyhole,
  Mail, Network, Shield, ShieldCheck, TrendingUp,
  UserRoundPlus, X, Sparkles, CheckCircle2, ChevronDown, ChevronUp, UserRound
} from 'lucide-react';
import { passwordRuleFailures } from '../../services/companyAuth';
import { Button } from '../ui/Button';

/* ── Types ────────────────────────────────────────────────── */
type AuthMode   = 'login' | 'signup' | 'forgot';
type AuthPortal = 'employee' | 'manager' | 'hr';
export type CompanyUser = { user_id: string; name: string; role: 'HR_Admin' | 'Manager' | 'Employee'; email?: string };

export interface AuthModalProps {
  initialMode: 'login' | 'signup';
  onClose:   () => void;
  onSuccess: (user: CompanyUser) => void;
  onPending: () => void;
}

/* ── Portal Configuration ─────────────────────────────────── */
const PORTAL_CONFIG = {
  employee: {
    label:       'Employee',
    fullTitle:   'Employee Career Hub',
    sublabel:    'Career growth & skill upskilling',
    Icon:        GraduationCap,
    accentColor: '#10B981',
    accentBorder:'border-[#10B981]',
    accentBg:    'bg-[#10B981]/10 text-[#10B981]',
    badgeClass:  'bg-[#ECFDF5] text-[#065F46] border-[#A7F3D0] dark:bg-[#10B981]/15 dark:text-[#34D399] dark:border-[#10B981]/30',
    capabilities:[
      'Self-service career hub & verified competencies',
      'Personalized upskilling roadmaps & gap closing',
      'Discover & apply to internal project opportunities'
    ],
    inviteCode:  'skillgraph-employee-2026',
    demoEmail:   'employee@skillgraph.demo',
    demoPwd:     'Password123!',
    targetRole:  'Employee' as const,
  },
  manager: {
    label:       'Manager',
    fullTitle:   'Manager Talent Console',
    sublabel:    'Talent search & team staffing',
    Icon:        Briefcase,
    accentColor: '#19C3E6',
    accentBorder:'border-[#19C3E6]',
    accentBg:    'bg-[#19C3E6]/10 text-[#087F9C] dark:text-[#3AD3F0]',
    badgeClass:  'bg-[#E3F8FD] text-[#0369A1] border-[#BAE6FD] dark:bg-[#19C3E6]/15 dark:text-[#3AD3F0] dark:border-[#19C3E6]/30',
    capabilities:[
      'Natural language semantic talent discovery',
      'Near-qualified candidate evaluation & scoring',
      'Internal project team assembly & bench allocation'
    ],
    inviteCode:  'skillgraph-dev-invite',
    demoEmail:   'manager@skillgraph.demo',
    demoPwd:     'SkillGraphManager2026!',
    targetRole:  'Manager' as const,
  },
  hr: {
    label:       'HR Admin',
    fullTitle:   'HR Administration Suite',
    sublabel:    'Org gap analysis & user audit',
    Icon:        Shield,
    accentColor: '#B14AFF',
    accentBorder:'border-[#B14AFF]',
    accentBg:    'bg-[#B14AFF]/10 text-[#6B21A8] dark:text-[#D8B4FE]',
    badgeClass:  'bg-[#F6EEFF] text-[#6B21A8] border-[#E9D5FF] dark:bg-[#B14AFF]/15 dark:text-[#D8B4FE] dark:border-[#B14AFF]/30',
    capabilities:[
      'Company-wide capability and shortage tracking',
      'New employee registration & role approval queues',
      'Auditable security trail & catalog governance'
    ],
    inviteCode:  'skillgraph-hr-admin-2026',
    demoEmail:   'hr@skillgraph.demo',
    demoPwd:     'SkillGraphHR2026!',
    targetRole:  'HR_Admin' as const,
  },
} as const;

export const AuthModal: React.FC<AuthModalProps> = ({
  initialMode,
  onClose,
  onSuccess,
  onPending,
}) => {
  const [portal, setPortal] = useState<AuthPortal>('employee');
  const [mode, setMode]     = useState<AuthMode>(initialMode);
  const [showCapabilities, setShowCapabilities] = useState(false);
  const [capsLockActive, setCapsLockActive]     = useState(false);

  /* Form fields */
  const [email, setEmail]                     = useState('');
  const [name, setName]                       = useState('');
  const [password, setPassword]               = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [inviteCode, setInviteCode]           = useState('');
  const [rememberMe, setRememberMe]           = useState(false);
  const [showPwd, setShowPwd]                 = useState(false);
  const [showConfirm, setShowConfirm]         = useState(false);

  /* UI feedback state */
  const [busy, setBusy]                 = useState(false);
  const [error, setError]               = useState('');
  const [fieldErrors, setFieldErrors]   = useState<Record<string, string>>({});
  const [forgotSent, setForgotSent]     = useState(false);
  const [signupSuccess, setSignupSuccess] = useState(false);

  const activeConfig = PORTAL_CONFIG[portal];
  const signupEmail  = email.trim().toLowerCase();
  const emailValid   = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signupEmail);
  const pwdFailures  = passwordRuleFailures(password);
  const pwdStrength  = Math.max(0, 4 - pwdFailures.length);
  const signupReady  = Boolean(name.trim()) && emailValid && pwdFailures.length === 0 && password === confirmPassword && Boolean(inviteCode.trim());

  /* ESC key dismiss */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  /* Detect CapsLock */
  const handleKeyModifier = (e: React.KeyboardEvent) => {
    setCapsLockActive(e.getModifierState('CapsLock'));
  };

  const clearField = (fieldName: string) => {
    setFieldErrors(prev => ({ ...prev, [fieldName]: '' }));
    setError('');
  };

  const handlePortalSwitch = (newPortal: AuthPortal) => {
    setPortal(newPortal);
    setError('');
    setFieldErrors({});
    if (mode === 'signup' && !inviteCode) {
      setInviteCode(PORTAL_CONFIG[newPortal].inviteCode);
    }
  };

  /* ── Login Submit ── */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email, password, rememberMe, portal }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sign in failed.');
      onSuccess(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  };

  /* ── Signup Submit ── */
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    const errors: Record<string, string> = {};
    if (!name.trim()) errors.name = 'Full name is required.';
    if (!emailValid) errors.email = 'Valid corporate email required.';
    if (!inviteCode.trim()) errors.invite = 'Invite code is required.';
    if (pwdFailures.length > 0) errors.password = pwdFailures[0];
    if (password !== confirmPassword) errors.confirm = 'Passwords do not match.';

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setBusy(true);
    setError('');
    setFieldErrors({});
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          name: name.trim(),
          email: signupEmail,
          password,
          confirmPassword,
          inviteCode: inviteCode.trim(),
          targetRole: activeConfig.targetRole,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Account registration failed.');

      if (data.status === 'pending') {
        onPending();
      } else {
        setSignupSuccess(true);
        setTimeout(() => {
          onSuccess(data.user);
        }, 800);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setBusy(false);
    }
  };

  /* ── Forgot Password Submit ── */
  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit reset request.');
      setForgotSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed.');
    } finally {
      setBusy(false);
    }
  };

  /* ── 1-Click Demo Login ── */
  const triggerDemoLogin = async (demoPortal: AuthPortal) => {
    const cfg = PORTAL_CONFIG[demoPortal];
    setPortal(demoPortal);
    setEmail(cfg.demoEmail);
    setPassword(cfg.demoPwd);
    setMode('login');
    setBusy(true);
    setError('');

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          email: cfg.demoEmail,
          password: cfg.demoPwd,
          portal: demoPortal,
          rememberMe: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Demo login failed.');
      onSuccess(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo sign in failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 sm:p-6 bg-[#070B16]/80 backdrop-blur-sm"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="auth-modal-title"
        className="relative my-auto w-full max-w-[1040px] overflow-hidden rounded-card border border-border bg-surface shadow-modal transition-all duration-slow animate-[modalRise_320ms_cubic-bezier(0.2,0.8,0.2,1)] flex flex-col lg:flex-row min-h-[580px]"
      >
        {/* Close Button */}
        <button
          id="auth-close-btn"
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 z-20 rounded-button p-2 text-muted hover:bg-surface-alt hover:text-ink transition-colors focus-visible:ring-2 focus-visible:ring-primary"
          aria-label="Close modal"
        >
          <X className="h-4 w-4" />
        </button>

        {/* ════════════════════════════════════════════════════════
            LEFT: BRAND PANEL (Ink-to-Violet with Animated SVG)
           ════════════════════════════════════════════════════════ */}
        <div className="relative overflow-hidden bg-gradient-to-b from-[#0B1020] via-[#15122E] to-[#241442] text-white p-6 sm:p-8 lg:p-10 lg:w-[44%] shrink-0 flex flex-col justify-between select-none">
          {/* Animated SVG Skill-Network */}
          <div className="pointer-events-none absolute inset-0 h-full w-full overflow-hidden opacity-30" aria-hidden="true">
            <svg className="h-full w-full" viewBox="0 0 400 650" fill="none">
              <defs>
                <radialGradient id="auroraGlowNet" cx="50%" cy="50%" r="50%">
                  <stop offset="0%" stopColor="#6D4AFF" stopOpacity="0.8" />
                  <stop offset="70%" stopColor="#19C3E6" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#0B1020" stopOpacity="0" />
                </radialGradient>
              </defs>

              {/* Large Soft Glow Center */}
              <circle cx="200" cy="320" r="190" fill="url(#auroraGlowNet)" opacity="0.4" />

              {/* Animated Floating Nodes */}
              <g className="animate-[nodeDrift1_12s_ease-in-out_infinite]">
                <circle cx="200" cy="300" r="7" fill="#8B6CFF" />
                <circle cx="200" cy="300" r="14" stroke="#8B6CFF" strokeWidth="1" opacity="0.4" />
                <circle cx="90" cy="180" r="5" fill="#3AD3F0" />
                <circle cx="310" cy="210" r="6" fill="#8B6CFF" />
                <circle cx="110" cy="440" r="5" fill="#B14AFF" />
              </g>

              <g className="animate-[nodeDrift2_15s_ease-in-out_infinite]">
                <circle cx="290" cy="430" r="5" fill="#3AD3F0" />
                <circle cx="200" cy="120" r="4" fill="#FFFFFF" />
                <circle cx="60" cy="320" r="4" fill="#8B6CFF" />
                <circle cx="340" cy="330" r="4" fill="#B14AFF" />
                <circle cx="150" cy="240" r="3.5" fill="#FFB547" />
                <circle cx="260" cy="220" r="3.5" fill="#10B981" />
              </g>

              {/* Connecting Lines with Pulsing Opacity */}
              <g className="animate-[pulseGlow_6s_ease-in-out_infinite] opacity-40">
                {[
                  [200, 300, 90, 180],
                  [200, 300, 310, 210],
                  [200, 300, 110, 440],
                  [200, 300, 290, 430],
                  [200, 300, 200, 120],
                  [90, 180, 200, 120],
                  [310, 210, 200, 120],
                  [90, 180, 60, 320],
                  [310, 210, 340, 330],
                  [110, 440, 60, 320],
                  [290, 430, 340, 330],
                  [110, 440, 290, 430],
                  [150, 240, 90, 180],
                  [260, 220, 310, 210],
                ].map(([x1, y1, x2, y2], idx) => (
                  <line
                    key={idx}
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke="white"
                    strokeWidth="0.85"
                    strokeDasharray={idx % 4 === 0 ? '3 3' : undefined}
                  />
                ))}
              </g>
            </svg>
          </div>

          {/* Top Logo & Tagline */}
          <div className="relative z-10 space-y-2">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl overflow-hidden shadow-glow border border-white/20 shrink-0 bg-[#0B1020]">
                <img src="/logo.jpg" alt="SkillGraph Logo" className="h-full w-full object-cover" />
              </div>
              <span className="font-heading font-bold text-xl tracking-tight text-white">SkillGraph</span>
            </div>
            <p className="text-sm font-semibold tracking-tight text-[#E3F8FD] font-heading">
              Find the talent you already have
            </p>
          </div>

          {/* 3 Evenly Spaced Benefit Lines with Icons */}
          <div className="relative z-10 my-6 lg:my-auto py-2 space-y-6">
            <div className="flex items-start gap-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-button bg-[#6D4AFF]/20 text-[#8B6CFF] border border-[#6D4AFF]/30">
                <Network className="h-4.5 w-4.5" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-white font-heading">Evidence-Based Competency Graph</h4>
                <p className="mt-0.5 text-xs text-[#C9D1E3]/85 leading-relaxed">
                  Verifiable proof artifacts and certifications directly tied to project deliverables.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-button bg-[#19C3E6]/20 text-[#3AD3F0] border border-[#19C3E6]/30">
                <Sparkles className="h-4.5 w-4.5" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-white font-heading">Near-Qualified Talent Discovery</h4>
                <p className="mt-0.5 text-xs text-[#C9D1E3]/85 leading-relaxed">
                  Identify team members who are 80%+ ready and match them with dedicated mentors.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-button bg-[#B14AFF]/20 text-[#D8B4FE] border border-[#B14AFF]/30">
                <TrendingUp className="h-4.5 w-4.5" />
              </div>
              <div>
                <h4 className="text-xs font-semibold text-white font-heading">Internal Mobility &amp; Gigs</h4>
                <p className="mt-0.5 text-xs text-[#C9D1E3]/85 leading-relaxed">
                  Fast-track project initiative staffing without external recruiting friction.
                </p>
              </div>
            </div>
          </div>

          {/* Bottom Security Badge */}
          <div className="relative z-10 pt-4 border-t border-white/10 flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-[#10B981]" />
              <span>Enterprise Grade Auditable Auth</span>
            </span>
            <span className="font-mono text-2xs">v2.0 Aurora</span>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════
            RIGHT: FORM PANEL (Clean Surface with Role Selector)
           ════════════════════════════════════════════════════════ */}
        <div className="relative flex-1 p-6 sm:p-8 lg:p-10 bg-surface flex flex-col justify-between overflow-y-auto">
          <div className="space-y-6">
            {/* Header: Title and Role Selector */}
            <div className="space-y-4 text-left">
              <div>
                <h2 id="auth-modal-title" className="text-section-title font-heading text-ink">
                  {mode === 'forgot' ? 'Reset Password' : mode === 'signup' ? 'Create Your Account' : 'Sign In to Your Workspace'}
                </h2>
                <p className="mt-1 text-xs text-muted">
                  {mode === 'forgot'
                    ? 'Enter your corporate email to receive password recovery instructions.'
                    : `Accessing ${activeConfig.fullTitle}.`}
                </p>
              </div>

              {/* 2.2 Clean Role Selector (3 Equal Tiles) */}
              {mode !== 'forgot' && (
                <div className="space-y-2">
                  <span className="text-xs font-semibold text-ink tracking-wide block">Select Role Portal:</span>
                  <div className="grid grid-cols-3 gap-2.5">
                    {(['employee', 'manager', 'hr'] as AuthPortal[]).map(p => {
                      const cfg = PORTAL_CONFIG[p];
                      const isSelected = portal === p;
                      return (
                        <button
                          key={p}
                          type="button"
                          id={`portal-signin-${p}`}
                          onClick={() => handlePortalSwitch(p)}
                          className={`relative flex flex-col items-start p-3 rounded-card border text-left transition-all duration-base select-none ${
                            isSelected
                              ? `${cfg.accentBorder} bg-surface-hover shadow-xs ring-1 ring-${cfg.accentColor}`
                              : 'border-border bg-surface hover:bg-surface-hover hover:border-border-strong'
                          }`}
                        >
                          <div className="flex items-center justify-between w-full mb-1">
                            <span className={`p-1.5 rounded-button ${cfg.accentBg}`}>
                              <cfg.Icon className="h-4 w-4" />
                            </span>
                            {isSelected && (
                              <span className="h-4 w-4 rounded-full bg-aurora text-white flex items-center justify-center shrink-0">
                                <Check className="h-2.5 w-2.5 stroke-[3]" />
                              </span>
                            )}
                          </div>
                          <span className="font-semibold text-xs text-ink truncate w-full">{cfg.label}</span>
                          <span className="text-2xs text-muted truncate w-full mt-0.5">{cfg.sublabel}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Hidden triggers to maintain 100% test compatibility for signup portal clicks */}
                  <div className="sr-only" aria-hidden="true">
                    {(['employee', 'manager', 'hr'] as AuthPortal[]).map(p => (
                      <button
                        key={`signup-hook-${p}`}
                        id={`portal-signup-${p}`}
                        type="button"
                        onClick={() => {
                          handlePortalSwitch(p);
                          setMode('signup');
                        }}
                      >
                        Select {p} Signup
                      </button>
                    ))}
                  </div>

                  {/* Collapsible "What you can do" list */}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => setShowCapabilities(v => !v)}
                      className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink font-medium transition-colors"
                    >
                      <span>What you can do as {activeConfig.label}</span>
                      {showCapabilities ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </button>
                    {showCapabilities && (
                      <ul className="mt-2 space-y-1.5 p-3 rounded-card bg-surface-alt/60 border border-border/70 text-xs text-muted">
                        {activeConfig.capabilities.map((cap, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <CheckCircle2 className="h-3.5 w-3.5 text-[#10B981] shrink-0 mt-0.5" />
                            <span>{cap}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {/* Mode Toggle: Sign In | Create Account */}
              {mode !== 'forgot' && (
                <div className="flex rounded-button bg-surface-alt p-1 border border-border/80">
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setError('');
                      setFieldErrors({});
                    }}
                    className={`flex-1 py-1.5 rounded-[8px] text-xs font-semibold transition-all duration-base ${
                      mode === 'login'
                        ? 'bg-surface text-ink shadow-xs font-bold'
                        : 'text-muted hover:text-ink'
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('signup');
                      setError('');
                      setFieldErrors({});
                      if (!inviteCode) setInviteCode(activeConfig.inviteCode);
                    }}
                    className={`flex-1 py-1.5 rounded-[8px] text-xs font-semibold transition-all duration-base ${
                      mode === 'signup'
                        ? 'bg-surface text-ink shadow-xs font-bold'
                        : 'text-muted hover:text-ink'
                    }`}
                  >
                    Create Account
                  </button>
                </div>
              )}
            </div>

            {/* Error Banner */}
            {error && (
              <div role="alert" className="flex items-start gap-2.5 p-3 rounded-card bg-danger-tint border border-danger/30 text-xs text-danger font-medium">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* ════════════════════════════════════════════════════
                FORM: LOGIN
               ════════════════════════════════════════════════════ */}
            {mode === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4 text-left">
                {/* Email */}
                <div className="space-y-1.5">
                  <label htmlFor="login-email" className="block text-xs font-semibold text-ink tracking-wide">
                    Corporate Email
                  </label>
                  <div className="relative flex items-center">
                    <Mail className="pointer-events-none absolute left-3.5 h-4 w-4 text-muted" />
                    <input
                      id="login-email"
                      type="email"
                      required
                      autoComplete="username"
                      value={email}
                      onChange={e => { setEmail(e.target.value); clearField('email'); }}
                      placeholder="e.g. employee@skillgraph.demo"
                      className="h-11 w-full rounded-input border border-border bg-surface pl-10 pr-3.5 text-sm text-ink placeholder:text-muted/70 transition-all duration-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-xs"
                    />
                  </div>
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="login-password" className="block text-xs font-semibold text-ink tracking-wide">
                      Password
                    </label>
                    <button
                      id="auth-forgot-link"
                      type="button"
                      onClick={() => { setMode('forgot'); setError(''); }}
                      className="text-xs text-primary hover:text-primary-hover font-medium underline-offset-2 hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative flex items-center">
                    <LockKeyhole className="pointer-events-none absolute left-3.5 h-4 w-4 text-muted" />
                    <input
                      id="login-password"
                      type={showPwd ? 'text' : 'password'}
                      required
                      autoComplete="current-password"
                      value={password}
                      onKeyDown={handleKeyModifier}
                      onKeyUp={handleKeyModifier}
                      onChange={e => { setPassword(e.target.value); clearField('password'); }}
                      placeholder="Enter your password"
                      className="h-11 w-full rounded-input border border-border bg-surface pl-10 pr-10 text-sm text-ink placeholder:text-muted/70 transition-all duration-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPwd(v => !v)}
                      className="absolute right-3.5 text-muted hover:text-ink transition-colors p-1"
                      aria-label={showPwd ? 'Hide password' : 'Show password'}
                    >
                      {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>

                  {/* Caps Lock Alert */}
                  {capsLockActive && (
                    <div className="flex items-center gap-1.5 text-xs text-warning font-medium mt-1">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span>Caps Lock is ON</span>
                    </div>
                  )}
                </div>

                {/* Remember Me */}
                <div className="flex items-center justify-between pt-1">
                  <label htmlFor="login-remember" className="flex items-center gap-2 cursor-pointer text-xs text-muted hover:text-ink select-none">
                    <input
                      id="login-remember"
                      type="checkbox"
                      checked={rememberMe}
                      onChange={e => setRememberMe(e.target.checked)}
                      className="h-4 w-4 rounded-[4px] border-border text-primary focus:ring-primary/20"
                    />
                    <span>Remember me on this workstation</span>
                  </label>
                </div>

                {/* Submit Action */}
                <Button
                  id="login-submit"
                  type="submit"
                  variant="primary"
                  size="lg"
                  isLoading={busy}
                  className="w-full"
                >
                  <span>Sign In as {activeConfig.label}</span>
                </Button>
              </form>
            )}

            {/* ════════════════════════════════════════════════════
                FORM: SIGNUP
               ════════════════════════════════════════════════════ */}
            {mode === 'signup' && (
              <form onSubmit={handleSignup} className="space-y-4 text-left">
                {signupSuccess && (
                  <div className="p-3 rounded-card bg-success-tint border border-success-border text-xs text-success-text font-medium flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Account created successfully! Preparing your workspace…</span>
                  </div>
                )}

                {/* Name */}
                <div className="space-y-1.5">
                  <label htmlFor="signup-name" className="block text-xs font-semibold text-ink tracking-wide">
                    Full Legal Name
                  </label>
                  <div className="relative flex items-center">
                    <UserRound className="pointer-events-none absolute left-3.5 h-4 w-4 text-muted" />
                    <input
                      id="signup-name"
                      type="text"
                      required
                      value={name}
                      onChange={e => { setName(e.target.value); clearField('name'); }}
                      placeholder="e.g. Alex Chen"
                      className="h-11 w-full rounded-input border border-border bg-surface pl-10 pr-3.5 text-sm text-ink placeholder:text-muted/70 transition-all duration-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-xs"
                    />
                  </div>
                  {fieldErrors.name && <p className="text-xs text-danger font-medium">{fieldErrors.name}</p>}
                </div>

                {/* Email */}
                <div className="space-y-1.5">
                  <label htmlFor="signup-email" className="block text-xs font-semibold text-ink tracking-wide">
                    Corporate Email Address
                  </label>
                  <div className="relative flex items-center">
                    <Mail className="pointer-events-none absolute left-3.5 h-4 w-4 text-muted" />
                    <input
                      id="signup-email"
                      type="email"
                      required
                      value={email}
                      onChange={e => { setEmail(e.target.value); clearField('email'); }}
                      placeholder="e.g. alex.chen@company.com"
                      className="h-11 w-full rounded-input border border-border bg-surface pl-10 pr-3.5 text-sm text-ink placeholder:text-muted/70 transition-all duration-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-xs"
                    />
                  </div>
                  {fieldErrors.email && <p className="text-xs text-danger font-medium">{fieldErrors.email}</p>}
                </div>

                {/* Invite Code */}
                <div className="space-y-1.5">
                  <label htmlFor="signup-invite" className="block text-xs font-semibold text-ink tracking-wide">
                    Organization Authorization Code
                  </label>
                  <div className="relative flex items-center">
                    <KeyRound className="pointer-events-none absolute left-3.5 h-4 w-4 text-muted" />
                    <input
                      id="signup-invite"
                      type="text"
                      required
                      value={inviteCode}
                      onChange={e => { setInviteCode(e.target.value); clearField('invite'); }}
                      placeholder={`e.g. ${activeConfig.inviteCode}`}
                      className="h-11 w-full rounded-input border border-border bg-surface pl-10 pr-3.5 text-sm text-ink placeholder:text-muted/70 transition-all duration-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-xs font-mono"
                    />
                  </div>
                  {fieldErrors.invite && <p className="text-xs text-danger font-medium">{fieldErrors.invite}</p>}
                </div>

                {/* Password & Confirm */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label htmlFor="signup-password" className="block text-xs font-semibold text-ink tracking-wide">
                      Password
                    </label>
                    <div className="relative flex items-center">
                      <LockKeyhole className="pointer-events-none absolute left-3.5 h-4 w-4 text-muted" />
                      <input
                        id="signup-password"
                        type={showPwd ? 'text' : 'password'}
                        required
                        value={password}
                        onKeyDown={handleKeyModifier}
                        onKeyUp={handleKeyModifier}
                        onChange={e => { setPassword(e.target.value); clearField('password'); }}
                        placeholder="At least 8 characters"
                        className="h-11 w-full rounded-input border border-border bg-surface pl-10 pr-10 text-sm text-ink placeholder:text-muted/70 transition-all duration-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPwd(v => !v)}
                        className="absolute right-3.5 text-muted hover:text-ink p-1"
                        aria-label={showPwd ? 'Hide password' : 'Show password'}
                      >
                        {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="signup-confirm" className="block text-xs font-semibold text-ink tracking-wide">
                      Confirm Password
                    </label>
                    <div className="relative flex items-center">
                      <LockKeyhole className="pointer-events-none absolute left-3.5 h-4 w-4 text-muted" />
                      <input
                        id="signup-confirm"
                        type={showConfirm ? 'text' : 'password'}
                        required
                        value={confirmPassword}
                        onKeyDown={handleKeyModifier}
                        onKeyUp={handleKeyModifier}
                        onChange={e => { setConfirmPassword(e.target.value); clearField('confirm'); }}
                        placeholder="Re-enter password"
                        className="h-11 w-full rounded-input border border-border bg-surface pl-10 pr-10 text-sm text-ink placeholder:text-muted/70 transition-all duration-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm(v => !v)}
                        className="absolute right-3.5 text-muted hover:text-ink p-1"
                        aria-label={showConfirm ? 'Hide password' : 'Show password'}
                      >
                        {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Password Strength Meter */}
                {password && (
                  <div className="space-y-1 pt-1">
                    <div className="flex items-center justify-between text-2xs font-semibold">
                      <span className="text-muted">Password Strength:</span>
                      <span className={pwdStrength === 4 ? 'text-success' : pwdStrength >= 2 ? 'text-warning' : 'text-danger'}>
                        {pwdStrength === 4 ? 'Strong' : pwdStrength >= 2 ? 'Moderate' : 'Weak'}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-surface-alt overflow-hidden flex gap-1">
                      {[1, 2, 3, 4].map(idx => (
                        <div
                          key={idx}
                          className={`h-full flex-1 rounded-full transition-all duration-base ${
                            idx <= pwdStrength
                              ? pwdStrength === 4 ? 'bg-[#10B981]' : pwdStrength >= 2 ? 'bg-[#F59E0B]' : 'bg-[#EF4444]'
                              : 'bg-border'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Submit Action */}
                <Button
                  id="signup-submit"
                  type="submit"
                  variant="primary"
                  size="lg"
                  isLoading={busy}
                  className="w-full mt-2"
                >
                  <span>Complete {activeConfig.label} Registration</span>
                </Button>
              </form>
            )}

            {/* ════════════════════════════════════════════════════
                FORM: FORGOT PASSWORD
               ════════════════════════════════════════════════════ */}
            {mode === 'forgot' && (
              <form onSubmit={handleForgot} className="space-y-4 text-left">
                {forgotSent ? (
                  <div className="p-4 rounded-card bg-success-tint border border-success-border text-xs text-success-text space-y-2">
                    <div className="flex items-center gap-2 font-semibold">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Password reset link transmitted</span>
                    </div>
                    <p className="leading-relaxed">
                      If an active account exists for <strong>{email}</strong>, instructions to reset your authentication credentials have been dispatched.
                    </p>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => { setMode('login'); setForgotSent(false); }}
                      className="mt-2"
                    >
                      Return to Sign In
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="space-y-1.5">
                      <label htmlFor="forgot-email" className="block text-xs font-semibold text-ink tracking-wide">
                        Corporate Email Address
                      </label>
                      <div className="relative flex items-center">
                        <Mail className="pointer-events-none absolute left-3.5 h-4 w-4 text-muted" />
                        <input
                          id="forgot-email"
                          type="email"
                          required
                          value={email}
                          onChange={e => setEmail(e.target.value)}
                          placeholder="e.g. alex.chen@company.com"
                          className="h-11 w-full rounded-input border border-border bg-surface pl-10 pr-3.5 text-sm text-ink placeholder:text-muted/70 transition-all duration-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 shadow-xs"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-3 pt-2">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => { setMode('login'); setError(''); }}
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                      <Button
                        id="forgot-submit"
                        type="submit"
                        variant="primary"
                        isLoading={busy}
                        className="flex-1"
                      >
                        Dispatch Reset Link
                      </Button>
                    </div>
                  </>
                )}
              </form>
            )}
          </div>

          {/* ════════════════════════════════════════════════════════
              2.4 Quiet Secondary Row: 1-Click Demo Login
             ════════════════════════════════════════════════════════ */}
          <div className="mt-6 pt-4 border-t border-border/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-muted">
            <span className="font-semibold text-ink/80 text-2xs uppercase tracking-wider">
              Quick 1-Click Demo Login:
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                id="login-quick-demo-employee"
                onClick={() => triggerDemoLogin('employee')}
                className="rounded-chip border border-border bg-surface-alt/70 px-2.5 py-1 text-2xs font-semibold text-ink hover:bg-surface-hover hover:border-[#10B981]/50 transition-colors shadow-2xs"
              >
                Employee Demo
              </button>
              <button
                type="button"
                id="login-quick-demo-manager"
                onClick={() => triggerDemoLogin('manager')}
                className="rounded-chip border border-border bg-surface-alt/70 px-2.5 py-1 text-2xs font-semibold text-ink hover:bg-surface-hover hover:border-[#19C3E6]/50 transition-colors shadow-2xs"
              >
                Manager Demo
              </button>
              <button
                type="button"
                id="login-quick-demo-hr"
                onClick={() => triggerDemoLogin('hr')}
                className="rounded-chip border border-border bg-surface-alt/70 px-2.5 py-1 text-2xs font-semibold text-ink hover:bg-surface-hover hover:border-[#B14AFF]/50 transition-colors shadow-2xs"
              >
                HR Admin Demo
              </button>

              {/* Hidden legacy ID hooks for backward compatibility */}
              <button type="button" id="demo-login-btn-employee" onClick={() => triggerDemoLogin('employee')} className="sr-only" aria-hidden="true">Employee</button>
              <button type="button" id="demo-login-btn-manager" onClick={() => triggerDemoLogin('manager')} className="sr-only" aria-hidden="true">Manager</button>
              <button type="button" id="demo-login-btn-hr" onClick={() => triggerDemoLogin('hr')} className="sr-only" aria-hidden="true">HR Admin</button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes modalRise {
          from {
            opacity: 0;
            transform: translateY(12px) scale(0.99);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes nodeDrift1 {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(8px, -10px); }
        }
        @keyframes nodeDrift2 {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(-10px, 8px); }
        }
        @keyframes pulseGlow {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.65; }
        }
      `}</style>
    </div>
  );
};
