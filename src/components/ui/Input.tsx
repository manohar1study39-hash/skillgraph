import React from 'react';
import { AlertCircle } from 'lucide-react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  helperText,
  leftIcon,
  rightIcon,
  className = '',
  id,
  ...props
}, ref) => {
  const generatedId = id || (label ? `input-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

  return (
    <div className="w-full space-y-1.5 text-left">
      {label && (
        <label
          htmlFor={generatedId}
          className="block text-xs font-semibold text-ink tracking-wide"
        >
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {leftIcon && (
          <span className="pointer-events-none absolute left-3.5 flex items-center text-muted">
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          id={generatedId}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${generatedId}-error` : helperText ? `${generatedId}-helper` : undefined}
          className={`h-11 w-full rounded-input border bg-surface px-3.5 text-sm text-ink placeholder:text-muted/70 transition-all duration-base focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-45 ${
            leftIcon ? 'pl-10' : 'pl-3.5'
          } ${rightIcon ? 'pr-10' : 'pr-3.5'} ${
            error
              ? 'border-danger focus:border-danger focus:ring-danger/20 text-danger'
              : 'border-border hover:border-border-strong focus:border-primary focus:ring-primary/20 shadow-xs'
          } ${className}`}
          {...props}
        />
        {rightIcon && (
          <span className="absolute right-3.5 flex items-center text-muted">
            {rightIcon}
          </span>
        )}
      </div>
      {error && (
        <div id={`${generatedId}-error`} role="alert" className="flex items-center gap-1.5 text-xs font-medium text-danger">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {!error && helperText && (
        <p id={`${generatedId}-helper`} className="text-xs text-muted">
          {helperText}
        </p>
      )}
    </div>
  );
});

Input.displayName = 'Input';
