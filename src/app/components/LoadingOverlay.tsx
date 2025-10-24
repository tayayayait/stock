import * as React from 'react';

type LoadingOverlayProps = {
  visible: boolean;
  label?: string;
};

const defaultLabel = '데이터를 불러오는 중입니다...';

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ visible, label }) => {
  if (!visible) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
      <div className="flex items-center gap-3 rounded-lg bg-white px-5 py-4 text-sm font-medium text-slate-700 shadow-xl">
        <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-transparent" />
        <span>{label ?? defaultLabel}</span>
      </div>
    </div>
  );
};

export default LoadingOverlay;
