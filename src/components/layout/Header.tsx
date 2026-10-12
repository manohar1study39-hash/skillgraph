import React, { useState, useRef, useEffect } from 'react';
import {
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  RefreshCw,
  Sun,
  Moon,
  HelpCircle,
  Shield,
  Briefcase,
  GraduationCap,
  LogOut,
  UserRound,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Theme, applyTheme, getInitialTheme } from '../../services/theme';
import { Avatar } from '../ui/Avatar';

interface HeaderProps {
  onQuickSearch: (query: string) => void;
  collapsed: boolean;
  onToggleSidebar: () => void;
  onOpenMobile: () => void;
  onSyncData?: () => Promise<void>;
  isSyncing?: boolean;
  user?: { name: string; role: 'HR_Admin' | 'Manager' | 'Employee'; email?: string } | null;
  activeTab?: string;
  onLogout?: () => void;
  onUserMgmt?: () => void;
}

const TAB_TITLES: Record<string, { title: string; subtitle: string }> = {
  search: { title: 'Talent Search', subtitle: 'Find verified employee competencies & fit scores' },
  directory: { title: 'Employee Directory', subtitle: 'Company personnel, teams, and availability records' },
  graph: { title: 'Skill Graph', subtitle: 'Interactive ontology mapping & competency relationships' },
  upskilling: { title: 'Upskilling & Readiness', subtitle: 'Target initiative gap analysis & learning tracks' },
  marketplace: { title: 'Internal Marketplace', subtitle: 'Initiative staffing, project gigs, and mobility' },
  'employee-hub': { title: 'My Career Hub', subtitle: 'Verified skill proofs, availability, and growth' },
};

