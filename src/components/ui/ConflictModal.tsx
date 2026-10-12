import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';
import { subscribeToConflicts } from '../../services/queryClient';

export interface ConflictModalProps {
  readonly onGlobalReload?: () => void;
}

export function ConflictModal({ onGlobalReload }: Readonly<ConflictModalProps>) {
  const [conflict, setConflict] = useState<{ message: string; onReload?: () => void } | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeToConflicts((detail) => {
      setConflict(detail);
    });

    const handleCustomEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ message?: string; onReload?: () => void }>;
      setConflict({
        message: customEvent.detail?.message || 'This was changed by someone else. Reload to see the latest.',
        onReload: customEvent.detail?.onReload,
      });
    };

    window.addEventListener('skillgraph-conflict', handleCustomEvent);

    return () => {
      unsubscribe();
      window.removeEventListener('skillgraph-conflict', handleCustomEvent);
    };
  }, []);

  if (!conflict) return null;

  const handleReload = () => {
    if (conflict.onReload) {
      conflict.onReload();
    }
    if (onGlobalReload) {
      onGlobalReload();
    }
    setConflict(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="conflict-title"
        aria-describedby="conflict-description"
        className="w-full max-w-md rounded-2xl border border-warning/40 bg-surface p-6 shadow-2xl space-y-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warning/10 text-warning border border-warning/30">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 id="conflict-title" className="text-base font-semibold text-text-primary">
                Concurrent Update Detected
              </h3>
              <p className="text-xs text-text-muted">Optimistic Concurrency Control</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setConflict(null)}
            className="rounded-lg p-1 text-text-muted hover:bg-surface-elevated hover:text-text-primary transition"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="rounded-xl border border-warning/20 bg-warning/5 p-3.5 text-sm text-text-primary">
          <p id="conflict-description">{conflict.message}</p>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => setConflict(null)}
            className="rounded-xl border border-border px-4 py-2 text-sm font-medium text-text-secondary hover:bg-surface-elevated transition"
          >
            Dismiss
          </button>
          <button
            type="button"
            onClick={handleReload}
            className="flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-white shadow-lg shadow-accent/20 hover:bg-accent-hover transition"
          >
            <RefreshCw className="h-4 w-4" />
            Reload Latest
          </button>
        </div>
      </div>
    </div>
  );
}
