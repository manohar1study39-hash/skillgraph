import React, { useState } from 'react';
import { 
  X, 
  MapPin, 
  Mail, 
  Calendar, 
  Briefcase, 
  ShieldCheck, 
  Award, 
  FolderGit2, 
  Clock, 
  CheckCircle2, 
  Sparkles, 
  ArrowRight,
  TrendingUp,
  Cpu,
  UserPlus,
  FolderPlus
} from 'lucide-react';
import { Employee } from '../../types';
import { CSV_DATA } from '../../services/dataLoader';
import { Avatar } from '../ui/Avatar';

interface EmployeeProfileModalProps {
  employee: Employee;
  onClose: () => void;
  onOpenUpskilling?: (employee: Employee) => void;
  onInspectEvidence?: (employee: Employee, skillName: string) => void;
  userRole?: string;
  onReloadData?: () => Promise<void>;
  onShowToast?: (msg: string) => void;
}

export const EmployeeProfileModal: React.FC<EmployeeProfileModalProps> = ({
  employee,
  onClose,
  onOpenUpskilling,
  onInspectEvidence,
  userRole,
  onReloadData,
  onShowToast
}) => {
  const [activeTab, setActiveTab] = useState<'skills' | 'projects' | 'certifications'>('skills');
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignProjId, setAssignProjId] = useState('');
  const [assignRole, setAssignRole] = useState('Senior Contributor');
  const [assignSummary, setAssignSummary] = useState('');
  const [isAssigning, setIsAssigning] = useState(false);

  const canManage = userRole === 'HR_Admin' || userRole === 'Manager';

  const projects = CSV_DATA?.records?.projects || [];

  const handleAssignToProject = async (e: React.FormEvent) => {
    e.preventDefault();
    const projId = assignProjId || projects[0]?.project_id;
    if (!projId) return;
    setIsAssigning(true);
    try {
      const res = await fetch('/api/project-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          project_id: projId,
          employee_id: employee.id,
          role: assignRole.trim() || 'Contributor',
          contribution_summary: assignSummary.trim() || `Assigned to ${projId}`
        })
      });
      if (!res.ok) throw new Error('Failed to assign');
      onShowToast?.(`${employee.name} assigned to project successfully!`);
      setShowAssignModal(false);
      setAssignSummary('');
      if (onReloadData) await onReloadData();
    } catch {
      onShowToast?.('Could not assign employee to project.');
    } finally {
      setIsAssigning(false);
    }
  };

  const totalVerifiedProofs = employee.skills.reduce(
    (sum, sk) => sum + sk.evidenceList.filter(e => e.verified && !e.expired).length,
    0
  );

  const primarySkills = employee.skills.filter(s => s.isPrimary || ['Expert', 'Master'].includes(s.proficiencyLevel));
  const otherSkills = employee.skills.filter(s => !primarySkills.includes(s));

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-surface border border-border rounded-3xl max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden my-auto animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header Hero */}
        <div className="relative bg-gradient-to-r from-[#19C3E6]/[0.08] via-surface-alt to-[#6D4AFF]/[0.05] border-b border-border p-6 sm:p-8">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-surface border border-transparent hover:border-border transition-all"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
            <Avatar name={employee.name} className="h-20 w-20 rounded-2xl text-xl shadow-md ring-4 ring-[#19C3E6]/30" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-2xl font-black text-text-primary tracking-tight truncate font-sora">
                  {employee.display_label || employee.name}
                </h2>
                <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#19C3E6]/10 text-cyan-600 dark:text-cyan-400 border border-[#19C3E6]/20">
                  {employee.department}
                </span>
                {employee.availabilityPercent >= 50 && (
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 flex items-center gap-1 font-mono tabular-nums">
                    <CheckCircle2 className="w-3 h-3" /> Available
                  </span>
                )}
              </div>

              <p className="text-sm font-semibold text-text-muted mt-1 flex items-center gap-2">
                <Briefcase className="w-4 h-4 text-[#19C3E6]" /> {employee.role} • {employee.team}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-text-muted">
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-text-muted" /> {employee.location}
                </span>
                <span className="flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-text-muted" /> {employee.email}
                </span>
                <span className="flex items-center gap-1.5 font-mono tabular-nums">
                  <Calendar className="w-3.5 h-3.5 text-text-muted" /> {employee.yearsExperience} yrs tenure
                </span>
              </div>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-border/80">
            <div className="bg-surface/90 backdrop-blur-xs rounded-2xl p-3 border border-border shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted flex items-center gap-1">
                <Clock className="w-3 h-3 text-[#19C3E6]" /> Availability
              </span>
              <p className="text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5 font-mono tabular-nums">
                {employee.availabilityPercent}%
              </p>
              <span className="text-[10px] text-text-muted font-mono tabular-nums">
                {Math.round(employee.availabilityPercent * 0.4)} hrs/wk open
              </span>
            </div>

            <div className="bg-surface/90 backdrop-blur-xs rounded-2xl p-3 border border-border shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-amber-500" /> Workload
              </span>
              <p className="text-lg font-black text-text-primary mt-0.5 font-mono tabular-nums">
                {employee.currentWorkloadPercent}%
              </p>
              <span className="text-[10px] text-text-muted">Current allocation</span>
            </div>

            <div className="bg-surface/90 backdrop-blur-xs rounded-2xl p-3 border border-border shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted flex items-center gap-1">
                <Cpu className="w-3 h-3 text-[#19C3E6]" /> Verified Skills
              </span>
              <p className="text-lg font-black text-text-primary mt-0.5 font-mono tabular-nums">
                {employee.skills.length}
              </p>
              <span className="text-[10px] text-text-muted font-mono tabular-nums">{primarySkills.length} Expert/Master</span>
            </div>

            <div className="bg-surface/90 backdrop-blur-xs rounded-2xl p-3 border border-border shadow-2xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-500" /> Total Proofs
              </span>
              <p className="text-lg font-black text-text-primary mt-0.5 font-mono tabular-nums">
                {totalVerifiedProofs}
              </p>
              <span className="text-[10px] text-text-muted">Audited evidence</span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-border bg-surface shrink-0">
          <button
            onClick={() => setActiveTab('skills')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'skills'
                ? 'border-[#19C3E6] text-cyan-600 dark:text-cyan-400 bg-surface'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            <Cpu className="w-4 h-4" /> Skills &amp; Evidence ({employee.skills.length})
          </button>
          <button
            onClick={() => setActiveTab('projects')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'projects'
                ? 'border-[#19C3E6] text-cyan-600 dark:text-cyan-400 bg-surface'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            <FolderGit2 className="w-4 h-4" /> Enterprise Projects ({employee.topProjects.length})
          </button>
          <button
            onClick={() => setActiveTab('certifications')}
            className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'certifications'
                ? 'border-[#19C3E6] text-cyan-600 dark:text-cyan-400 bg-surface'
                : 'border-transparent text-text-muted hover:text-text-primary'
            }`}
          >
            <Award className="w-4 h-4" /> Certifications ({employee.certifications?.length || 0})
          </button>
        </div>

        {/* Modal Scrollable Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {activeTab === 'skills' && (
            <div className="space-y-6">
              {/* Primary / Expert Skills */}
              {primarySkills.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[#19C3E6]" /> Core &amp; Mastered Skills
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {primarySkills.map((sk) => (
                      <div
                        key={sk.skillId}
                        className="bg-surface-alt border border-border hover:border-[#19C3E6]/40 rounded-2xl p-4 transition-all shadow-2xs"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-sm font-extrabold text-text-primary block font-sora">
                              {sk.skillName}
                            </span>
                            <span className="text-[11px] text-text-muted">{sk.category}</span>
                          </div>
                          <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-[#19C3E6] text-slate-950 shadow-xs">
                            {sk.proficiencyLevel}
                          </span>
                        </div>

                        <div className="mt-3 flex items-center justify-between text-xs text-text-muted border-t border-border/60 pt-2.5">
                          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold font-mono tabular-nums">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            {sk.evidenceList.filter(e => e.verified && !e.expired).length} verified proofs
                          </span>
                          {onInspectEvidence && (
                            <button
                              onClick={() => onInspectEvidence(employee, sk.skillName)}
                              className="text-cyan-600 dark:text-cyan-400 hover:underline font-bold text-[11px] cursor-pointer"
                            >
                              Inspect evidence &rarr;
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Other Skills */}
              <div>
                <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider mb-3">
                  All Verified Skills ({employee.skills.length})
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {otherSkills.map((sk) => (
                    <div
                      key={sk.skillId}
                      className="bg-surface-alt border border-border hover:border-[#19C3E6]/40 rounded-2xl p-3.5 transition-all shadow-2xs"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-xs font-bold text-text-primary block font-sora">
                            {sk.skillName}
                          </span>
                          <span className="text-[10px] text-text-muted">{sk.category}</span>
                        </div>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg bg-surface border border-border text-text-primary">
                          {sk.proficiencyLevel}
                        </span>
                      </div>

                      <div className="mt-2.5 flex items-center justify-between text-[11px] text-text-muted border-t border-border/60 pt-2">
                        <span>Confidence: <strong className="text-cyan-600 dark:text-cyan-400 font-mono tabular-nums">{sk.confidenceScore}%</strong></span>
                        {onInspectEvidence && (
                          <button
                            onClick={() => onInspectEvidence(employee, sk.skillName)}
                            className="text-cyan-600 dark:text-cyan-400 hover:underline font-bold text-[11px] cursor-pointer"
                          >
                            Inspect &rarr;
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'projects' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">
                  Assigned Enterprise Projects
                </h4>
                {canManage && (
                  <button
                    onClick={() => {
                      setAssignProjId(CSV_DATA?.records?.projects?.[0]?.project_id || '');
                      setShowAssignModal(true);
                    }}
                    className="flex items-center gap-1.5 rounded-xl border border-[#19C3E6]/30 bg-[#19C3E6]/10 hover:bg-[#19C3E6]/20 text-cyan-600 dark:text-cyan-400 px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer"
                  >
                    <FolderPlus className="h-3.5 w-3.5" />
                    <span>Assign to Project</span>
                  </button>
                )}
              </div>
              {employee.topProjects.length > 0 ? (
                <div className="space-y-3">
                  {employee.topProjects.map((proj, idx) => (
                    <div
                      key={idx}
                      className="bg-surface-alt border border-border rounded-2xl p-4 flex items-start gap-3 shadow-2xs"
                    >
                      <FolderGit2 className="w-5 h-5 text-[#19C3E6] shrink-0 mt-0.5" />
                      <div>
                        <h5 className="text-sm font-bold text-text-primary">{proj}</h5>
                        <p className="text-xs text-text-muted mt-0.5">
                          Verified internal production contribution at {employee.department}.
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border p-8 text-center">
                  <p className="text-sm text-text-muted">No projects currently recorded for this employee.</p>
                  {canManage && (
                    <button
                      onClick={() => {
                        setAssignProjId(CSV_DATA?.records?.projects?.[0]?.project_id || '');
                        setShowAssignModal(true);
                      }}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-bold aurora-btn-primary text-white shadow-xs"
                    >
                      <FolderPlus className="h-3.5 w-3.5" />
                      <span>Assign to an Initiative</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {activeTab === 'certifications' && (
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">
                Professional Certifications
              </h4>
              {employee.certifications && employee.certifications.length > 0 ? (
                <div className="space-y-3">
                  {employee.certifications.map((cert, idx) => (
                    <div
                      key={idx}
                      className="bg-surface-alt border border-border rounded-2xl p-4 flex items-start gap-3 shadow-2xs"
                    >
                      <Award className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                      <div>
                        <h5 className="text-sm font-bold text-text-primary">{cert}</h5>
                        <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          Active &amp; Verified credential
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-muted py-6 text-center">No active certifications recorded.</p>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 sm:p-5 border-t border-border bg-surface-alt flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-border bg-surface hover:bg-surface-alt text-text-primary font-bold text-xs transition-colors shadow-2xs cursor-pointer"
          >
            Close
          </button>

          {onOpenUpskilling && (
            <button
              onClick={() => {
                onClose();
                onOpenUpskilling(employee);
              }}
              className="aurora-btn-primary px-4 py-2 rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 text-white transition-all"
            >
              Analyze Upskilling Path <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Assign to Project Modal ── */}
      {showAssignModal && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onMouseDown={e => { if (e.target === e.currentTarget) setShowAssignModal(false); }}
        >
          <div className="relative w-full max-w-md rounded-3xl border border-border bg-surface p-6 shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-border">
              <div className="flex items-center gap-2.5">
                <div className="rounded-xl bg-[#19C3E6]/10 p-2 text-cyan-600 dark:text-cyan-400 border border-[#19C3E6]/20">
                  <UserPlus className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-text-primary font-sora">Assign to Project / Team</h3>
                  <p className="text-xs text-text-muted">{employee.name} ({employee.role})</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAssignModal(false)}
                className="rounded-xl p-1.5 text-text-muted hover:bg-surface-alt cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAssignToProject} className="mt-4 space-y-3.5 text-sm">
              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1">Target Initiative / Project *</label>
                <select
                  value={assignProjId || projects[0]?.project_id || ''}
                  onChange={e => setAssignProjId(e.target.value)}
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-text-primary focus:border-[#19C3E6] focus:outline-none"
                >
                  {projects.map(p => (
                    <option key={p.project_id} value={p.project_id}>
                      {p.project_name} ({p.domain})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1">Project Role / Title *</label>
                <input
                  type="text"
                  required
                  value={assignRole}
                  onChange={e => setAssignRole(e.target.value)}
                  placeholder="e.g. Lead Frontend Architect, Core Contributor"
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-text-primary focus:border-[#19C3E6] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1">Contribution Summary (Optional)</label>
                <input
                  type="text"
                  value={assignSummary}
                  onChange={e => setAssignSummary(e.target.value)}
                  placeholder="e.g. Leading payment gateway integration"
                  className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-text-primary focus:border-[#19C3E6] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="rounded-xl border border-border px-4 py-2 text-xs font-semibold text-text-muted hover:bg-surface-alt cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAssigning}
                  className="aurora-btn-primary rounded-xl px-5 py-2 text-xs font-bold text-white shadow-xs transition-all disabled:opacity-50"
                >
                  {isAssigning ? 'Assigning...' : 'Confirm Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
