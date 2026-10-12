import React, { useState } from 'react';
import {
  X,
  Briefcase,
  Clock,
  Sparkles,
  CheckCircle2,
  Send,
  ShieldCheck,
  Building2,
  Calendar
} from 'lucide-react';
import type { Employee } from '../../types';
import { apiFetch } from '../../services/apiClient';

export interface OpportunityItem {
  id: string;
  name: string;
  title?: string;
  type: 'project' | 'role';
  department: string;
  matchScore: number;
  commitment?: string;
  description?: string;
  technologies?: string | string[];
  matchedCount?: number;
  requirementsCount?: number;
  base_match_percent?: number;
  availability_factor?: number;
  required_hours?: number;
  free_hours?: number;
  skill_breakdown?: Array<{
    skill_id: string;
    skill_name: string;
    required_level: string;
    employee_level?: string;
    current_level?: string;
    credit: number;
    status: string;
  }>;
}

interface ApplyOpportunityModalProps {
  currentEmployee: Employee;
  opportunity: OpportunityItem;
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
  onShowToast: (message: string) => void;
}

export const ApplyOpportunityModal: React.FC<ApplyOpportunityModalProps> = ({
  currentEmployee,
  opportunity,
  onClose,
  onSuccess,
  onShowToast
}) => {
  const [committedHours, setCommittedHours] = useState<number>(0);
  const [hoursCommitment, setHoursCommitment] = useState<number>(
    Math.min(currentEmployee.hoursPerWeekFree || 20, 20) || 10
  );
  const [note, setNote] = useState(
    `Hi team, I would love to contribute to ${opportunity.name}. I have verified experience with the required stack and currently have ${currentEmployee.hoursPerWeekFree || 20} hrs/week available.`
  );
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    fetch('/api/employee/availability', { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data && typeof data.committed_hours === 'number') {
          setCommittedHours(data.committed_hours);
        }
      })
      .catch(() => {});
  }, []);

  const isOvercommitted = (committedHours + hoursCommitment) > 40;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isOvercommitted) {
      onShowToast(`Cannot apply: committing ${hoursCommitment}h would exceed total capacity of 40h/wk.`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/project-applications', {
        method: 'POST',
        body: JSON.stringify({
          opportunity_id: opportunity.id,
          opportunity_type: opportunity.type,
          note: note.trim(),
          hours_per_week: hoursCommitment
        })
      });

      if (!res.ok) {
        throw new Error(res.error || 'Failed to submit application');
      }

      await onSuccess();
      onShowToast(`Application submitted for ${opportunity.name}! Hiring lead notified.`);
      onClose();
    } catch (err) {
      onShowToast(err instanceof Error ? err.message : 'Error submitting application.');
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
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-600 border border-teal-500/20">
                  {opportunity.type === 'project' ? 'Project Gig' : 'Career Role'}
                </span>
                <span className="text-2xs font-bold text-teal-600 dark:text-teal-400">
                  {opportunity.matchScore}% Skill Match
                </span>
              </div>
              <h2 className="text-lg font-bold text-text-primary mt-1">{opportunity.name}</h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Opportunity Card Summary */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="rounded-2xl border border-border bg-surface-alt p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between text-text-muted">
              <span className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-teal-500" /> {opportunity.department}
              </span>
              <span>Commitment: <strong className="text-text-primary">{opportunity.commitment || 'Flexible'}</strong></span>
            </div>
            {opportunity.technologies && (
              <div className="flex flex-wrap gap-1 pt-1">
                {(Array.isArray(opportunity.technologies)
                  ? opportunity.technologies
                  : String(opportunity.technologies).split('|').filter(Boolean)
                ).map((tech, idx) => (
                  <span
                    key={idx}
                    className="text-[10px] font-semibold bg-surface border border-border px-2 py-0.5 rounded-md text-text-primary"
                  >
                    {tech}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Applicant Bandwidth & Commitment */}
          <div>
            <div className="flex items-center justify-between text-xs font-semibold text-text-muted mb-1.5">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-teal-500" /> Weekly Bandwidth Commitment
              </span>
              <span className="text-teal-600 font-bold">{hoursCommitment} hrs / week</span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[5, 10, 15, 20].map(hrs => (
                <button
                  key={hrs}
                  type="button"
                  onClick={() => setHoursCommitment(hrs)}
                  className={`rounded-xl border py-2 text-xs font-semibold transition-all ${
                    hoursCommitment === hrs
                      ? 'border-teal-500 bg-teal-500/10 text-teal-700 dark:text-teal-300'
                      : 'border-border bg-surface text-text-muted hover:border-border/80 hover:text-text-primary'
                  }`}
                >
                  {hrs} hrs/wk
                </button>
              ))}
            </div>
            <p className="text-[11px] text-text-muted mt-1.5 flex items-center justify-between">
              <span>Free capacity: <strong className="text-text-primary">{Math.max(0, 40 - committedHours)} hrs/wk</strong></span>
              <span>Committed: <strong className="text-text-primary">{committedHours} hrs/wk</strong></span>
            </p>
            {isOvercommitted && (
              <div className="mt-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-700 dark:text-rose-300">
                ⚠️ <strong>Overcommitment:</strong> Adding {hoursCommitment}h/wk exceeds total 40h/wk capacity ({committedHours}h already committed). Please lower hours.
              </div>
            )}
          </div>

          {/* Note / Pitch */}
          <div>
            <label className="block text-xs font-semibold text-text-muted mb-1.5">
              Application Note / Relevant Highlights
            </label>
            <textarea
              rows={4}
              required
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Highlight your experience with the required tech, relevant projects, and interest..."
              className="w-full rounded-xl border border-border bg-surface p-3 text-xs text-text-primary placeholder:text-text-muted/50 focus:border-teal-500 focus:outline-none resize-none leading-relaxed"
            />
          </div>

          {/* Review Banner */}
          <div className="rounded-xl border border-teal-500/20 bg-teal-500/5 p-3 text-xs text-text-muted flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-teal-500 shrink-0" />
            <span>
              Your evaluated skills and evidence portfolio will be attached automatically to your application profile.
            </span>
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
              disabled={submitting || isOvercommitted}
              className="rounded-xl px-5 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-xs"
            >
              {submitting ? (
                <span>Submitting…</span>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" /> Submit Application
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
