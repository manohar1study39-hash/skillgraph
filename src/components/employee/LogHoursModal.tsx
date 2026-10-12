import React, { useState } from 'react';
import { X, Clock, Calendar, Link as LinkIcon, FileText, CheckCircle2, AlertCircle } from 'lucide-react';

interface LogHoursModalProps {
  resourceId: string;
  courseTitle: string;
  roleId?: string;
  currentHoursLogged: number;
  totalEstimatedHours: number;
  onClose: () => void;
  onSuccess: (updatedHours: number, newPercent: number) => void;
  onShowToast: (msg: string) => void;
}

export const LogHoursModal: React.FC<LogHoursModalProps> = ({
  resourceId,
  courseTitle,
  roleId,
  currentHoursLogged,
  totalEstimatedHours,
  onClose,
  onSuccess,
  onShowToast
}) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const [hoursToAdd, setHoursToAdd] = useState<string>('2');
  const [date, setDate] = useState<string>(todayStr);
  const [note, setNote] = useState<string>('');
  const [link, setLink] = useState<string>('');
  const [submitForCompletion, setSubmitForCompletion] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const numHours = parseFloat(hoursToAdd) || 0;
  const projectedHours = Math.round((currentHoursLogged + numHours) * 10) / 10;
  const targetReqHours = totalEstimatedHours || 10;
  const isMeetingRequirement = projectedHours >= targetReqHours;
  const projectedPercent = isMeetingRequirement
    ? 100
    : Math.min(100, Math.round((projectedHours / targetReqHours) * 100));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (numHours <= 0 || numHours > 24) {
      setErrorMsg('Please enter between 0.1 and 24.0 hours.');
      return;
    }
    if (date > todayStr) {
      setErrorMsg('Log date cannot be in the future.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/upskilling/log-hours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          resource_id: resourceId,
          role_id: roleId,
          hours: numHours,
          date,
          note: note.trim() || undefined,
          link: link.trim() || undefined
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || data.error || 'Failed to log hours.');
      }

      const isHoursComplete = data.hours_logged >= targetReqHours || data.progress_percent >= 99;

      if (isHoursComplete && submitForCompletion) {
        try {
          const compRes = await fetch('/api/upskilling/request-completion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
              resource_id: resourceId,
              role_id: roleId,
              proof_url: link.trim() || 'https://verify.skillgraph.demo/completion',
              note: note.trim() || `Completed all ${targetReqHours}h required learning hours.`
            })
          });
          if (compRes.ok) {
            onSuccess(data.hours_logged, 100);
            onShowToast(`🎉 Logged ${numHours} hours! Course is 100% complete and submitted for HR review!`);
            onClose();
            return;
          }
        } catch {
          // fallback to standard logging toast
        }
      }

      const displayPct = isHoursComplete ? 100 : data.progress_percent;
      onSuccess(data.hours_logged, displayPct);
      if (isHoursComplete) {
        onShowToast(`🎉 Logged ${numHours} hours! 100% of study hours completed! Click 'Request Completion' to submit for official HR verification.`);
      } else {
        onShowToast(`Logged ${numHours} hours! Course is now ${data.progress_percent}% complete.`);
      }
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error logging hours.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-surface border border-border rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl space-y-0">
        {/* Header */}
        <div className="p-5 border-b border-border flex items-center justify-between bg-surface-muted/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20 flex items-center justify-center font-bold">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-heading font-semibold text-text-primary">
                Log Learning Hours
              </h3>
              <p className="text-xs text-text-muted truncate max-w-xs sm:max-w-sm">
                {courseTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-surface-alt transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Quick Stats Banner */}
          <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl border border-border bg-surface-alt text-xs">
            <div>
              <span className="text-text-muted block text-[11px]">Current Progress:</span>
              <strong className="text-text-primary text-sm font-mono font-bold">
                {currentHoursLogged} / {totalEstimatedHours} hrs
              </strong>
            </div>
            <div>
              <span className="text-text-muted block text-[11px]">Projected Progress:</span>
              <strong className="text-teal-600 dark:text-teal-400 text-sm font-mono font-bold">
                {projectedHours} hrs ({projectedPercent}%)
              </strong>
            </div>
          </div>

          {/* 100% Completion Callout Banner */}
          {isMeetingRequirement && (
            <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>🎉 Course hours complete (100% Study Requirement Met)!</span>
              </div>
              <label className="flex items-start gap-2 text-xs text-text-primary cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={submitForCompletion}
                  onChange={e => setSubmitForCompletion(e.target.checked)}
                  className="mt-0.5 rounded border-emerald-500 text-teal-600 focus:ring-teal-500 cursor-pointer"
                />
                <span className="text-emerald-800 dark:text-emerald-200">
                  Submit for official HR completion review now to unlock certified skill credit &amp; level advancement
                </span>
              </label>
            </div>
          )}

          {/* Hours Input & Quick Pill Buttons */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-text-primary">
              Hours Logged in this Session:
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.5"
                min="0.1"
                max="24"
                required
                value={hoursToAdd}
                onChange={e => setHoursToAdd(e.target.value)}
                className="w-32 rounded-xl border border-border bg-surface px-3 py-2 text-sm font-bold text-text-primary focus:border-teal-500 focus:outline-none"
              />
              <span className="text-xs text-text-muted">hours</span>
              <div className="flex items-center gap-1.5 ml-auto">
                {['1', '2', '4', '8'].map(val => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setHoursToAdd(val)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all ${
                      hoursToAdd === val
                        ? 'bg-teal-600 text-white border-teal-600'
                        : 'bg-surface border-border text-text-muted hover:text-text-primary'
                    }`}
                  >
                    +{val}h
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Date Input */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-text-primary flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-text-muted" /> Date Completed:
            </label>
            <input
              type="date"
              max={todayStr}
              required
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-text-primary focus:border-teal-500 focus:outline-none"
            />
          </div>

          {/* Session Note */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-text-primary flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-text-muted" /> Session Note / Topics Covered:
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g., Completed modules 3 & 4 on asyncio task scheduling..."
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-teal-500 focus:outline-none resize-none"
            />
          </div>

          {/* Optional Proof / Notebook Link */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-text-primary flex items-center gap-1.5">
              <LinkIcon className="w-3.5 h-3.5 text-text-muted" /> Lab Link / Notebook URL (Optional):
            </label>
            <input
              type="url"
              value={link}
              onChange={e => setLink(e.target.value)}
              placeholder="https://github.com/my-lab-exercises"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-teal-500 focus:outline-none"
            />
          </div>

          {/* Footer actions */}
          <div className="pt-3 border-t border-border flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-border text-text-muted hover:text-text-primary hover:bg-surface-alt transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-xs font-bold rounded-xl bg-teal-600 hover:bg-teal-700 text-white transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              {submitting ? 'Saving...' : 'Save Logged Hours'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
