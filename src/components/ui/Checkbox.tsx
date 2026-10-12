import React from 'react';
import { Check } from 'lucide-react';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
  description?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(({
  label,
  description,
  checked,
  onChange,
  className = '',
  disabled,
  id,
  ...props
}, ref) => {
  const generatedId = id || `cb-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <label
      htmlFor={generatedId}
      className={`inline-flex items-start gap-2.5 cursor-pointer select-none text-left ${disabled ? 'opacity-45 cursor-not-allowed' : ''}`}
    >
      <div className="relative flex items-center justify-center mt-0.5">
        <input
          ref={ref}
          type="checkbox"
          id={generatedId}
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className="peer sr-only"
          {...props}
        />
        <div className={`h-4.5 w-4.5 rounded-[5px] border transition-all duration-fast flex items-center justify-center ${
          checked
            ? 'bg-aurora border-transparent text-white shadow-xs'
            : 'border-border-strong bg-surface hover:border-primary/70'
        } peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 ${className}`}>
          {checked && <Check className="h-3 w-3 stroke-[3]" />}
        </div>
      </div>
      {(label || description) && (
        <div className="text-xs">
          {label && <span className="font-medium text-ink block">{label}</span>}
          {description && <span className="text-muted block mt-0.5">{description}</span>}
        </div>
      )}
    </label>
  );
});

Checkbox.displayName = 'Checkbox';