export const Header: React.FC<HeaderProps> = ({
  onQuickSearch,
  collapsed,
  onToggleSidebar,
  onOpenMobile,
  onSyncData,
  isSyncing = false,
  user,
  activeTab = 'search',
  onLogout,
  onUserMgmt,
}) => {
  const [searchInput, setSearchInput] = useState('');
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [showHelp, setShowHelp] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const helpRef = useRef<HTMLDivElement>(null);

  // Keyboard shortcut listener: `/` or `Cmd+K` / `Ctrl+K` focuses global search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput = activeEl?.tagName === 'INPUT' || activeEl?.tagName === 'TEXTAREA';
      if (e.key === '/' && !isInput) {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close menus on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
      if (helpRef.current && !helpRef.current.contains(e.target as Node)) {
        setShowHelp(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleTheme = () => {
    const nextTheme: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    applyTheme(nextTheme);
  };

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    if (searchInput.trim()) onQuickSearch(searchInput);
  };

  const currentMeta = TAB_TITLES[activeTab] || { title: 'Enterprise Workspace', subtitle: 'Talent Intelligence' };

  const roleAccents = {
    Employee: {
      label: 'Employee',
      Icon: GraduationCap,
      dotClass: 'bg-[#10B981]',
      badgeClass: 'bg-[#10B981]/10 text-[#059669] border-[#10B981]/30 dark:bg-[#10B981]/15 dark:text-[#34D399]',
      avatarRole: 'Employee' as const,
    },
    Manager: {
      label: 'Manager',
      Icon: Briefcase,
      dotClass: 'bg-[#19C3E6]',
      badgeClass: 'bg-[#19C3E6]/10 text-[#0284C7] border-[#19C3E6]/30 dark:bg-[#19C3E6]/15 dark:text-[#3AD3F0]',
      avatarRole: 'Manager' as const,
    },
    HR_Admin: {
      label: 'HR Admin',
      Icon: Shield,
      dotClass: 'bg-[#B14AFF]',
      badgeClass: 'bg-[#B14AFF]/10 text-[#7C3AED] border-[#B14AFF]/30 dark:bg-[#B14AFF]/15 dark:text-[#D8B4FE]',
      avatarRole: 'HR_Admin' as const,
    },
  };

  const roleCfg = user?.role ? roleAccents[user.role] : null;

  return (
    <header className="sticky top-0 z-30 flex h-14 sm:h-16 shrink-0 items-center justify-between gap-3 sm:gap-4 border-b border-border/80 bg-surface/80 backdrop-blur-md px-3.5 sm:px-6 transition-colors duration-base select-none">
      {/* Left side: Hamburger, Sidebar toggle, and Breadcrumb + Page Subtitle */}
      <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
        <button
          onClick={onOpenMobile}
          aria-label="Open navigation"
          className="rounded-xl p-2 text-text-muted hover:bg-surface-alt hover:text-text-primary transition-colors md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>

        <button
          onClick={onToggleSidebar}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="hidden rounded-xl p-2 text-text-muted hover:bg-surface-alt hover:text-text-primary transition-colors md:flex items-center justify-center"
        >
          {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>

        {/* Collapsed Brand Mark on Desktop */}
        {collapsed && (
          <div className="hidden md:flex h-7 w-7 items-center justify-center rounded-lg overflow-hidden shadow-xs border border-border shrink-0 bg-[#0B1020]">
            <img src="/logo.jpg" alt="SkillGraph Logo" className="h-full w-full object-cover" />
          </div>
        )}

        {/* Breadcrumb showing Section / Page with page subtitle below in 13px muted text */}
        <div className="hidden sm:flex flex-col text-left">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="text-xs font-semibold text-text-muted">SkillGraph</span>
            <span className="text-2xs text-text-muted">/</span>
            <span className="text-xs sm:text-sm font-heading font-semibold text-text-primary">
              {currentMeta.title}
            </span>
            {roleCfg && (
              <span
                className={`hidden lg:inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-2xs font-semibold border ${roleCfg.badgeClass}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${roleCfg.dotClass}`} />
                <span>{roleCfg.label}</span>
              </span>
            )}
          </div>
          <span className="text-[13px] leading-tight text-text-muted hidden md:inline truncate max-w-md">
            {currentMeta.subtitle}
          </span>
        </div>

        {/* Mobile Header Logo */}
        <div className="sm:hidden flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg overflow-hidden shadow-xs border border-border shrink-0 bg-[#0B1020]">
            <img src="/logo.jpg" alt="SkillGraph Logo" className="h-full w-full object-cover" />
          </div>
          <span className="text-xs font-heading font-bold text-text-primary">SkillGraph</span>
        </div>
      </div>

      {/* Right side: Sync (Authenticated only), Search, Help, Theme Toggle, User Avatar */}
      <div className="flex items-center gap-2 sm:gap-2.5 justify-end">
        {/* Sync Data Button: strictly visible only for authenticated HR, Manager, and Employee */}
        {user && onSyncData && (
          <button
            onClick={() => void onSyncData()}
            disabled={isSyncing}
            title="Sync Company Records"
            className={`flex items-center gap-1.5 rounded-xl border border-border bg-surface hover:bg-surface-alt hover:border-border-strong px-2.5 sm:px-3 text-xs font-semibold text-text-muted hover:text-text-primary shadow-2xs transition-all disabled:opacity-50 shrink-0 h-10 ${
              isSyncing ? 'ring-2 ring-primary/30 animate-pulse' : ''
            }`}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin text-primary' : 'text-text-muted'}`}
            />
            <span className="hidden lg:inline">{isSyncing ? 'Syncing...' : 'Sync Data'}</span>
          </button>
        )}

        {/* Global Search Trigger (40px tall, with keyboard shortcut hint) */}
        <form onSubmit={handleSearch} role="search" className="relative w-36 sm:w-56 md:w-64">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            ref={searchInputRef}
            value={searchInput}
            onChange={event => setSearchInput(event.target.value)}
            placeholder="Search skills, talent..."
            aria-label="Global search"
            className="w-full h-10 rounded-xl border border-border bg-surface-alt/70 py-1.5 pl-8 pr-12 text-xs text-text-primary placeholder:text-text-muted transition-all focus:bg-surface focus:border-primary focus:ring-2 focus:ring-primary/15 focus:outline-none"
          />
          <kbd className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-[6px] bg-surface border border-border px-1.5 py-0.5 text-[10px] font-mono font-semibold text-text-muted shadow-2xs pointer-events-none hidden sm:inline-block">
            /
          </kbd>
        </form>

        {/* Role Pill on Medium Screens if not visible in breadcrumb */}
        {roleCfg && (
          <span
            className={`inline-flex lg:hidden items-center gap-1 rounded-full px-2 py-1 text-2xs font-semibold border ${roleCfg.badgeClass}`}
            title={`Role: ${roleCfg.label}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${roleCfg.dotClass}`} />
            <span className="hidden sm:inline">{roleCfg.label}</span>
          </span>
        )}

        {/* Help button with popover */}
        <div ref={helpRef} className="relative">
          <button
            onClick={() => setShowHelp(v => !v)}
            title="Help & Quick Guide"
            aria-label="Help and guidance"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface hover:bg-surface-alt text-text-muted hover:text-text-primary transition-colors shadow-2xs"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
          {showHelp && (
            <div className="absolute right-0 top-full mt-2 w-72 rounded-card border border-border bg-surface p-4 shadow-modal z-50 text-left animate-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-border/80">
                <span className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                  <HelpCircle className="h-4 w-4 text-primary" />
                  Quick Help &amp; Guide
                </span>
                <button
                  onClick={() => setShowHelp(false)}
                  className="text-text-muted hover:text-text-primary text-xs"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-2 text-2xs text-text-muted leading-relaxed">
                <p>
                  <strong className="text-text-primary">Talent Search:</strong> Natural language query or skill filters to find matching personnel.
                </p>
                <p>
                  <strong className="text-text-primary">Skill Graph:</strong> Interactive visualization of verified competencies across teams.
                </p>
                <p>
                  <strong className="text-text-primary">Upskilling:</strong> Identifies near-qualified candidates and recommends mentors.
                </p>
                <p>
                  <strong className="text-text-primary">Marketplace:</strong> Internal initiative gigs and team member allocations.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Theme Toggle Button with Smooth Morph Animation (40px tall) */}
        <button
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label="Toggle color theme"
          className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface hover:bg-surface-alt text-text-muted hover:text-text-primary transition-colors shadow-2xs overflow-hidden"
        >
          <AnimatePresence mode="wait" initial={false}>
            {theme === 'dark' ? (
              <motion.div
                key="moon"
                initial={{ opacity: 0, rotate: -90, scale: 0.5 }}
                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                exit={{ opacity: 0, rotate: 90, scale: 0.5 }}
                transition={{ duration: 0.2 }}
                className="flex items-center justify-center text-amber-400"
              >
                <Sun className="h-4 w-4" />
              </motion.div>
            ) : (
              <motion.div
                key="sun"
                initial={{ opacity: 0, rotate: 90, scale: 0.5 }}
                animate={{ opacity: 1, rotate: 0, scale: 1 }}
                exit={{ opacity: 0, rotate: -90, scale: 0.5 }}
                transition={{ duration: 0.2 }}
                className="flex items-center justify-center text-slate-700"
              >
                <Moon className="h-4 w-4" />
              </motion.div>
            )}
          </AnimatePresence>
        </button>

        {/* User Avatar in Header (links to profile or opens menu) */}
        {user && (
          <div ref={userMenuRef} className="relative">
            <button
              onClick={() => setShowUserMenu(v => !v)}
              aria-label="User profile menu"
              className="flex items-center rounded-full focus:outline-none focus:ring-2 focus:ring-primary/20 transition-transform active:scale-95"
            >
              <Avatar
                name={user.name}
                role={roleCfg?.avatarRole}
                size="sm"
                className="cursor-pointer"
              />
            </button>

            {/* User Dropdown Menu */}
            {showUserMenu && (
              <div className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-border bg-surface p-1.5 shadow-modal text-left animate-in zoom-in-95 duration-150 z-50">
                <div className="px-3 py-2 border-b border-border/80 mb-1">
                  <p className="text-xs font-bold text-text-primary truncate">{user.name}</p>
                  <p className="text-2xs text-text-muted truncate">{user.email || `${user.name.toLowerCase().replace(/\s+/g, '.')}@skillgraph.demo`}</p>
                  <span
                    className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold border ${roleCfg?.badgeClass}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${roleCfg?.dotClass}`} />
                    <span>{roleCfg?.label}</span>
                  </span>
                </div>

                {user.role === 'HR_Admin' && onUserMgmt && (
                  <button
                    id="topbar-user-mgmt-btn"
                    onClick={() => {
                      setShowUserMenu(false);
                      onUserMgmt();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-text-secondary hover:bg-surface-alt hover:text-text-primary transition-colors cursor-pointer"
                  >
                    <Shield className="h-3.5 w-3.5 text-[#B14AFF]" />
                    <span>User management</span>
                  </button>
                )}

                {onLogout && (
                  <button
                    onClick={() => {
                      setShowUserMenu(false);
                      onLogout();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-danger hover:bg-danger/10 transition-colors"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Log out</span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
