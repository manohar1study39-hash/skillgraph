import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose: () => void;
  duration?: number;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type = 'success',
  onClose,
  duration = 4000,
}) => {
  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(onClose, duration);
      return () => clearTimeout(timer);
    }
  }, [duration, onClose]);

  const icons = {
    success: <CheckCircle2 className="h-4 w-4 text-success" />,
    error: <AlertCircle className="h-4 w-4 text-danger" />,
    info: <Info className="h-4 w-4 text-cyan" />,
  }[type];

  return (
    <div
      role="status"
      className="fixed top-5 right-5 z-[70] flex flex-col overflow-hidden rounded-card border border-border bg-surface shadow-modal transition-all duration-base text-xs font-medium text-ink min-w-[280px] max-w-sm"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="shrink-0">{icons}</span>
        <span className="flex-1 leading-snug">{message}</span>
        <button
          onClick={onClose}
          aria-label="Dismiss notification"
          className="rounded-button p-1 text-muted hover:bg-surface-alt hover:text-ink transition-colors ml-1"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {duration > 0 && (
        <div className="h-0.5 w-full bg-border-subtle overflow-hidden">
          <div
            className="h-full bg-aurora"
            style={{
              animation: `shrinkWidth ${duration}ms linear forwards`
            }}
          />
        </div>
      )}
      <style>{`
        @keyframes shrinkWidth {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
};
