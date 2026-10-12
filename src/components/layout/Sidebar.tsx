import React, { useState, useRef, useEffect } from 'react';
import {
  Search,
  Network,
  GraduationCap,
  Briefcase,
  UserRound,
  LogOut,
  Shield,
  LogIn,
  UserPlus,
  Users,
  MoreVertical,
} from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import { Tooltip } from '../ui/Tooltip';

export type NavTab = 'search' | 'directory' | 'graph' | 'upskilling' | 'marketplace' | 'employee-hub';

interface SidebarProps {
  activeTab: NavTab;
  setActiveTab: (tab: NavTab) => void;
  nearQualifiedCount?: number;
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  user: { name: string; role: 'HR_Admin' | 'Manager' | 'Employee'; email?: string } | null;
  onSignIn: () => void;
  onSignUp: () => void;
  onLogout: () => void;
  onUserMgmt: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  nearQualifiedCount,
  collapsed,
  mobileOpen,
  onCloseMobile,
  user,
  onSignIn,
  onSignUp,
  onLogout,
  onUserMgmt,
}) => {
  const [profileOpen, setProfileOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const isEmployee = user?.role === 'Employee';

  // Close profile popover on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    };
    if (profileOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [profileOpen]);

  // Keep exact nav items and order for all three roles from requirements
  const navItems = isEmployee
    ? [
        { id: 'employee-hub' as const, label: 'My Career Hub', icon: UserRound },
        { id: 'directory' as const, label: 'Employee Directory', icon: Users },
        { id: 'upskilling' as const, label: 'My Upskilling', icon: GraduationCap },
        { id: 'marketplace' as const, label: 'Opportunities', icon: Briefcase },
        { id: 'graph' as const, label: 'Skill Graph', icon: Network },
      ]
    : [
        { id: 'search' as const, label: 'Talent Search', icon: Search },
        { id: 'directory' as const, label: 'Employee Directory', icon: Users },
        { id: 'graph' as const, label: 'Skill Graph', icon: Network },
        { id: 'upskilling' as const, label: 'Upskilling & Gaps', icon: GraduationCap },
        { id: 'marketplace' as const, label: 'Internal Marketplace', icon: Briefcase },
      ];

  const width = collapsed ? 'md:w-[72px]' : 'md:w-[264px]';

  const roleConfigs = {
    Employee: {
      label: 'Employee',
      accentDot: 'bg-[#10B981]',
      badgeClass: 'bg-[#10B981]/15 text-[#34D399] border-[#10B981]/30',
      activeText: 'text-white',
      avatarRole: 'Employee' as const,
    },
    Manager: {
      label: 'Manager',
      accentDot: 'bg-[#19C3E6]',
      badgeClass: 'bg-[#19C3E6]/15 text-[#3AD3F0] border-[#19C3E6]/30',
      activeText: 'text-white',
      avatarRole: 'Manager' as const,
    },
    HR_Admin: {
      label: 'HR Admin',
      accentDot: 'bg-[#B14AFF]',
      badgeClass: 'bg-[#B14AFF]/15 text-[#D8B4FE] border-[#B14AFF]/30',
      activeText: 'text-white',
      avatarRole: 'HR_Admin' as const,
    },
  };

  const roleStyle = user ? roleConfigs[user.role] : null;

  const content = (
    <aside
      className={`fixed inset-y-0 left-0 z-50 flex w-[264px] shrink-0 flex-col bg-gradient-to-b from-[#0B1020] via-[#080D1A] to-[#04070F] text-slate-300 border-r border-[#19223A] transition-[width,transform] duration-200 ease-aurora ${width} ${
        mobileOpen ? 'translate-x-0' : '-translate-x-full'
      } md:relative md:translate-x-0 select-none shadow-2xl md:shadow-none`}
    >
      {/* Sidebar Header with Logo & Role Badge */}
      <div className={`shrink-0 border-b border-[#19223A]/80 ${collapsed ? 'p-3 md:px-3.5' : 'p-5'}`}>
        <div className={`flex items-center justify-between ${collapsed ? 'md:justify-center' : ''}`}>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl overflow-hidden shadow-glow border border-white/20 shrink-0 bg-[#0B1020]">
              <img src="/logo.jpg" alt="SkillGraph Logo" className="h-full w-full object-cover" />
            </div>
            {!collapsed && (
              <span className="text-lg font-heading font-bold tracking-tight text-white">
                SkillGraph
              </span>
            )}
          </div>
        </div>

        {/* Role badge under logo: single-line, rounded-full, with role accent dot */}
        {roleStyle && !collapsed && (
          <div className="mt-3 flex items-center">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-2xs font-semibold border ${roleStyle.badgeClass}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${roleStyle.accentDot} shadow-xs`} />
              <span>{roleStyle.label} Workspace</span>
            </span>
          </div>
        )}

        {/* Collapsed dot indicator under logo-mark */}
        {roleStyle && collapsed && (
          <div className="mt-2 hidden md:flex justify-center">
            <span
              title={`${roleStyle.label} Workspace`}
              className={`h-2 w-2 rounded-full ${roleStyle.accentDot} ring-2 ring-[#0B1020]`}
            />
          </div>
        )}

        {/* Guest signin actions if not logged in */}
        {!user && (
          <>
            <div className={`mt-4 grid grid-cols-2 gap-2 ${collapsed ? 'md:hidden' : ''}`}>
              <button
                id="sidebar-signin-btn"
                onClick={onSignIn}
                className="aurora-btn-primary flex items-center justify-center gap-1.5 rounded-[10px] px-3 py-2 text-xs font-semibold text-white shadow-xs"
              >
                <LogIn className="h-3.5 w-3.5 shrink-0" />
                <span>Sign in</span>
              </button>
              <button
                id="sidebar-signup-btn"
                onClick={onSignUp}
                className="flex items-center justify-center gap-1.5 rounded-[10px] border border-[#222B44] bg-[#0E1424]/80 px-3 py-2 text-xs font-semibold text-white hover:bg-[#141B2F] transition-colors"
              >
                <UserPlus className="h-3.5 w-3.5 shrink-0" />
                <span>Sign up</span>
              </button>
            </div>
            {collapsed && (
              <div className="mt-4 hidden md:flex justify-center">
                <Tooltip content="Sign in" position="right">
                  <button
                    title="Sign in"
                    aria-label="Sign in"
                    onClick={onSignIn}
                    className="aurora-btn-primary h-9 w-9 flex items-center justify-center rounded-[10px] text-white"
                  >
                    <LogIn className="h-4 w-4" />
                  </button>
                </Tooltip>
              </div>
            )}
          </>
        )}
      </div>

      {/* Navigation Links */}
      <nav aria-label="Main navigation" className="space-y-1 p-3 flex-1 overflow-y-auto">
        {navItems.map(({ id, label, icon: Icon }) => {
          const isActive = activeTab === id;

          const buttonNode = (
            <button
              id={`nav-item-${id}`}
              onClick={() => {
                setActiveTab(id);
                onCloseMobile();
              }}
              className={`group relative flex w-full h-11 items-center justify-between rounded-xl px-3 text-left text-xs font-semibold transition-all duration-base ${
                isActive
                  ? 'bg-white/[0.08] text-white shadow-2xs'
                  : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
              }`}
            >
              {/* 3px vertical Aurora gradient indicator bar on left edge */}
              {isActive && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-aurora shadow-xs" />
              )}

              <span className={`flex min-w-0 items-center gap-3 ${collapsed ? 'md:mx-auto' : ''}`}>
                <Icon
                  className={`h-4 w-4 shrink-0 transition-colors ${
                    isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'
                  }`}
                />
                <span className={`truncate ${collapsed ? 'md:hidden' : ''}`}>{label}</span>
              </span>
            </button>
          );

          if (collapsed) {
            return (
              <div key={id} className="relative flex justify-center">
                <Tooltip content={label} position="right" className="w-full">
                  {buttonNode}
                </Tooltip>
              </div>
            );
          }

          return <div key={id}>{buttonNode}</div>;
        })}
      </nav>

      {/* Pinned User Card at Bottom: avatar with role accent ring, name, role, 3-dots popover */}
      {user && (
        <div ref={popoverRef} className="mt-auto border-t border-[#19223A]/80 p-3">
          <div className="relative">
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              className={`flex w-full items-center gap-2.5 rounded-xl border border-[#19223A] bg-[#0E1424]/70 p-2 text-left hover:bg-[#141B2F] hover:border-[#222B44] transition-all duration-base ${
                collapsed ? 'md:justify-center' : ''
              }`}
              aria-expanded={profileOpen}
              aria-label="User account menu"
            >
              <div className="relative shrink-0">
                <Avatar
                  name={user.name}
                  role={roleStyle?.avatarRole}
                  size="sm"
                  className="rounded-full"
                />
                <span
                  className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full ${roleStyle?.accentDot || 'bg-emerald-400'} ring-1 ring-[#0B1020]`}
                />
              </div>

              <span className={`${collapsed ? 'md:hidden' : ''} min-w-0 flex-1`}>
                <span className="block truncate text-xs font-bold text-white">{user.name}</span>
                <span className="block truncate text-2xs text-slate-400">
                  {roleStyle?.label || user.role}
                </span>
              </span>

              <MoreVertical
                className={`h-4 w-4 text-slate-400 shrink-0 ${collapsed ? 'md:hidden' : ''}`}
              />
            </button>

            {/* Profile Popover Menu */}
            {profileOpen && (
              <div
                className={`absolute bottom-full mb-2 rounded-xl border border-[#222B44] bg-[#0B1020] p-1.5 shadow-popover text-left animate-in zoom-in-95 duration-150 z-50 ${
                  collapsed ? 'left-0 w-52' : 'left-0 right-0 w-full'
                }`}
              >
                {/* User Info Header */}
                <div className="px-3 py-2 border-b border-[#19223A] mb-1">
                  <p className="text-xs font-bold text-white truncate">{user.name}</p>
                  <p className="text-2xs text-slate-400 truncate">{user.email || `${user.name.toLowerCase().replace(/\s+/g, '.')}@skillgraph.demo`}</p>
                  <span
                    className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-semibold border ${roleStyle?.badgeClass}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${roleStyle?.accentDot}`} />
                    <span>{roleStyle?.label}</span>
                  </span>
                </div>

                {user.role === 'HR_Admin' && (
                  <button
                    id="sidebar-user-mgmt-btn"
                    onClick={() => {
                      setProfileOpen(false);
                      onUserMgmt();
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/[0.08] transition-colors cursor-pointer"
                  >
                    <Shield className="h-3.5 w-3.5 text-[#B14AFF]" />
                    <span>User management</span>
                  </button>
                )}

                <button
                  onClick={() => {
                    setProfileOpen(false);
                    onLogout();
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-rose-400 hover:bg-rose-500/10 transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Log out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );

  return (
    <>
      {mobileOpen && (
        <button
          aria-label="Close navigation"
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-[#070B16]/80 backdrop-blur-xs md:hidden"
        />
      )}
      {content}
    </>
  );
};
