import React from 'react';

interface AvatarProps { name: string; className?: string }

export const Avatar: React.FC<AvatarProps> = ({ name, className = '' }) => {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  return <div aria-label={name} className={`flex shrink-0 items-center justify-center rounded-full border border-primary/30 bg-primary/15 font-bold text-primary-hover ${className}`}>{initials}</div>;
};
