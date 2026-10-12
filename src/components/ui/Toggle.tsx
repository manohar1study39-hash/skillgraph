import React from 'react';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  id?: string;
}

export const Toggle: React.FC<ToggleProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  size = 'md',
  id,
}) => {
  const generatedId = id || `toggle-${Math.random().toString(36).slice(2, 8)}`;

  const trackSizes = size === 'sm' ? 'w-8 h-4.5' : 'w-11 h-6';
  const thumbSizes = size === 'sm' ? 'h-3.5 w-3.5' : 'h-5 w-5';
  const translate = size === 'sm' ? (checked ? 'translate-x-3.5' : 'translate-x-0.5') : (checked ? 'translate-x-5' : 'translate-x-0.5');

  return (
    <label
      htmlFor={generatedId}
      className={`inline-flex items-center gap-3 cursor-pointer select-none text-left ${disabled ? 'opacity-45 cursor-not-allowed' : ''}`}
    >
      <div className="relative inline-flex items-center">
        <input
          type="checkbox"
          id={generatedId}
          checked={checked}
          onChange={e => !disabled && onChange(e.target.checked)}
          disabled={disabled}
          className="peer sr-only"
        />
        <div
          className={`${trackSizes} rounded-full transition-all duration-base flex items-center peer-focus-visible:ring-2 peer-focus-visible:ring-primary peer-focus-visible:ring-offset-2 ${
            checked ? 'bg-aurora shadow-xs' : 'bg-border-strong/70 dark:bg-border'
          }`}
        >
          <div
            className={`${thumbSizes} rounded-full bg-white shadow-sm transition-transform duration-base ease-aurora transform ${translate}`}
          />
        </div>
      </div>
      {(label || description) && (
        <div className="text-xs">
          {label && <span className="font-semibold text-ink block">{label}</span>}
          {description && <span className="text-muted block mt-0.5">{description}</span>}
        </div>
      )}
    </label>
  );
};
