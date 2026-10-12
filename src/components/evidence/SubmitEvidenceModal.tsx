import React, { useState } from 'react';
import {
  X,
  FileText,
  GitPullRequest,
  FileCode,
  Award,
  Users,
  Briefcase,
  Link,
  Sparkles,
  Check,
  Plus,
  Trash2,
  AlertTriangle,
  TrendingUp,
  CheckCircle2
} from 'lucide-react';
import type { Employee, SkillTaxonomy, ToastUndoAction } from '../../types';
import { CSV_DATA } from '../../services/dataLoader';
import { apiFetch } from '../../services/apiClient';

const ALLOWED_DOMAINS_BY_TYPE: Record<string, string[]> = {
  PR: ['github.com', 'gitlab.com', 'bitbucket.org'],
  commit: ['github.com', 'gitlab.com', 'bitbucket.org'],
  code_review: ['github.com', 'gitlab.com', 'bitbucket.org'],
  cert: ['credly.com', 'coursera.org', 'udemy.com', 'linkedin.com', 'aws.training', 'learn.microsoft.com', 'verify.skillgraph.demo']
};

interface SubmitEvidenceModalProps {
  employee: Employee;
  initialSkillName?: string;
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
  onShowToast: (message: string, undoAction?: ToastUndoAction) => void;
}

interface SkillShare {
  skillId: string;
  share: number;
}

interface BeforeAfterSummary {
  skill_id: string;
  old_level: number;
  old_level_name: string;
  old_points: number;
  new_level: number;
  new_level_name: string;
  new_points: number;
  level_increased: boolean;
}

