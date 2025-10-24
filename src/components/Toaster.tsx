import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

export type ToastTone = 'success' | 'error' | 'info';

export type ToastOptions = {
  description?: string;
  tone?: ToastTone;
  duration?: number;
};

type ToastRecord = {
  id: number;
  message: string;
  description?: string;
  tone: ToastTone;
};

type ToastContextValue = {
  showToast: (message: string, options?: ToastOptions) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);
const DEFAULT_DURATION = 3600;
let sequence = 0;

const toneStyles: Record<ToastTone, string> = {
  success: 'bg-emerald-500 text-white',
  error: 'bg-rose-500 text-white',
  info: 'bg-slate-800 text-white',
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timersRef = useRef<Map<number, number>>(new Map());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timerId = timersRef.current.get(id);
    if (timerId) {
      window.clearTimeout(timerId);
      timersRef.current.delete(id);
    }
  }, []);

  const scheduleDismiss = useCallback(
    (id: number, duration: number) => {
      const timerId = window.setTimeout(() => {
        dismiss(id);
      }, duration);
      timersRef.current.set(id, timerId);
    },
    [dismiss],
  );

  const showToast = useCallback(
    (message: string, options: ToastOptions = {}) => {
      if (!message) {
        return;
      }

      const id = ++sequence;
      const tone = options.tone ?? 'info';
      const toast: ToastRecord = {
        id,
        message,
        description: options.description,
        tone,
      };

      setToasts((current) => [...current, toast]);
      const duration = Math.max(0, options.duration ?? DEFAULT_DURATION);
      if (duration > 0) {
        scheduleDismiss(id, duration);
      }
    },
    [scheduleDismiss],
  );

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      timersRef.current.clear();
    };
  }, []);

  const contextValue = useMemo<ToastContextValue>(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
};

export const Toaster: React.FC<{ toasts: ToastRecord[]; onDismiss: (id: number) => void }> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-3 px-4">
      {toasts.map((toast) => {
        const toneClass = toneStyles[toast.tone] ?? toneStyles.info;
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex max-w-sm flex-col gap-2 rounded-md px-4 py-3 text-sm shadow-lg transition-opacity duration-300 ${toneClass}`}
          >
            <div className="flex items-start justify-between gap-3">
              <span className="flex-1 whitespace-pre-line font-medium">{toast.message}</span>
              <button
                type="button"
                className="rounded bg-white/15 px-2 py-1 text-xs font-medium text-white hover:bg-white/25 focus:outline-none focus-visible:ring"
                onClick={() => onDismiss(toast.id)}
              >
                닫기
              </button>
            </div>
            {toast.description ? <p className="text-xs text-white/80">{toast.description}</p> : null}
          </div>
        );
      })}
    </div>
  );
};

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast는 ToastProvider 내부에서만 사용할 수 있습니다.');
  }

  return context.showToast;
}

export default ToastProvider;
