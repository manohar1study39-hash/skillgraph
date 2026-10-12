import React, { useState } from 'react';
import { X, Sparkles, BookOpen, Link as LinkIcon, Clock, CheckCircle2, AlertCircle } from 'lucide-react';

interface SuggestCourseModalProps {
  onClose: () => void;
  onSuccess: (newSuggestion: any) => void;
  onShowToast: (msg: string) => void;
}

export const SuggestCourseModal: React.FC<SuggestCourseModalProps> = ({
  onClose,
  onSuccess,
  onShowToast
}) => {
  const [title, setTitle] = useState<string>('');
  const [provider, setProvider] = useState<string>('');
  const [url, setUrl] = useState<string>('');
  const [skillId, setSkillId] = useState<string>('');
  const [estimatedHours, setEstimatedHours] = useState<string>('12');
  const [whyHelpful, setWhyHelpful] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || title.trim().length < 3) {
      setErrorMsg('Please enter a course title (min 3 characters).');
      return;
    }

    setSubmitting(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/learning-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          title: title.trim(),
          provider: provider.trim() || 'External Provider',
          url: url.trim() || undefined,
          skill_id: skillId.trim() || undefined,
          estimated_hours: parseFloat(estimatedHours) || 10,
          why_helpful: whyHelpful.trim() || undefined
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || data.error || 'Failed to submit course suggestion.');
      }

      onSuccess(data.suggestion);
      onShowToast('Course suggestion submitted! It will appear in your suggestions list for HR review.');
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Error submitting course suggestion.');
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
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-heading font-semibold text-text-primary">
                Suggest a New Learning Course
              </h3>
              <p className="text-xs text-text-muted">
                Recommend external or internal courses to enrich our technical curriculum.
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Title */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-text-primary">
              Course Title: <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g., Deep Learning Specialization / Microservices in Go"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-teal-500 focus:outline-none"
            />
          </div>

          {/* Provider & Estimated Hours Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-text-primary">
                Provider / Platform:
              </label>
              <input
                type="text"
                value={provider}
                onChange={e => setProvider(e.target.value)}
                placeholder="e.g., Coursera, O'Reilly, Udemy"
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-teal-500 focus:outline-none"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-text-primary flex items-center gap-1">
                <Clock className="w-3.5 h-3.5 text-text-muted" /> Est. Hours:
              </label>
              <input
                type="number"
                min="1"
                max="120"
                value={estimatedHours}
                onChange={e => setEstimatedHours(e.target.value)}
                className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-text-primary focus:border-teal-500 focus:outline-none"
              />
            </div>
          </div>

          {/* URL */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-text-primary flex items-center gap-1">
              <LinkIcon className="w-3.5 h-3.5 text-text-muted" /> Course URL:
            </label>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://coursera.org/learn/..."
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-teal-500 focus:outline-none"
            />
          </div>

          {/* Target Skill */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-text-primary flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5 text-text-muted" /> Target Skill Name / ID:
            </label>
            <input
              type="text"
              value={skillId}
              onChange={e => setSkillId(e.target.value)}
              placeholder="e.g., Python, Kubernetes, System Design"
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-teal-500 focus:outline-none"
            />
          </div>

          {/* Why Helpful */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-text-primary">
              Why is this course valuable for our team?
            </label>
            <textarea
              rows={2}
              value={whyHelpful}
              onChange={e => setWhyHelpful(e.target.value)}
              placeholder="Explains modern best practices and gives hands-on lab experience..."
              className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-xs text-text-primary placeholder:text-text-muted focus:border-teal-500 focus:outline-none resize-none"
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
              {submitting ? 'Submitting...' : 'Submit Suggestion'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
