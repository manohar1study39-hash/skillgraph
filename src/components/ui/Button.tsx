import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'accent';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  className = '',
  disabled,
  ...props
}, ref) => {
  const baseStyles = 'inline-flex items-center justify-center font-semibold text-sm transition-all duration-base rounded-button outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 disabled:pointer-events-none disabled:shadow-none select-none active:scale-[0.98] relative overflow-hidden';

  const sizeStyles = {
    sm: 'h-9 px-3.5 text-xs gap-2',
    md: 'h-10 px-4 text-sm gap-2',
    lg: 'h-12 px-6 text-base gap-2.5',
  }[size];

  const variantStyles = {
    primary: 'aurora-btn-primary',
    secondary: 'bg-surface text-ink border border-border hover:bg-surface-hover hover:border-border-strong hover:text-ink shadow-xs',
    outline: 'border border-primary text-primary hover:bg-primary-tint/60 dark:hover:bg-primary-tint/20 active:bg-primary-tint',
    ghost: 'text-muted hover:text-ink hover:bg-surface-alt active:bg-surface-alt/80',
    danger: 'bg-danger text-white hover:bg-danger-hover active:bg-danger shadow-xs hover:shadow-sm',
    accent: 'bg-cyan text-ink hover:bg-cyan-hover shadow-xs hover:shadow-glow-cyan',
  }[variant];

  return (
    <button
      ref={ref}
      disabled={disabled || isLoading}
      className={`${baseStyles} ${sizeStyles} ${variantStyles} ${className}`}
      {...props}
    >
      {isLoading && (
        <span className="absolute inset-0 flex items-center justify-center bg-inherit bg-opacity-90">
          <Loader2 className="h-4 w-4 animate-spin text-current" />
        </span>
      )}
      <span className={`inline-flex items-center gap-2 ${isLoading ? 'invisible' : ''}`}>
        {leftIcon && <span className="shrink-0">{leftIcon}</span>}
        {children}
        {rightIcon && <span className="shrink-0">{rightIcon}</span>}
      </span>
    </button>
  );
});

Button.displayName = 'Button';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  'aria-label': string;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(({
  icon,
  variant = 'ghost',
  size = 'md',
  isLoading = false,
  className = '',
  disabled,
  'aria-label': ariaLabel,
  ...props
}, ref) => {
  const baseStyles = 'inline-flex items-center justify-center rounded-button transition-all duration-base outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45 disabled:pointer-events-none select-none active:scale-[0.98]';

  const sizeStyles = {
    sm: 'h-9 w-9',
    md: 'h-10 w-10',
    lg: 'h-12 w-12',
  }[size];

  const variantStyles = {
    primary: 'aurora-btn-primary',
    secondary: 'bg-surface text-ink border border-border hover:bg-surface-hover hover:border-border-strong shadow-xs',
    outline: 'border border-border text-ink hover:border-primary hover:text-primary active:bg-primary-tint/30',
    ghost: 'text-muted hover:text-ink hover:bg-surface-alt active:bg-surface-alt/80',
    danger: 'text-danger hover:bg-danger-tint border border-transparent hover:border-danger/30',
  }[variant];

  return (
    <button
      ref={ref}
      disabled={disabled || isLoading}
      aria-label={ariaLabel}
      className={`${baseStyles} ${sizeStyles} ${variantStyles} ${className}`}
      {...props}
    >
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-current" /> : icon}
    </button>
  );
});

IconButton.displayName = 'IconButton';
