
import React, { ReactNode, useEffect, useId, useRef } from 'react';
import { XMarkIcon } from './Icons';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

const FOCUSABLE_SELECTORS =
  'a[href], area[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), iframe, object, embed, [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

const getFocusableElements = (container: HTMLElement) => {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)).filter(
    (element) => !element.hasAttribute('aria-hidden'),
  );
};

const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    previouslyFocusedElementRef.current = document.activeElement as HTMLElement | null;

    const dialogNode = dialogRef.current;
    if (!dialogNode) {
      return undefined;
    }

    const focusable = getFocusableElements(dialogNode);
    if (focusable.length > 0) {
      focusable[0].focus();
    } else {
      dialogNode.focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === 'Tab') {
        const elements = getFocusableElements(dialogNode);

        if (!elements.length) {
          event.preventDefault();
          dialogNode.focus();
          return;
        }

        const first = elements[0];
        const last = elements[elements.length - 1];
        const activeElement = document.activeElement as HTMLElement | null;

        if (event.shiftKey) {
          if (activeElement === first || !dialogNode.contains(activeElement)) {
            event.preventDefault();
            last.focus();
          }
        } else if (activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    dialogNode.addEventListener('keydown', handleKeyDown);

    return () => {
      dialogNode.removeEventListener('keydown', handleKeyDown);
      previouslyFocusedElementRef.current?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex h-full w-full items-center justify-center overflow-y-auto bg-gray-600 bg-opacity-50"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative mx-auto w-full max-w-lg rounded-md border bg-white p-5 shadow-lg"
      >
        <div className="flex items-center justify-between border-b pb-3">
          <h3 id={titleId} className="text-2xl font-bold text-gray-900">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 transition hover:text-gray-600"
            aria-label="닫기"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
};

export default Modal;
