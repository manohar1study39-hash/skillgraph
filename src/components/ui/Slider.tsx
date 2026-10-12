import React from 'react';

export interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  valueDisplay?: string | React.ReactNode;
  onChange: (value: number) => void;
  accentColor?: 'primary' | 'accent' | 'aurora';
}

export const Slider: React.FC<SliderProps> = ({
  value,
  min = 0,
  max = 100,
  step = 1,
  label,
  valueDisplay,
  onChange,
  accentColor = 'aurora',
  className = '',
  disabled = false,
  id,
  ...props
}) => {
  const percentage = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const generatedId = id || `slider-${Math.random().toString(36).slice(2, 8)}`;

  const fillGradient = accentColor === 'accent'
    ? `linear-gradient(to right, #19C3E6 0%, #19C3E6 ${percentage}%, var(--border-color) ${percentage}%, var(--border-color) 100%)`
    : `linear-gradient(to right, #6D4AFF 0%, #19C3E6 ${percentage}%, var(--border-color) ${percentage}%, var(--border-color) 100%)`;

  return (
    <div className={`w-full space-y-1.5 text-left ${className}`}>
      {(label || valueDisplay !== undefined) && (
        <div className="flex items-center justify-between text-xs">
          {label && <label htmlFor={generatedId} className="font-semibold text-ink tracking-wide">{label}</label>}
          {valueDisplay !== undefined && (
            <span className="font-bold tabular-nums text-ink">{valueDisplay}</span>
          )}
        </div>
      )}
      <div className="relative flex items-center">
        <input
          id={generatedId}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={e => onChange(Number(e.target.value))}
          style={{ background: fillGradient }}
          className="w-full h-2 rounded-full appearance-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4.5 [&::-webkit-slider-thumb]:w-4.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-primary [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:duration-fast [&::-webkit-slider-thumb]:hover:scale-115 [&::-webkit-slider-thumb]:active:scale-95"
          {...props}
        />
      </div>
    </div>
  );
};
