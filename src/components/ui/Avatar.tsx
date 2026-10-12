import React from 'react';

export interface AvatarProps {
  name: string;
  src?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  role?: 'Employee' | 'Manager' | 'HR_Admin';
}

export const Avatar: React.FC<AvatarProps> = ({
  name,
  src,
  className = '',
  size = 'md',
  role,
}) => {
  const initials = (name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join('')
    .toUpperCase() || '?';

  const sizeStyles = {
    sm: 'h-7 w-7 text-xs font-semibold',
    md: 'h-9 w-9 text-xs font-semibold',
    lg: 'h-11 w-11 text-sm font-semibold',
    xl: 'h-14 w-14 text-base font-bold',
  }[size];

  const roleRings = {
    Employee: 'ring-2 ring-[#10B981] ring-offset-2 ring-offset-background',
    Manager: 'ring-2 ring-[#19C3E6] ring-offset-2 ring-offset-background',
    HR_Admin: 'ring-2 ring-[#B14AFF] ring-offset-2 ring-offset-background',
  };

  const ringClass = role ? roleRings[role] : '';

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={`shrink-0 rounded-full object-cover border border-border shadow-xs ${sizeStyles} ${ringClass} ${className}`}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={name}
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#F0ECFF] to-[#E3F8FD] text-primary font-bold border border-primary/20 dark:from-[#1E1438] dark:to-[#0D2433] dark:text-[#8B6CFF] dark:border-primary/30 shadow-xs ${sizeStyles} ${ringClass} ${className}`}
    >
      {initials}
    </div>
  );
};
