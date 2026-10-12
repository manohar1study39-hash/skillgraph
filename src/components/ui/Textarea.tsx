import React from 'react';
import { AlertCircle } from 'lucide-react';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({
  label,
  error,
  helperText,
  className = '',
  id,
  rows = 3,
  ...props
}, ref) => {
  const generatedId = id || (label ? `textarea-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

  return (
    <div className="w-full space-y-1.5 text-left">
      {label && (
        <label htmlFor={generatedId} className="block text-xs font-semibold text-ink tracking-wide">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={generatedId}
        rows={rows}
        aria-invalid={Boolean(error)}
        className={`w-full rounded-input border bg-surface p-3.5 text-sm text-ink placeholder:text-muted/70 transition-all duration-base focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-45 resize-y ${
          error
            ? 'border-danger focus:border-danger focus:ring-danger/20 text-danger'
            : 'border-border hover:border-border-strong focus:border-primary focus:ring-primary/20 shadow-xs'
        } ${className}`}
        {...props}
      />
      {error && (
        <div role="alert" className="flex items-center gap-1.5 text-xs font-medium text-danger">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {!error && helperText && (
        <p className="text-xs text-muted">
          {helperText}
        </p>
      )}
    </div>
  );
});

Textarea.displayName = 'Textarea';
