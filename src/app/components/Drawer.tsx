import * as React from 'react';
import { createPortal } from 'react-dom';

interface DrawerProps {
  isOpen: boolean;
  title?: string;
  description?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  widthClassName?: string;
}

const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  title,
  description,
  onClose,
  children,
  footer,
  widthClassName = 'max-w-lg',
}) => {
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!mounted || !isOpen) {
    return null;
  }

  if (typeof document === 'undefined') {
    return null;
  }

  const container = document.body;

  const content = (
    <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        aria-hidden="true"
        onClick={onClose}
      />
      <aside
        className={`relative ml-auto flex h-full w-full ${widthClassName} flex-col bg-white shadow-2xl`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-5">
          <div className="space-y-1">
            {title ? <h2 className="text-lg font-semibold text-slate-900">{title}</h2> : null}
            {description ? <p className="text-sm text-slate-500">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Close drawer"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6m0 12L6 6" />
            </svg>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="space-y-5">{children}</div>
        </div>
        {footer ? (
          <footer className="border-t border-slate-200 bg-slate-50 px-6 py-4">
            <div className="flex items-center justify-end gap-3">{footer}</div>
          </footer>
        ) : null}
      </aside>
    </div>
  );

  return createPortal(content, container);
};

export default Drawer;
