import React, { useMemo, useState } from 'react';
import {
  Search, Users, Plus, Mail, MapPin, Briefcase,
  Grid, List, Check, X, Sparkles, SlidersHorizontal,
  GraduationCap, ArrowUpDown, ChevronRight, UserPlus
} from 'lucide-react';
import type { Employee } from '../../types';
import { CSV_DATA } from '../../services/dataLoader';
import { Avatar } from '../ui/Avatar';

interface Props {
  employees: Employee[];
  userRole?: 'HR_Admin' | 'Manager' | 'Employee' | string;
  onSelectEmployee: (emp: Employee) => void;
  onOpenUpskilling?: (emp: Employee) => void;
  onReloadData: () => Promise<void>;
  onShowToast: (msg: string) => void;
}

export const EmployeeDirectoryTab: React.FC<Props> = ({
  employees,
  userRole,
  onSelectEmployee,
  onOpenUpskilling,
  onReloadData,
  onShowToast
}) => {
  const isHr = userRole === 'HR_Admin';
  const isManager = userRole === 'Manager';
  const canAdd = isHr || isManager;

  const [search, setSearch] = useState('');
  const [selectedDept, setSelectedDept] = useState('All');
  const [selectedTeam, setSelectedTeam] = useState('All');
  const [availFilter, setAvailFilter] = useState<'All' | 'High' | 'Partial' | 'Busy'>('All');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [sortField, setSortField] = useState<'name' | 'availability' | 'skills' | 'exp'>('name');
  const [page, setPage] = useState(1);
  const pageSize = 12;

  // Add Employee Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formDept, setFormDept] = useState('Engineering');
  const [formTeam, setFormTeam] = useState('Core Payments');
  const [formLocation, setFormLocation] = useState('Remote');
  const [formAvail, setFormAvail] = useState(80);
  const [formSkills, setFormSkills] = useState<{ skill_id: string; proficiency_level: string }[]>([
    { skill_id: 'skill-react', proficiency_level: 'Advanced' }
  ]);
  const [createAccount, setCreateAccount] = useState(true);
  const [formError, setFormError] = useState('');

  // Unique departments and teams
  const departments = useMemo(() => ['All', ...new Set(employees.map(e => e.department).filter(Boolean))], [employees]);
  const teams = useMemo(() => {
    const relevant = selectedDept === 'All' ? employees : employees.filter(e => e.department === selectedDept);
    return ['All', ...new Set(relevant.map(e => e.team).filter(Boolean))];
  }, [employees, selectedDept]);

  // Filtered employees
  const filtered = useMemo(() => {
    return employees.filter(e => {
      if (selectedDept !== 'All' && e.department !== selectedDept) return false;
      if (selectedTeam !== 'All' && e.team !== selectedTeam) return false;
      if (availFilter === 'High' && e.availabilityPercent < 70) return false;
      if (availFilter === 'Partial' && (e.availabilityPercent < 30 || e.availabilityPercent >= 70)) return false;
      if (availFilter === 'Busy' && e.availabilityPercent >= 30) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = e.name.toLowerCase().includes(q);
        const matchesEmail = e.email.toLowerCase().includes(q);
        const matchesTitle = e.role.toLowerCase().includes(q);
        const matchesDept = e.department.toLowerCase().includes(q);
        const matchesSkill = e.skills.some(s => s.skillName.toLowerCase().includes(q));
        if (!matchesName && !matchesEmail && !matchesTitle && !matchesDept && !matchesSkill) return false;
      }
      return true;
    }).sort((a, b) => {
      if (sortField === 'name') return a.name.localeCompare(b.name);
      if (sortField === 'availability') return b.availabilityPercent - a.availabilityPercent;
      if (sortField === 'skills') return b.skills.length - a.skills.length;
      if (sortField === 'exp') return b.yearsExperience - a.yearsExperience;
      return 0;
    });
  }, [employees, selectedDept, selectedTeam, availFilter, search, sortField]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize);

  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formEmail.trim() || !formTitle.trim()) {
      setFormError('Please enter Name, Email, and Job Title.');
      return;
    }
    setIsSubmitting(true);
    setFormError('');

    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          name: formName.trim(),
          email: formEmail.trim(),
          role: formTitle.trim(),
          department: formDept,
          team: formTeam,
          location: formLocation,
          availabilityPercent: formAvail,
          skills: formSkills,
          createAccount
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to add employee.');
      }

      onShowToast(`Employee ${formName} successfully created and registered.`);
      setShowAddModal(false);
      setFormName('');
      setFormEmail('');
      setFormTitle('');
      setFormAvail(80);
      setFormSkills([{ skill_id: 'skill-react', proficiency_level: 'Advanced' }]);
      // Trigger live sync
      await onReloadData();
    } catch (err: any) {
      setFormError(err.message || 'Error creating employee.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const accentColor = isHr ? 'violet' : isManager ? 'indigo' : 'teal';

  return (
    <div className="space-y-6 pb-14">
      {/* Top Banner & Header */}
      <div className={`relative overflow-hidden rounded-2xl border p-6 shadow-sm transition-all ${
        isHr
          ? 'border-[#B14AFF]/30 bg-gradient-to-br from-[#B14AFF]/10 via-surface to-surface'
          : isManager
          ? 'border-[#19C3E6]/30 bg-gradient-to-br from-[#19C3E6]/10 via-surface to-surface'
          : 'border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-surface to-surface'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-2xs font-bold uppercase tracking-wider mb-2 ${
              isHr
                ? 'bg-[#B14AFF]/10 text-[#B14AFF] border border-[#B14AFF]/30'
                : isManager
                ? 'bg-[#19C3E6]/10 text-[#19C3E6] border border-[#19C3E6]/30'
                : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
            }`}>
              <Users className="h-3.5 w-3.5" />
              <span>Enterprise Directory</span>
            </div>
            <h2 className="text-2xl font-sora font-semibold text-text-primary tracking-tight">
              Company Talent &amp; Roster
            </h2>
            <p className="mt-1 text-xs text-text-muted max-w-2xl">
              Inspect verified technical proficiencies, work bandwidth, and active initiative commitments for all <span className="font-mono tabular-nums font-semibold text-text-primary">{employees.length}</span> team members.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {canAdd && (
              <button
                onClick={() => setShowAddModal(true)}
                className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-sora font-semibold text-white shadow-md transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer ${
                  isHr ? 'aurora-btn-primary' : 'bg-[#19C3E6] text-slate-950 hover:bg-[#15B0D0]'
                }`}
              >
                <UserPlus className="h-4 w-4" />
                <span>Add Employee</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4 shadow-sm">
        {/* Search */}
        <div className="relative min-w-64 flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by name, title, department, or skill..."
            className="w-full rounded-xl border border-border bg-surface-muted py-2 pl-9 pr-8 text-xs text-text-primary placeholder:text-text-muted focus:border-[#B14AFF] focus:outline-none focus:ring-1 focus:ring-[#B14AFF] transition-all"
          />
          {search && (
            <button
              onClick={() => { setSearch(''); setPage(1); }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary text-xs p-1"
            >
              ✕
            </button>
          )}
        </div>

        {/* Dropdowns */}
        <div className="flex flex-wrap items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-text-muted" />

          {/* Department */}
          <select
            value={selectedDept}
            onChange={e => { setSelectedDept(e.target.value); setSelectedTeam('All'); setPage(1); }}
            className="rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs font-medium text-text-primary focus:outline-none focus:border-[#B14AFF]"
          >
            {departments.map(d => <option key={d} value={d}>{d === 'All' ? 'All Departments' : d}</option>)}
          </select>

          {/* Team */}
          {teams.length > 2 && (
            <select
              value={selectedTeam}
              onChange={e => { setSelectedTeam(e.target.value); setPage(1); }}
              className="rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs font-medium text-text-primary focus:outline-none focus:border-[#B14AFF]"
            >
              {teams.map(t => <option key={t} value={t}>{t === 'All' ? 'All Teams' : t}</option>)}
            </select>
          )}

          {/* Availability */}
          <select
            value={availFilter}
            onChange={e => { setAvailFilter(e.target.value as any); setPage(1); }}
            className="rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs font-medium text-text-primary focus:outline-none focus:border-[#B14AFF]"
          >
            <option value="All">All Availability</option>
            <option value="High">Available (&gt;70%)</option>
            <option value="Partial">Partial (30-70%)</option>
            <option value="Busy">Full (&lt;30%)</option>
          </select>

          {/* Sort */}
          <div className="flex items-center gap-1.5 border-l border-border pl-2.5">
            <ArrowUpDown className="h-3.5 w-3.5 text-text-muted" />
            <select
              value={sortField}
              onChange={e => setSortField(e.target.value as any)}
              className="rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs font-medium text-text-primary focus:outline-none focus:border-[#B14AFF]"
            >
              <option value="name">Name (A-Z)</option>
              <option value="availability">Highest Availability</option>
              <option value="skills">Most Verified Skills</option>
              <option value="exp">Experience</option>
            </select>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center rounded-xl border border-border bg-surface-muted p-0.5 ml-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`rounded-lg p-1.5 text-xs transition-colors cursor-pointer ${viewMode === 'grid' ? (isHr ? 'bg-surface text-[#B14AFF] shadow-2xs font-bold' : 'bg-surface text-cyan-400 shadow-2xs font-bold') : 'text-text-muted hover:text-text-primary'}`}
              title="Card Grid"
            >
              <Grid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`rounded-lg p-1.5 text-xs transition-colors cursor-pointer ${viewMode === 'table' ? (isHr ? 'bg-surface text-[#B14AFF] shadow-2xs font-bold' : 'bg-surface text-cyan-400 shadow-2xs font-bold') : 'text-text-muted hover:text-text-primary'}`}
              title="Table View"
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Results Header */}
      <div className="flex items-center justify-between text-xs text-text-muted px-1">
        <span>
          Showing <strong className="text-text-primary font-bold font-mono tabular-nums">{filtered.length}</strong> employees
          {selectedDept !== 'All' && ` in ${selectedDept}`}
        </span>
        <span>Page <span className="font-mono tabular-nums font-semibold">{page}</span> of <span className="font-mono tabular-nums font-semibold">{totalPages}</span></span>
      </div>

      {/* Grid View */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {paginated.map(emp => {
            const isHighAvail = emp.availabilityPercent >= 70;
            const isMedAvail = emp.availabilityPercent >= 30 && emp.availabilityPercent < 70;

            return (
              <div
                key={emp.id}
                className={`group relative flex flex-col justify-between rounded-2xl border border-border bg-surface p-5 shadow-sm transition-all duration-200 hover:shadow-md ${
                  isHr ? 'hover:border-[#B14AFF]/40' : 'hover:border-[#19C3E6]/40'
                }`}
              >
                <div>
                  {/* Avatar and basic info */}
                  <div className="flex items-start gap-3">
                    <Avatar name={emp.name} className={`h-12 w-12 text-sm shrink-0 rounded-xl ring-2 ${isHr ? 'ring-[#B14AFF]/30' : 'ring-cyan-500/30'}`} />
                    <div className="min-w-0 flex-1">
                      <h3 className={`font-sora font-semibold text-text-primary text-sm truncate transition-colors ${
                        isHr ? 'group-hover:text-[#B14AFF]' : 'group-hover:text-[#19C3E6]'
                      }`}>
                        {emp.name}
                      </h3>
                      <p className="text-xs font-medium text-text-muted truncate">{emp.role}</p>
                      <p className="text-2xs text-text-muted/80 flex items-center gap-1 mt-0.5">
                        <span>{emp.department}</span>
                        {emp.team && <span>· {emp.team}</span>}
                      </p>
                    </div>
                  </div>

                  {/* Availability Bar & Location */}
                  <div className="mt-4 pt-3 border-t border-border space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-text-muted">Bandwidth</span>
                      <span className={`font-bold text-2xs px-2 py-0.5 rounded-full border ${
                        isHighAvail ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' :
                        isMedAvail ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/30' :
                        'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30'
                      }`}>
                        <span className="font-mono tabular-nums">{emp.availabilityPercent}%</span> ({emp.hoursPerWeekFree}h free)
                      </span>
                    </div>

                    <div className="h-1.5 w-full rounded-full bg-surface-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${isHighAvail ? 'bg-emerald-500' : isMedAvail ? 'bg-[#19C3E6]' : 'bg-amber-500'}`}
                        style={{ width: `${emp.availabilityPercent}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-2xs text-text-muted pt-0.5">
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate max-w-[130px]">{emp.location || 'Remote'}</span>
                      </span>
                      <span><span className="font-mono tabular-nums">{emp.yearsExperience}</span> yrs exp</span>
                    </div>
                  </div>

                  {/* Top Skills Chips */}
                  <div className="mt-3.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-text-muted mb-1.5">
                      Verified Skills (<span className="font-mono tabular-nums">{emp.skills.length}</span>)
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {emp.skills.slice(0, 4).map(skill => (
                        <span
                          key={skill.skillId}
                          className="rounded-lg border border-border bg-surface-muted px-2 py-0.5 text-2xs font-semibold text-text-primary"
                        >
                          {skill.skillName}
                          <span className="ml-1 text-[9px] text-text-muted font-normal">
                            ({skill.proficiencyLevel.slice(0, 3)})
                          </span>
                        </span>
                      ))}
                      {emp.skills.length > 4 && (
                        <span className="rounded-lg border border-border px-1.5 py-0.5 text-[10px] text-text-muted font-mono tabular-nums">
                          +{emp.skills.length - 4} more
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Actions */}
                <div className="mt-5 pt-3 border-t border-border flex items-center justify-between gap-2">
                  <button
                    onClick={() => onSelectEmployee(emp)}
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-border bg-surface-muted hover:bg-surface-elevated text-text-primary py-2 text-xs font-sora font-semibold transition-all shadow-2xs cursor-pointer hover:border-[#B14AFF]/40"
                  >
                    View Full Profile
                  </button>
                  {onOpenUpskilling && (
                    <button
                      onClick={() => onOpenUpskilling(emp)}
                      title="Inspect Upskilling & Readiness"
                      className="rounded-xl border border-border bg-surface-muted p-2 text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
                    >
                      <GraduationCap className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Table View */
        <div className="rounded-2xl border border-border bg-surface overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-surface-muted text-text-muted font-sora font-semibold uppercase tracking-wider text-2xs">
                <tr>
                  <th className="py-3 pl-4 pr-3">Employee</th>
                  <th className="px-3 py-3">Department &amp; Team</th>
                  <th className="px-3 py-3">Location</th>
                  <th className="px-3 py-3">Bandwidth</th>
                  <th className="px-3 py-3">Top Skills</th>
                  <th className="py-3 pl-3 pr-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {paginated.map(emp => (
                  <tr
                    key={emp.id}
                    className="hover:bg-surface-muted/60 transition-colors"
                  >
                    <td className="py-3 pl-4 pr-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={emp.name} className="h-8 w-8 text-2xs shrink-0 rounded-lg" />
                        <div>
                          <p className="font-sora font-semibold text-text-primary">{emp.name}</p>
                          <p className="text-2xs text-text-muted">{emp.role}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-text-muted">
                      <p className="font-semibold text-text-primary">{emp.department}</p>
                      <p className="text-2xs">{emp.team}</p>
                    </td>
                    <td className="px-3 py-3 text-text-muted">
                      {emp.location || 'Remote'}
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-bold font-mono tabular-nums text-text-primary">
                        {emp.availabilityPercent}%
                      </span>
                      <span className="block text-2xs text-text-muted font-mono tabular-nums">
                        {emp.hoursPerWeekFree}h free
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {emp.skills.slice(0, 3).map(s => (
                          <span key={s.skillId} className="rounded-md bg-surface-muted border border-border px-1.5 py-0.5 text-[10px] font-semibold text-text-primary">
                            {s.skillName}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-3 pl-3 pr-4 text-right">
                      <button
                        onClick={() => onSelectEmployee(emp)}
                        className="rounded-lg border border-border px-3 py-1.5 text-xs font-sora font-semibold text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
                      >
                        Profile
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-border pt-4 text-xs text-text-muted">
          <button
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
            className="rounded-xl border border-border bg-surface px-3 py-1.5 font-semibold text-text-primary hover:bg-surface-elevated disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            Previous
          </button>
          <span>Page <span className="font-mono tabular-nums font-semibold">{page}</span> of <span className="font-mono tabular-nums font-semibold">{totalPages}</span></span>
          <button
            disabled={page === totalPages}
            onClick={() => setPage(p => p + 1)}
            className="rounded-xl border border-border bg-surface px-3 py-1.5 font-semibold text-text-primary hover:bg-surface-elevated disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            Next
          </button>
        </div>
      )}

      {/* ── Add Employee Modal ── */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200"
          onMouseDown={e => { if (e.target === e.currentTarget) setShowAddModal(false); }}
        >
          <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-surface p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="rounded-xl bg-[#B14AFF]/10 text-[#B14AFF] p-2 border border-[#B14AFF]/20">
                  <UserPlus className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-sora font-semibold text-text-primary">Add New Employee</h3>
                  <p className="text-xs text-text-muted">Create employee technical profile and sync company talent records.</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="rounded-lg p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddEmployee} className="mt-4 space-y-4 text-xs">
              {formError && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-600 dark:text-rose-400">
                  {formError}
                </div>
              )}

              {/* Name & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-2xs font-sora font-semibold text-text-muted uppercase tracking-wider mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    placeholder="e.g. Rachel Adams"
                    className="w-full rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs text-text-primary focus:border-[#B14AFF] focus:outline-none focus:ring-1 focus:ring-[#B14AFF]"
                  />
                </div>
                <div>
                  <label className="block text-2xs font-sora font-semibold text-text-muted uppercase tracking-wider mb-1">Company Email *</label>
                  <input
                    type="email"
                    required
                    value={formEmail}
                    onChange={e => setFormEmail(e.target.value)}
                    placeholder="e.g. rachel.adams@company.com"
                    className="w-full rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs text-text-primary focus:border-[#B14AFF] focus:outline-none focus:ring-1 focus:ring-[#B14AFF]"
                  />
                </div>
              </div>

              {/* Title & Department */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-2xs font-sora font-semibold text-text-muted uppercase tracking-wider mb-1">Job Title / Role *</label>
                  <input
                    type="text"
                    required
                    value={formTitle}
                    onChange={e => setFormTitle(e.target.value)}
                    placeholder="e.g. Senior Backend Engineer"
                    className="w-full rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs text-text-primary focus:border-[#B14AFF] focus:outline-none focus:ring-1 focus:ring-[#B14AFF]"
                  />
                </div>
                <div>
                  <label className="block text-2xs font-sora font-semibold text-text-muted uppercase tracking-wider mb-1">Department</label>
                  <select
                    value={formDept}
                    onChange={e => setFormDept(e.target.value)}
                    className="w-full rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs text-text-primary focus:border-[#B14AFF] focus:outline-none"
                  >
                    <option value="Engineering">Engineering</option>
                    <option value="Product">Product</option>
                    <option value="Data & Analytics">Data &amp; Analytics</option>
                    <option value="Cloud & Infrastructure">Cloud &amp; Infrastructure</option>
                    <option value="Information Security">Information Security</option>
                  </select>
                </div>
              </div>

              {/* Team & Location */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-2xs font-sora font-semibold text-text-muted uppercase tracking-wider mb-1">Team</label>
                  <input
                    type="text"
                    value={formTeam}
                    onChange={e => setFormTeam(e.target.value)}
                    placeholder="e.g. Core Payments"
                    className="w-full rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs text-text-primary focus:border-[#B14AFF] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-2xs font-sora font-semibold text-text-muted uppercase tracking-wider mb-1">Location</label>
                  <input
                    type="text"
                    value={formLocation}
                    onChange={e => setFormLocation(e.target.value)}
                    placeholder="e.g. San Francisco, CA or Remote"
                    className="w-full rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs text-text-primary focus:border-[#B14AFF] focus:outline-none"
                  />
                </div>
              </div>

              {/* Availability Slider */}
              <div className="rounded-xl border border-border bg-surface-muted p-3.5 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-sora font-semibold text-text-primary">Initial Bandwidth Availability</span>
                  <span className="font-bold text-[#B14AFF] font-mono tabular-nums">{formAvail}% ({Math.round(formAvail * 0.4)} hrs/week free)</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={formAvail}
                  onChange={e => setFormAvail(Number(e.target.value))}
                  className="w-full cursor-pointer accent-[#B14AFF]"
                />
              </div>

              {/* Initial Skills */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-2xs font-sora font-semibold text-text-muted uppercase tracking-wider">Primary Skills</label>
                  <button
                    type="button"
                    onClick={() => setFormSkills(prev => [...prev, { skill_id: 'skill-ts', proficiency_level: 'Intermediate' }])}
                    className="text-xs text-[#B14AFF] hover:underline font-bold cursor-pointer"
                  >
                    + Add Skill
                  </button>
                </div>
                {formSkills.map((sk, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={sk.skill_id}
                      onChange={e => {
                        const val = e.target.value;
                        setFormSkills(prev => prev.map((item, i) => i === idx ? { ...item, skill_id: val } : item));
                      }}
                      className="flex-1 rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-[#B14AFF]"
                    >
                      {CSV_DATA.skillsData.map(s => (
                        <option key={s.id} value={s.id}>{s.name} ({s.category})</option>
                      ))}
                    </select>

                    <select
                      value={sk.proficiency_level}
                      onChange={e => {
                        const val = e.target.value;
                        setFormSkills(prev => prev.map((item, i) => i === idx ? { ...item, proficiency_level: val } : item));
                      }}
                      className="w-36 rounded-xl border border-border bg-surface-muted px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-[#B14AFF]"
                    >
                      <option value="Beginner">Beginner</option>
                      <option value="Intermediate">Intermediate</option>
                      <option value="Advanced">Advanced</option>
                      <option value="Expert">Expert</option>
                      <option value="Master">Master</option>
                    </select>

                    {formSkills.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setFormSkills(prev => prev.filter((_, i) => i !== idx))}
                        className="rounded-lg p-1.5 text-text-muted hover:text-rose-600 hover:bg-surface-elevated cursor-pointer"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Login Account Checkbox */}
              <label className="flex items-center gap-2.5 cursor-pointer pt-1 text-xs text-text-muted">
                <input
                  type="checkbox"
                  checked={createAccount}
                  onChange={e => setCreateAccount(e.target.checked)}
                  className="rounded border-border text-[#B14AFF] focus:ring-[#B14AFF] h-4 w-4"
                />
                <span>Also generate active credentials for this employee (default password: <code className="bg-surface-muted px-1 py-0.5 rounded text-text-primary font-mono text-2xs">Password123!</code>)</span>
              </label>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-text-muted hover:bg-surface-elevated cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-xl aurora-btn-primary text-white px-5 py-2 text-xs font-sora font-semibold shadow-md transition-all disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'Registering...' : 'Save & Sync Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
