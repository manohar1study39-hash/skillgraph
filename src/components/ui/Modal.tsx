import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl';
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = 'md',
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthStyles = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '4xl': 'max-w-4xl',
  }[maxWidth];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto p-4 bg-[#070B16]/75 backdrop-blur-sm transition-opacity duration-base"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`relative my-auto w-full overflow-hidden rounded-card border border-border bg-surface shadow-modal transition-all duration-base ${maxWidthStyles}`}
      >
        {(title || description) && (
          <div className="flex items-start justify-between border-b border-border/80 px-6 py-4.5">
            <div>
              {title && <h3 className="text-base font-semibold text-ink font-heading">{title}</h3>}
              {description && <p className="mt-1 text-xs text-muted leading-relaxed">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-button p-1 text-muted hover:bg-surface-alt hover:text-ink transition-colors focus-visible:ring-2 focus-visible:ring-primary"
              aria-label="Close modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="p-6">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-3 border-t border-border/80 bg-surface-alt/40 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
