import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverEffect?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  border?: boolean;
  raised?: boolean;
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(({
  children,
  hoverEffect = false,
  padding = 'md',
  border = true,
  raised = false,
  className = '',
  ...props
}, ref) => {
  const paddingStyles = {
    none: '',
    sm: 'p-3.5 sm:p-4',
    md: 'p-5 sm:p-6',
    lg: 'p-6 sm:p-7',
    xl: 'p-8',
  }[padding];

  return (
    <div
      ref={ref}
      className={`rounded-card transition-all duration-base ${
        raised ? 'bg-surface-raised shadow-md' : 'bg-surface shadow-card'
      } ${
        border ? 'border border-border' : ''
      } ${
        hoverEffect ? 'hover:shadow-card-hover hover:-translate-y-0.5 hover:border-border-strong cursor-pointer active:translate-y-0' : ''
      } ${paddingStyles} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
});

Card.displayName = 'Card';
