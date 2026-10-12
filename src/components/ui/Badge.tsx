import React from 'react';

export type BadgeVariant =
  | 'primary'
  | 'accent'
  | 'cyan'
  | 'amber'
  | 'highlight'
  | 'aurora'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'
  | 'employee'
  | 'manager'
  | 'hr';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
  icon?: React.ReactNode;
  onRemove?: () => void;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'neutral',
  size = 'md',
  dot = false,
  icon,
  onRemove,
  className = '',
  ...props
}) => {
  const sizeStyles = {
    sm: 'text-[11px] px-2 py-0.5 gap-1 leading-4',
    md: 'text-xs px-2.5 py-0.5 gap-1.5 leading-5 font-medium',
    lg: 'text-sm px-3.5 py-1 gap-2 leading-5 font-semibold',
  }[size];

  const variantStyles: Record<BadgeVariant, { container: string; dot: string }> = {
    primary: {
      container: 'bg-primary-tint text-primary border border-primary/20 dark:bg-primary-tint dark:border-primary/30',
      dot: 'bg-primary',
    },
    aurora: {
      container: 'bg-aurora text-white border-transparent shadow-xs',
      dot: 'bg-white',
    },
    cyan: {
      container: 'bg-cyan-tint text-[#087F9C] border border-[#19C3E6]/30 dark:bg-[#19C3E6]/15 dark:text-[#3AD3F0] dark:border-[#3AD3F0]/30',
      dot: 'bg-cyan',
    },
    accent: {
      container: 'bg-cyan-tint text-[#087F9C] border border-[#19C3E6]/30 dark:bg-[#19C3E6]/15 dark:text-[#3AD3F0] dark:border-[#3AD3F0]/30',
      dot: 'bg-cyan',
    },
    amber: {
      container: 'bg-[#FFF4DE] text-[#B45309] border border-[#FFB547]/40 dark:bg-[#FFB547]/15 dark:text-[#FFB547] dark:border-[#FFB547]/30',
      dot: 'bg-[#FFB547]',
    },
    highlight: {
      container: 'bg-[#FFF4DE] text-[#B45309] border border-[#FFB547]/40 dark:bg-[#FFB547]/15 dark:text-[#FFB547] dark:border-[#FFB547]/30',
      dot: 'bg-[#FFB547]',
    },
    success: {
      container: 'bg-success-tint text-success-text border border-success-border dark:bg-success-tint dark:text-[#34D399] dark:border-success-border',
      dot: 'bg-success',
    },
    warning: {
      container: 'bg-warning-tint text-warning-text border border-warning-border dark:bg-warning-tint dark:text-[#FBBF24] dark:border-warning-border',
      dot: 'bg-warning',
    },
    danger: {
      container: 'bg-danger-tint text-danger-text border border-danger-border dark:bg-danger-tint dark:text-[#F87171] dark:border-danger-border',
      dot: 'bg-danger',
    },
    info: {
      container: 'bg-info-tint text-info-text border border-info-border dark:bg-info-tint dark:text-[#7DD3FC] dark:border-info-border',
      dot: 'bg-info',
    },
    neutral: {
      container: 'bg-surface-alt text-muted border border-border dark:bg-surface-alt dark:text-muted',
      dot: 'bg-muted',
    },
    employee: {
      container: 'bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0] dark:bg-[#10B981]/15 dark:text-[#34D399] dark:border-[#10B981]/30',
      dot: 'bg-[#10B981]',
    },
    manager: {
      container: 'bg-[#E3F8FD] text-[#0369A1] border border-[#BAE6FD] dark:bg-[#19C3E6]/15 dark:text-[#3AD3F0] dark:border-[#19C3E6]/30',
      dot: 'bg-[#19C3E6]',
    },
    hr: {
      container: 'bg-[#F6EEFF] text-[#6B21A8] border border-[#E9D5FF] dark:bg-[#B14AFF]/15 dark:text-[#D8B4FE] dark:border-[#B14AFF]/30',
      dot: 'bg-[#B14AFF]',
    },
  };

  const style = variantStyles[variant];

  return (
    <span
      className={`inline-flex items-center rounded-chip transition-all duration-fast ${sizeStyles} ${style.container} ${className}`}
      {...props}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${style.dot}`} />}
      {icon && <span className="shrink-0">{icon}</span>}
      <span>{children}</span>
      {onRemove && (
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-0.5 -mr-1 rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10 transition-colors"
          aria-label="Remove"
        >
          <svg className="h-3 w-3 stroke-current" viewBox="0 0 24 24" fill="none">
            <path d="M18 6L6 18M6 6l12 12" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}
    </span>
  );
};
