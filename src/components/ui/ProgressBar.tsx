import React from 'react';

export interface ProgressBarProps {
  value: number; // 0 to 100
  max?: number;
  label?: string;
  valueDisplay?: string;
  variant?: 'primary' | 'cyan' | 'accent' | 'gradient' | 'aurora' | 'success' | 'amber';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max = 100,
  label,
  valueDisplay,
  variant = 'aurora',
  size = 'md',
  className = '',
}) => {
  const percentage = Math.max(0, Math.min(100, (value / max) * 100));

  const heightStyles = {
    sm: 'h-1.5',
    md: 'h-2',
    lg: 'h-3',
  }[size];

  const fillStyles = {
    primary: 'bg-primary',
    cyan: 'bg-cyan',
    accent: 'bg-cyan',
    success: 'bg-success',
    amber: 'bg-[#FFB547]',
    gradient: 'bg-aurora',
    aurora: 'bg-aurora',
  }[variant];

  return (
    <div className={`w-full space-y-1.5 text-left ${className}`}>
      {(label || valueDisplay) && (
        <div className="flex items-center justify-between text-xs">
          {label && <span className="font-medium text-muted">{label}</span>}
          {valueDisplay && <span className="font-semibold tabular-nums text-ink">{valueDisplay}</span>}
        </div>
      )}
      <div className={`w-full ${heightStyles} overflow-hidden rounded-full bg-surface-alt border border-border/60`}>
        <div
          className={`h-full ${fillStyles} rounded-full transition-all duration-slow ease-aurora`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
};

export interface ProgressRingProps {
  value: number; // 0 to 100
  size?: number;
  strokeWidth?: number;
  variant?: 'primary' | 'cyan' | 'accent' | 'aurora' | 'success' | 'amber';
  label?: React.ReactNode;
}

export const ProgressRing: React.FC<ProgressRingProps> = ({
  value,
  size = 48,
  strokeWidth = 4,
  variant = 'aurora',
  label,
}) => {
  const percentage = Math.max(0, Math.min(100, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;
  const gradientId = `aurora-ring-${size}-${strokeWidth}`;

  return (
    <div className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#6D4AFF" />
            <stop offset="100%" stopColor="#19C3E6" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          className="stroke-border/70 fill-none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          stroke={
            variant === 'aurora' ? `url(#${gradientId})` :
            variant === 'primary' ? 'var(--color-primary)' :
            variant === 'cyan' || variant === 'accent' ? 'var(--color-cyan)' :
            variant === 'amber' ? 'var(--color-highlight)' :
            'var(--color-success)'
          }
          className="fill-none transition-all duration-slow ease-aurora"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-center">
        {label ?? <span className="text-xs font-bold tabular-nums text-ink">{Math.round(value)}%</span>}
      </div>
    </div>
  );
};
