import React, { useEffect, useState } from 'react';
import {
  AlertCircle, Check, ChevronDown, ChevronUp, ClipboardList,
  LoaderCircle, Shield, ShieldOff, UserCheck,
  UserMinus, UsersRound, X,
} from 'lucide-react';

type PanelTab = 'pending' | 'active' | 'audit';

interface PendingUser  { user_id: string; name: string; email: string; role: string }
interface ActiveUser   { user_id: string; name: string; email: string; role: string }
interface AuditEntry   {
  event_id: string; event_type: string; actor_id: string; actor_email: string;
  target_id: string; target_email: string; ip: string; timestamp: string; details: string;
}

interface Props {
  currentUserId: string;
  onClose: () => void;
  onShowToast: (msg: string) => void;
}

/* ── Helpers ──────────────────────────────────────────────── */
const RoleBadge: React.FC<{ role: string }> = ({ role }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-2xs font-bold border transition-colors ${
      role === 'HR_Admin'
        ? 'bg-[#B14AFF]/10 text-[#B14AFF] border-[#B14AFF]/30'
        : 'bg-[#19C3E6]/10 text-[#19C3E6] border-[#19C3E6]/30'
    }`}
  >
    {role === 'HR_Admin' ? <Shield className="h-2.5 w-2.5" /> : null}
    {role === 'HR_Admin' ? 'HR Admin' : 'Manager'}
  </span>
);

const EventTypeBadge: React.FC<{ type: string }> = ({ type }) => {
  const styles: Record<string, string> = {
    LOGIN_SUCCESS:   'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    LOGIN_FAILURE:   'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30',
    LOGOUT:          'bg-slate-500/10 text-slate-400 border-slate-500/30',
    SIGNUP:          'bg-[#B14AFF]/10 text-[#B14AFF] border-[#B14AFF]/30',
    APPROVE_USER:    'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    REJECT_USER:     'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30',
    DEACTIVATE_USER: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30',
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-2xs font-semibold border ${styles[type] ?? 'bg-slate-500/10 text-text-muted border-border'}`}>
      {type.replace(/_/g, ' ')}
    </span>
  );
};

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface-muted/50 px-6 py-12 text-center">
    <p className="text-sm font-medium text-text-muted">{message}</p>
  </div>
);

