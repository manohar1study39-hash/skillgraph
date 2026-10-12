import React from 'react';
import { ChevronDown, AlertCircle } from 'lucide-react';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options?: SelectOption[];
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(({
  label,
  error,
  options,
  children,
  className = '',
  id,
  ...props
}, ref) => {
  const generatedId = id || (label ? `select-${label.toLowerCase().replace(/\s+/g, '-')}` : undefined);

  return (
    <div className="w-full space-y-1.5 text-left">
      {label && (
        <label htmlFor={generatedId} className="block text-xs font-semibold text-ink tracking-wide">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        <select
          ref={ref}
          id={generatedId}
          aria-invalid={Boolean(error)}
          className={`h-11 w-full appearance-none rounded-input border bg-surface pl-3.5 pr-10 text-sm text-ink transition-all duration-base focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-45 ${
            error
              ? 'border-danger focus:border-danger focus:ring-danger/20 text-danger'
              : 'border-border hover:border-border-strong focus:border-primary focus:ring-primary/20 shadow-xs'
          } ${className}`}
          {...props}
        >
          {options ? options.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          )) : children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3.5 h-4 w-4 text-muted" />
      </div>
      {error && (
        <div role="alert" className="flex items-center gap-1.5 text-xs font-medium text-danger">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
});

Select.displayName = 'Select';
