import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  message,
  onRetry,
  className = '',
}) => {
  return (
    <div
      role="alert"
      className={`flex items-start gap-3.5 p-4 rounded-card border border-danger/30 bg-danger-tint text-left ${className}`}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-danger/10 text-danger">
        <AlertCircle className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <h5 className="text-xs font-semibold text-danger-text">{title}</h5>
        <p className="mt-0.5 text-xs text-danger-text/90 leading-relaxed">{message}</p>
      </div>
      {onRetry && (
        <Button
          size="sm"
          variant="outline"
          onClick={onRetry}
          leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
          className="shrink-0 border-danger/40 text-danger-text hover:bg-danger/10"
        >
          Retry
        </Button>
      )}
    </div>
  );
};
