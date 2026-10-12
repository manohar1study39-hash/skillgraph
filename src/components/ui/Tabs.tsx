import React from 'react';

export interface TabItem {
  id: string;
  label: string;
  badge?: string | number;
  icon?: React.ReactNode;
}

export interface TabsProps {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  variant?: 'underline' | 'segmented';
  className?: string;
}

export const Tabs: React.FC<TabsProps> = ({
  items,
  activeId,
  onChange,
  variant = 'underline',
  className = '',
}) => {
  if (variant === 'segmented') {
    return (
      <div className={`inline-flex rounded-button bg-surface-alt p-1 border border-border/80 ${className}`}>
        {items.map(item => {
          const isActive = item.id === activeId;
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              className={`flex items-center gap-2 rounded-[8px] px-3.5 py-1.5 text-xs font-semibold transition-all duration-base ${
                isActive
                  ? 'bg-surface text-ink shadow-xs font-bold'
                  : 'text-muted hover:text-ink'
              }`}
            >
              {item.icon && <span className="shrink-0">{item.icon}</span>}
              <span>{item.label}</span>
              {item.badge !== undefined && (
                <span className={`rounded-full px-1.5 py-0.5 text-2xs font-bold tabular-nums ${
                  isActive ? 'bg-primary-tint text-primary' : 'bg-border text-muted'
                }`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`border-b border-border flex items-center gap-6 overflow-x-auto ${className}`}>
      {items.map(item => {
        const isActive = item.id === activeId;
        return (
          <button
            key={item.id}
            onClick={() => onChange(item.id)}
            className={`relative flex items-center gap-2 py-3 text-sm font-semibold transition-all duration-base border-b-2 -mb-[2px] ${
              isActive
                ? 'border-transparent text-ink font-bold'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            {item.icon && <span className="shrink-0">{item.icon}</span>}
            <span>{item.label}</span>
            {item.badge !== undefined && (
              <span className={`rounded-full px-2 py-0.5 text-2xs font-bold tabular-nums ${
                isActive ? 'bg-primary-tint text-primary' : 'bg-surface-alt text-muted'
              }`}>
                {item.badge}
              </span>
            )}
            {isActive && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-aurora rounded-full" />
            )}
          </button>
        );
      })}
    </div>
  );
};
