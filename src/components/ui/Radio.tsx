import React from 'react';

export interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: React.ReactNode;
  description?: string;
}

export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(({
  label,
  description,
  checked,
  onChange,
  className = '',
  disabled,
  id,
  ...props
}, ref) => {
  const generatedId = id || `radio-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <label
      htmlFor={generatedId}
      className={`inline-flex items-start gap-2.5 cursor-pointer select-none text-left ${disabled ? 'opacity-45 cursor-not-allowed' : ''}`}
    >
      <div className="relative flex items-center justify-center mt-0.5">
        <input
          ref={ref}
          type="radio"
          id={generatedId}
          checked={checked}
          onChange={onChange}
          disabled={disabled}
          className="peer sr-only"
          {...props}
        />
        <div className={`h-4.5 w-4.5 rounded-full border transition-all duration-fast flex items-center justify-center ${
          checked
            ? 'border-primary bg-surface shadow-xs'
            : 'border-border-strong bg-surface hover:border-primary/70'
        } peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 ${className}`}>
          {checked && <div className="h-2 w-2 rounded-full bg-primary" />}
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

Radio.displayName = 'Radio';
