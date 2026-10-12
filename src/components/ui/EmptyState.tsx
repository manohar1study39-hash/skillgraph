import React from 'react';
import { LucideIcon, Inbox } from 'lucide-react';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = Inbox,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}) => {
  return (
    <div className={`flex flex-col items-center justify-center p-8 text-center rounded-card border border-dashed border-border bg-surface-alt/20 ${className}`}>
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#F0ECFF] to-[#E3F8FD] dark:from-[#1E1438] dark:to-[#0D2433] border border-primary/20 text-primary shadow-xs mb-3.5">
        <Icon className="h-6 w-6 stroke-[1.75]" />
      </div>
      <h4 className="text-sm font-semibold text-ink font-heading">{title}</h4>
      {description && (
        <p className="mt-1.5 text-xs text-muted max-w-sm leading-relaxed">{description}</p>
      )}
      {actionLabel && onAction && (
        <div className="mt-4">
          <Button size="sm" variant="secondary" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
};
