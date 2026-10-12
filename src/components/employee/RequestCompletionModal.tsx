import React, { useState } from 'react';
import { X, Award, Link as LinkIcon, FileCheck, AlertCircle, Sparkles } from 'lucide-react';

interface RequestCompletionModalProps {
  resourceId: string;
  courseTitle: string;
  roleId?: string;
  skillName?: string;
  onClose: () => void;
  onSuccess: () => void;
  onShowToast: (msg: string) => void;
}

export const RequestCompletionModal: React.FC<RequestCompletionModalProps> = ({
  resourceId,
  courseTitle,
  roleId,
  skillName,
  onClose,
  onSuccess,
  onShowToast
}) => {
  const [proofUrl, setProofUrl] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proofUrl.trim() || proofUrl.trim().length < 3) {
      setErrorMsg('Please enter a valid certificate URL, Credly badge link, or certificate ID.');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/upskilling/request-completion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          resource_id: resourceId,
          role_id: roleId,
          proof_url: proofUrl.trim(),
          note: note.trim() || undefined
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || data.error || 'Failed to submit completion request.');
      }

      onSuccess();
      onShowToast(data.message || 'Completion requested! Partial credit (+0.2 level) awarded pending HR review.');
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error submitting request.');
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
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center justify-center font-bold">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-heading font-semibold text-text-primary">
                Request Course Completion
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

          {/* Explanation Banner */}
          <div className="p-3.5 rounded-xl border border-amber-500/25 bg-amber-500/5 text-xs text-text-muted space-y-1">
            <div className="font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5" /> What happens next?
            </div>
            <p>
              Submitting verification moves your course status to <strong className="text-text-primary">Awaiting approval</strong> and immediately grants <strong className="text-text-primary">+0.2 level partial credit</strong> towards {skillName || 'your skill'} (capped at +0.5 across all courses). Once HR verifies your link, 100% completion credit is awarded.
            </p>
          </div>

          {/* Proof URL / Cert ID */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-text-primary flex items-center gap-1.5">
              <LinkIcon className="w-3.5 h-3.5 text-text-muted" /> Certificate URL or Verification ID: <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={proofUrl}
              onChange={e => setProofUrl(e.target.value)}
              placeholder="e.g., https://credly.com/badges/abc-123 or cert #CERT-9921"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-amber-500 focus:outline-none"
            />
            <span className="text-[11px] text-text-muted block">
              Provide a direct link to your digital badge, Coursera certificate, Credly record, or capstone PR.
            </span>
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-text-primary flex items-center gap-1.5">
              <FileCheck className="w-3.5 h-3.5 text-text-muted" /> Verification Notes for Reviewer:
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g., Completed all module assessments with 95% score and submitted final project."
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-amber-500 focus:outline-none resize-none"
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
              className="px-5 py-2 text-xs font-bold rounded-xl bg-amber-600 hover:bg-amber-700 text-white transition-all shadow-xs flex items-center gap-1.5 disabled:opacity-50"
            >
              <Award className="w-4 h-4" />
              {submitting ? 'Submitting...' : 'Request Verification'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
