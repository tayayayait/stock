import * as React from 'react';
import { PlusIcon, UploadIcon } from '../../../components/ui/Icons';

interface TopBarProps {
  onAddProduct?: () => void;
  onImportCsv?: () => void;
}

const TopBar: React.FC<TopBarProps> = ({ onAddProduct, onImportCsv }) => {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/60 bg-white/90 backdrop-blur">
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div
          className="absolute inset-0 -z-10 bg-gradient-to-r from-blue-500/10 via-transparent to-indigo-500/10 opacity-0 transition-opacity duration-700 md:opacity-100"
          aria-hidden
        />
        <div className="flex flex-col gap-3 py-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-2xl shadow-lg shadow-blue-500/30">
              📦
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">StockWise</h1>
              <p className="text-sm text-slate-500">프리미엄 재고 관리 대시보드</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => onImportCsv?.()}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-sm font-semibold text-blue-700 shadow-sm transition hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:ring-offset-1"
            >
              <UploadIcon className="h-5 w-5" />
              CSV 업로드
            </button>
            <button
              type="button"
              onClick={() => onAddProduct?.()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/30 transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 focus:ring-offset-1"
            >
              <PlusIcon className="h-5 w-5" />
              제품 추가
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default TopBar;