/* ── Main component ───────────────────────────────────────── */
export const UserManagementPanel: React.FC<Props> = ({ currentUserId, onClose, onShowToast }) => {
  const [tab, setTab]           = useState<PanelTab>('pending');
  const [pending, setPending]   = useState<PendingUser[]>([]);
  const [active, setActive]     = useState<ActiveUser[]>([]);
  const [audit, setAudit]       = useState<AuditEntry[]>([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [busy, setBusy]         = useState<Record<string, boolean>>({});
  const [sortAsc, setSortAsc]   = useState(false);

  /* ── Data loaders ── */
  const loadPending = async () => {
    setLoading(true); setError('');
    try {
      const res  = await fetch('/api/pending-approvals', { credentials: 'same-origin' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPending(data.users);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load pending accounts.'); }
    finally { setLoading(false); }
  };

  const loadActive = async () => {
    setLoading(true); setError('');
    try {
      const res  = await fetch('/api/active-users', { credentials: 'same-origin' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setActive(data.users);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load active users.'); }
    finally { setLoading(false); }
  };

  const loadAudit = async () => {
    setLoading(true); setError('');
    try {
      const res  = await fetch('/api/audit-log', { credentials: 'same-origin' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setAudit(data.entries);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not load audit log.'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (tab === 'pending') loadPending();
    else if (tab === 'active') loadActive();
    else loadAudit();
  }, [tab]);

  /* ── Actions ── */
  const withBusy = async (id: string, fn: () => Promise<void>) => {
    setBusy(p => ({ ...p, [id]: true }));
    try { await fn(); }
    finally { setBusy(p => ({ ...p, [id]: false })); }
  };

  const approveUser = (id: string) => withBusy(`approve-${id}`, async () => {
    const res = await fetch(`/api/approvals/${encodeURIComponent(id)}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } });
    if (!res.ok) { onShowToast('Could not approve account.'); return; }
    setPending(p => p.filter(u => u.user_id !== id));
    onShowToast('Account approved — user can now sign in.');
  });

  const rejectUser = (id: string, name: string) => withBusy(`reject-${id}`, async () => {
    if (!window.confirm(`Remove the pending account for "${name}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/reject-approval/${encodeURIComponent(id)}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } });
    if (!res.ok) { onShowToast('Could not reject account.'); return; }
    setPending(p => p.filter(u => u.user_id !== id));
    onShowToast('Pending account removed.');
  });

  const deactivateUser = (id: string, name: string) => withBusy(`deactivate-${id}`, async () => {
    if (!window.confirm(`Deactivate the account for "${name}"? They will be signed out and unable to log in.`)) return;
    const res = await fetch(`/api/deactivate-user/${encodeURIComponent(id)}`, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' } });
    if (!res.ok) { const d = await res.json(); onShowToast(d.error || 'Could not deactivate account.'); return; }
    setActive(p => p.filter(u => u.user_id !== id));
    onShowToast(`${name}'s account has been deactivated.`);
  });

  /* ── Sorted audit ── */
  const sortedAudit = [...audit].sort((a, b) =>
    sortAsc
      ? a.timestamp.localeCompare(b.timestamp)
      : b.timestamp.localeCompare(a.timestamp)
  );

  const tabs: { id: PanelTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'pending', label: 'Pending Approvals', icon: <UserCheck className="h-4 w-4" />, count: pending.length },
    { id: 'active',  label: 'Active Users',      icon: <UsersRound className="h-4 w-4" /> },
    { id: 'audit',   label: 'Audit Trail',       icon: <ClipboardList className="h-4 w-4" /> },
  ];

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200"
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="um-title"
        className="flex w-full max-w-3xl flex-col rounded-2xl border border-border bg-surface shadow-2xl overflow-hidden transition-all max-h-[90vh]"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-surface-muted/60 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#B14AFF]/10 text-[#B14AFF] border border-[#B14AFF]/20">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h2 id="um-title" className="text-base font-sora font-semibold text-text-primary">
                HR Governance &amp; User Management
              </h2>
              <p className="text-xs text-text-muted">Review pending authorizations, monitor active corporate accounts, and inspect audit logs.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            id="um-close-btn"
            className="rounded-lg p-2 text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tabs Bar */}
        <div className="flex gap-2 border-b border-border bg-surface-muted/30 px-6 pt-3">
          {tabs.map(t => {
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                id={`um-tab-${t.id}`}
                onClick={() => setTab(t.id)}
                className={`relative flex items-center gap-2 rounded-t-xl px-4 py-2.5 text-xs font-sora font-semibold transition-all cursor-pointer ${
                  isActive
                    ? 'border-b-2 border-[#B14AFF] text-[#B14AFF] bg-surface shadow-2xs font-bold'
                    : 'text-text-muted hover:text-text-primary hover:bg-surface-elevated'
                }`}
              >
                {t.icon}
                <span>{t.label}</span>
                {t.count !== undefined && t.count > 0 && (
                  <span className="rounded-full bg-rose-500 px-1.5 py-0.2 text-[10px] font-mono tabular-nums font-bold text-white shadow-xs">
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="flex items-center justify-center gap-2.5 py-12 text-sm text-text-muted">
              <LoaderCircle className="h-5 w-5 animate-spin text-[#B14AFF]" />
              <span>Loading records…</span>
            </div>
          )}
          {!loading && error && (
            <div className="flex items-center gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-600 dark:text-rose-400">
              <AlertCircle className="h-5 w-5 shrink-0 text-rose-500" />
              <span>{error}</span>
            </div>
          )}

          {/* ── Pending tab ── */}
          {!loading && !error && tab === 'pending' && (
            <>
              {pending.length === 0
                ? <EmptyState message="No pending account requests — you're all caught up." />
                : (
                  <ul className="divide-y divide-border">
                    {pending.map(u => (
                      <li key={u.user_id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#B14AFF]/10 text-[#B14AFF] font-bold text-xs border border-[#B14AFF]/20">
                            {u.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-sora font-semibold text-text-primary">{u.name}</p>
                              <RoleBadge role={u.role} />
                            </div>
                            <p className="truncate text-xs text-text-muted font-mono">{u.email}</p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
                          <button
                            id={`um-approve-${u.user_id}`}
                            onClick={() => approveUser(u.user_id)}
                            disabled={busy[`approve-${u.user_id}`]}
                            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500 px-3.5 py-1.5 text-xs font-sora font-semibold transition-all shadow-2xs disabled:opacity-50 cursor-pointer"
                          >
                            {busy[`approve-${u.user_id}`]
                              ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                              : <Check className="h-3.5 w-3.5" />}
                            <span>Approve</span>
                          </button>
                          <button
                            id={`um-reject-${u.user_id}`}
                            onClick={() => rejectUser(u.user_id, u.name)}
                            disabled={busy[`reject-${u.user_id}`]}
                            className="flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400 hover:bg-rose-500/20 px-3.5 py-1.5 text-xs font-sora font-semibold transition-all disabled:opacity-50 cursor-pointer"
                          >
                            {busy[`reject-${u.user_id}`]
                              ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                              : <X className="h-3.5 w-3.5" />}
                            <span>Reject</span>
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
            </>
          )}

          {/* ── Active users tab ── */}
          {!loading && !error && tab === 'active' && (
            <>
              {active.length === 0
                ? <EmptyState message="No active accounts found." />
                : (
                  <ul className="divide-y divide-border">
                    {active.map(u => (
                      <li key={u.user_id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold border ${
                            u.role === 'HR_Admin'
                              ? 'bg-[#B14AFF]/10 text-[#B14AFF] border-[#B14AFF]/20'
                              : 'bg-[#19C3E6]/10 text-[#19C3E6] border-[#19C3E6]/20'
                          }`}>
                            {u.name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm font-sora font-semibold text-text-primary">{u.name}</p>
                              <RoleBadge role={u.role} />
                            </div>
                            <p className="truncate text-xs text-text-muted font-mono">{u.email}</p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2 self-end sm:self-center">
                          {u.user_id !== currentUserId && (
                            <button
                              id={`um-deactivate-${u.user_id}`}
                              onClick={() => deactivateUser(u.user_id, u.name)}
                              disabled={busy[`deactivate-${u.user_id}`]}
                              className="flex items-center gap-1.5 rounded-xl border border-border bg-surface text-text-muted hover:border-rose-400 hover:text-rose-500 px-3 py-1.5 text-xs font-sora font-semibold transition-all disabled:opacity-50 cursor-pointer"
                            >
                              {busy[`deactivate-${u.user_id}`]
                                ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                                : <UserMinus className="h-3.5 w-3.5" />}
                              <span>Deactivate</span>
                            </button>
                          )}
                          {u.user_id === currentUserId && (
                            <span className="rounded-full bg-[#B14AFF]/10 border border-[#B14AFF]/30 px-3 py-1 text-2xs font-sora font-bold text-[#B14AFF]">
                              Current Session (You)
                            </span>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
            </>
          )}

          {/* ── Audit log tab ── */}
          {!loading && !error && tab === 'audit' && (
            <>
              {audit.length === 0
                ? <EmptyState message="No audit events recorded yet." />
                : (
                  <div className="space-y-3">
                    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-surface-muted border-b border-border text-text-muted font-sora font-semibold text-2xs uppercase tracking-wider">
                          <tr>
                            <th className="py-2.5 px-3">Event</th>
                            <th className="py-2.5 px-3">Actor</th>
                            <th className="py-2.5 px-3">Target</th>
                            <th className="py-2.5 px-3">IP Address</th>
                            <th className="py-2.5 px-3">
                              <button
                                id="um-audit-sort-btn"
                                onClick={() => setSortAsc(v => !v)}
                                className="flex items-center gap-1 font-semibold hover:text-text-primary cursor-pointer"
                              >
                                <span>Timestamp</span>
                                {sortAsc ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                              </button>
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border text-text-primary">
                          {sortedAudit.map(entry => (
                            <tr key={entry.event_id} className="hover:bg-surface-muted/60 transition-colors">
                              <td className="py-2.5 px-3"><EventTypeBadge type={entry.event_type} /></td>
                              <td className="py-2.5 px-3 max-w-[130px] truncate font-medium" title={entry.actor_email}>
                                {entry.actor_email || entry.actor_id || '—'}
                              </td>
                              <td className="py-2.5 px-3 max-w-[130px] truncate text-text-muted" title={entry.target_email}>
                                {entry.target_email || entry.target_id || '—'}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-2xs text-text-muted">{entry.ip || '—'}</td>
                              <td className="py-2.5 px-3 font-mono tabular-nums text-2xs text-text-muted whitespace-nowrap">
                                {entry.timestamp
                                  ? new Date(entry.timestamp).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'medium' })
                                  : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-center text-xs text-text-muted">
                      Displaying <span className="font-mono tabular-nums font-semibold">{sortedAudit.length}</span> cryptographically logged administrative event{sortedAudit.length !== 1 ? 's' : ''}.
                    </p>
                  </div>
                )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2.5 border-t border-border bg-surface-muted/60 px-6 py-3.5">
          <ShieldOff className="h-4 w-4 text-[#B14AFF] shrink-0" />
          <p className="text-xs text-text-muted">
            Immutable audit record active. Account deactivations invalidate active bearer sessions immediately upon next request.
          </p>
        </div>
      </section>
    </div>
  );
};