export const SubmitEvidenceModal: React.FC<SubmitEvidenceModalProps> = ({
  employee,
  initialSkillName = '',
  onClose,
  onSuccess,
  onShowToast
}) => {
  const allSkills: SkillTaxonomy[] = CSV_DATA.skillsData || [];
  const projects = CSV_DATA.records?.projects || [];
  const todayStr = new Date().toISOString().slice(0, 10);

  // Find initial skill
  const matchedSkill = allSkills.find(
    s => s.name.toLowerCase() === initialSkillName.toLowerCase() ||
         s.synonyms.some(syn => syn.toLowerCase() === initialSkillName.toLowerCase())
  );

  const [skillsList, setSkillsList] = useState<SkillShare[]>([
    { skillId: matchedSkill?.id || allSkills[0]?.id || '', share: 100 }
  ]);

  const [evidenceType, setEvidenceType] = useState<'PR' | 'commit' | 'project' | 'cert' | 'feedback' | 'code_review'>('PR');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [artifactDate, setArtifactDate] = useState(todayStr);
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.project_id || '');
  const [claimedLevel, setClaimedLevel] = useState<'Aware' | 'Guided' | 'Independent' | 'Advanced' | 'Expert'>('Independent');
  const [complexityScore, setComplexityScore] = useState(3.0);
  const [role, setRole] = useState<'Contributor' | 'Lead' | 'Support'>('Contributor');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [beforeAfterResult, setBeforeAfterResult] = useState<BeforeAfterSummary[] | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);

  const handleAddSkill = () => {
    if (skillsList.length >= 3) {
      onShowToast('Maximum 3 skills per artifact to preserve focused calibration.');
      return;
    }
    const remainingSkills = allSkills.filter(s => !skillsList.some(item => item.skillId === s.id));
    if (remainingSkills.length === 0) return;
    const newShare = Math.floor(100 / (skillsList.length + 1));
    const updated = skillsList.map(s => ({ ...s, share: newShare }));
    updated.push({ skillId: remainingSkills[0].id, share: 100 - (newShare * skillsList.length) });
    setSkillsList(updated);
  };

  const handleRemoveSkill = (index: number) => {
    if (skillsList.length <= 1) return;
    const filtered = skillsList.filter((_, i) => i !== index);
    const split = Math.floor(100 / filtered.length);
    const redistributed = filtered.map((s, i) => ({
      ...s,
      share: i === 0 ? 100 - (split * (filtered.length - 1)) : split
    }));
    setSkillsList(redistributed);
  };

  const handleShareChange = (index: number, val: number) => {
    const updated = [...skillsList];
    updated[index].share = Math.max(1, Math.min(100, val));
    setSkillsList(updated);
  };

  const totalShare = skillsList.reduce((sum, s) => sum + s.share, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setDuplicateWarning(null);

    if (title.trim().length < 5) {
      setErrorMsg('Title must be at least 5 characters long.');
      return;
    }
    if (artifactDate > todayStr) {
      setErrorMsg('Artifact date cannot be in the future.');
      return;
    }
    if (Math.abs(totalShare - 100) > 1) {
      setErrorMsg(`Skill share allocation must total 100% (currently ${totalShare}%).`);
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        evidence_type: evidenceType,
        url: url.trim() || undefined,
        artifact_date: artifactDate,
        skills: skillsList.map(s => ({ skill_id: s.skillId, share_percentage: s.share })),
        project_id: selectedProjectId || undefined,
        demonstrated_level: claimedLevel,
        complexity_score: complexityScore,
        role
      };

      const res = await apiFetch('/api/evidence', {
        method: 'POST',
        body: JSON.stringify(payload)
      });

      const data = res.data || {};

      if (!res.ok) {
        throw new Error(res.error || 'Failed to submit evidence proof');
      }

      if (data.is_duplicate) {
        setDuplicateWarning(data.duplicate_warning || 'This artifact URL has already been recorded.');
      }

      if (data.before_after && data.before_after.length > 0) {
        setBeforeAfterResult(data.before_after);
      }

      await onSuccess();
      const createdId = data.evidence_id || (data.created_ids && data.created_ids[0]);
      const statusText = data.verification_status === 'Link checked'
        ? 'Proof submitted and link verified via repository scan!'
        : 'Proof submitted with status: Self-reported. Awaiting HR review.';

      onShowToast(
        statusText,
        createdId
          ? {
              label: 'Undo',
              durationSeconds: 10,
              onUndo: async () => {
                await apiFetch(`/api/evidence/${createdId}`, { method: 'DELETE' });
                await onSuccess();
                onShowToast('Evidence submission retracted.');
              }
            }
          : undefined
      );

      // Auto close after brief summary preview
      setTimeout(() => {
        onClose();
      }, 1600);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error submitting proof.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl my-auto animate-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-6 bg-surface-alt">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-600 dark:text-teal-400 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-text-primary">Submit Skill Proof &amp; Artifact</h2>
              <p className="text-xs text-text-muted mt-0.5">
                Log work artifacts and contributions for deterministic proficiency scoring
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {duplicateWarning && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{duplicateWarning}</span>
            </div>
          )}

          {beforeAfterResult && (
            <div className="rounded-xl border border-teal-500/30 bg-teal-500/10 p-3.5 text-xs space-y-2">
              <div className="font-bold text-teal-700 dark:text-teal-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" /> Proficiency Impact Summary
              </div>
              <div className="space-y-1.5">
                {beforeAfterResult.map(res => (
                  <div key={res.skill_id} className="flex items-center justify-between text-[11px] bg-surface/80 p-2 rounded-lg border border-border">
                    <span className="font-semibold text-text-primary">{res.skill_id}</span>
                    <span className="text-text-muted">
                      Level {res.old_level} ({res.old_points} pts) →{' '}
                      <strong className={res.level_increased ? 'text-emerald-600' : 'text-teal-600'}>
                        Level {res.new_level} ({res.new_points} pts)
                      </strong>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Multi-skill selector with share split */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-text-muted">
                Target Skill(s) &amp; Share Allocation ({totalShare}%)
              </label>
              {skillsList.length < 3 && (
                <button
                  type="button"
                  onClick={handleAddSkill}
                  className="text-2xs font-bold text-teal-600 hover:text-teal-700 flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Add Skill Split
                </button>
              )}
            </div>
            <div className="space-y-2">
              {skillsList.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={item.skillId}
                    onChange={e => {
                      const updated = [...skillsList];
                      updated[idx].skillId = e.target.value;
                      setSkillsList(updated);
                    }}
                    className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-xs text-text-primary focus:border-teal-500 focus:outline-none"
                  >
                    {allSkills.map(sk => (
                      <option key={sk.id} value={sk.id}>
                        {sk.name} ({sk.category})
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-1 w-24">
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={item.share}
                      onChange={e => handleShareChange(idx, Number(e.target.value))}
                      className="w-16 rounded-xl border border-border bg-surface px-2 py-2 text-xs text-center text-text-primary focus:border-teal-500 focus:outline-none"
                    />
                    <span className="text-xs text-text-muted">%</span>
                  </div>
                  {skillsList.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveSkill(idx)}
                      className="p-2 text-text-muted hover:text-red-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Evidence Type */}
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1.5">
              Artifact Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { type: 'PR', label: 'Pull Request', icon: GitPullRequest },
                { type: 'commit', label: 'Code Commit', icon: FileCode },
                { type: 'project', label: 'Production App', icon: Briefcase },
                { type: 'cert', label: 'Certification', icon: Award },
                { type: 'code_review', label: 'Code Review', icon: FileText },
                { type: 'feedback', label: 'Peer Review', icon: Users }
              ].map(item => {
                const Icon = item.icon;
                const active = evidenceType === item.type;
                return (
                  <button
                    key={item.type}
                    type="button"
                    onClick={() => setEvidenceType(item.type as typeof evidenceType)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
                      active
                        ? 'border-teal-500 bg-teal-500/10 text-teal-700 dark:text-teal-300'
                        : 'border-border bg-surface-alt text-text-muted hover:border-border/80 hover:text-text-primary'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Evidence Title */}
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1.5">
              Artifact Title / Summary
            </label>
            <input
              type="text"
              required
              minLength={5}
              maxLength={255}
              placeholder="e.g. Refactored checkout state management using React 18 &amp; Redux"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-text-primary placeholder:text-text-muted/50 focus:border-teal-500 focus:outline-none"
            />
          </div>

          {/* Verification Link / URL */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-text-muted">
                Repository / Verification URL
              </label>
              <span className="text-[10px] text-text-muted">
                Allowed: {ALLOWED_DOMAINS_BY_TYPE[evidenceType]?.join(', ') || 'Any valid URL'}
              </span>
            </div>
            <div className="relative">
              <Link className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="url"
                placeholder={
                  evidenceType === 'cert'
                    ? 'https://www.credly.com/badges/...'
                    : 'https://github.com/company/repo/pull/142'
                }
                value={url}
                onChange={e => setUrl(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface pl-8 pr-3 py-2 text-xs text-text-primary placeholder:text-text-muted/50 focus:border-teal-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Date & Project Row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1.5">
                Artifact Date
              </label>
              <input
                type="date"
                required
                max={todayStr}
                value={artifactDate}
                onChange={e => setArtifactDate(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-text-primary focus:border-teal-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1.5">
                Associated Project
              </label>
              <select
                value={selectedProjectId}
                onChange={e => setSelectedProjectId(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-text-primary focus:border-teal-500 focus:outline-none"
              >
                <option value="">None / External</option>
                {projects.map((p: any) => (
                  <option key={p.project_id} value={p.project_id}>
                    {p.project_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Claimed Level & Complexity */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1.5">
                Claimed Level (Self-Declared)
              </label>
              <select
                value={claimedLevel}
                onChange={e => setClaimedLevel(e.target.value as typeof claimedLevel)}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-text-primary focus:border-teal-500 focus:outline-none"
              >
                <option value="Aware">Level 1 - Aware</option>
                <option value="Guided">Level 2 - Guided</option>
                <option value="Independent">Level 3 - Independent</option>
                <option value="Advanced">Level 4 - Advanced</option>
                <option value="Expert">Level 5 - Expert</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-muted mb-1.5">
                Contribution Role
              </label>
              <select
                value={role}
                onChange={e => setRole(e.target.value as typeof role)}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-text-primary focus:border-teal-500 focus:outline-none"
              >
                <option value="Contributor">Contributor (1.0x)</option>
                <option value="Lead">Lead / Architect (1.3x)</option>
                <option value="Support">Support (0.8x)</option>
              </select>
            </div>
          </div>

          {/* Neutral scoring notice */}
          <div className="rounded-xl border border-border bg-surface-alt p-3 text-[11px] text-text-muted leading-relaxed">
            <span className="font-semibold text-text-primary">Evaluation note:</span> Self-submitted artifacts enter as{' '}
            <strong className="text-text-primary">Self-reported</strong> (or <strong className="text-text-primary">Link checked</strong> via repository scan). Evidenced levels are computed deterministically. Claims alone never exceed Level 1.
          </div>

          {/* Modal Actions */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-border bg-surface px-4 py-2 text-xs font-semibold text-text-muted hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl px-5 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-xs"
            >
              {submitting ? (
                <span>Submitting…</span>
              ) : (
                <>
                  <Check className="w-4 h-4" /> Submit Proof
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
