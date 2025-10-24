
import * as React from 'react';
import { Product, ProductionStage, deriveStageFromProduct } from '../types';
import { PlusIcon, MinusIcon, PencilIcon, TrashIcon, AlertTriangleIcon, HistoryIcon } from './ui/Icons';
import ProductStockBar from './ProductStockBar';

interface ProductItemProps {
  product: Product;
  onStockChange: (productId: string, change: number) => void;
  onEdit: (product: Product) => void;
  onDelete: (productId: string) => void;
  onViewHistory: (product: Product) => void;
}

const ProductItem: React.FC<ProductItemProps> = ({ product, onStockChange, onEdit, onDelete, onViewHistory }) => {
  const stage = deriveStageFromProduct(product);
  const stageLabels: Record<ProductionStage, string> = {
    raw: '원자재',
    wip: '공정 진행 중',
    finished: '완제품',
  };
  const stageBadgeStyles: Record<ProductionStage, string> = {
    raw: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200',
    wip: 'bg-blue-100 text-blue-700 ring-1 ring-blue-200',
    finished: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200',
  };

  const isLowStock = product.currentStock <= product.safetyStock;
  const coverage = product.safetyStock > 0 ? product.currentStock / product.safetyStock : 1;
  const clampedCoverage = Math.max(0, Math.min(coverage, 1));
  const coveragePercent = clampedCoverage * 100;
  const coverageBarClass =
    coverage >= 1
      ? 'from-emerald-400 via-teal-400 to-sky-500'
      : 'from-amber-400 via-orange-400 to-rose-500';

  const locationDetails = [
    { label: '사이트', value: product.storageHierarchy?.site },
    { label: '창고', value: product.storageHierarchy?.warehouse },
    { label: '존', value: product.storageHierarchy?.zone },
    { label: '통로', value: product.storageHierarchy?.aisle },
    { label: '랙', value: product.storageHierarchy?.rack },
    { label: '선반', value: product.storageHierarchy?.shelf },
    { label: 'Bin', value: product.storageHierarchy?.bin },
  ].filter((entry) => Boolean(entry.value));

  return (
    <article
      className={`group relative overflow-hidden rounded-2xl border border-slate-100 bg-white/90 shadow-sm transition-all duration-300 backdrop-blur ${
        isLowStock ? 'ring-1 ring-rose-200 hover:shadow-xl' : 'hover:-translate-y-0.5 hover:shadow-xl'
      }`}
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-500/0 via-blue-500/30 to-blue-500/0 opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
      {isLowStock && (
        <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-rose-500 to-amber-400" aria-hidden />
      )}
      <div className="relative z-10 flex flex-col gap-6 p-5 md:flex-row md:items-center md:justify-between">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-3">
            {isLowStock && <AlertTriangleIcon className="h-5 w-5 text-rose-500" />}
            <h3 className="text-xl font-semibold text-slate-900">{product.productName}</h3>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                isLowStock ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'
              }`}
            >
              {isLowStock ? '주의 필요' : '안정'}
            </span>
            <span className={`rounded-full px-3 py-1 text-[0.7rem] font-semibold shadow-sm ${stageBadgeStyles[stage]}`}>
              {stageLabels[stage]}
            </span>
          </div>
          {product.notes && <p className="mt-2 text-sm text-slate-500">{product.notes}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-blue-500" aria-hidden />
              안전 재고 {product.safetyStock.toLocaleString()}개
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-slate-300" aria-hidden />
              등록일 {product.createdAt.toLocaleDateString('ko-KR')}
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-emerald-400" aria-hidden />
              위치 {product.warehouseLocation}
            </span>
          </div>
          {locationDetails.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
              {locationDetails.map((detail) => (
                <span
                  key={`${product.id}-${detail.label}`}
                  className="rounded-full bg-slate-100 px-2 py-1 text-[0.65rem] font-medium text-slate-600"
                >
                  {detail.label}: {detail.value}
                </span>
              ))}
            </div>
          )}
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>
                현재 {product.currentStock.toLocaleString()} / 안전 {product.safetyStock.toLocaleString()}
              </span>
              {coverage < 0.5 && (
                <span className="flex items-center gap-1 rounded-full bg-rose-100/70 px-2 py-0.5 text-[0.65rem] font-semibold text-rose-600 shadow-sm animate-pulse">
                  긴급 확인
                </span>
              )}
            </div>
            <div className="group/progress relative h-2 overflow-hidden rounded-full bg-slate-100 shadow-inner">
              <div
                className={`absolute inset-y-0 left-0 w-full origin-left bg-gradient-to-r ${coverageBarClass} transition-[transform,filter] duration-500 ease-out group-hover/progress:scale-x-[1.02] group-hover/progress:brightness-110`}
                style={{ transform: `scaleX(${coveragePercent / 100})` }}
                aria-hidden
              />
            </div>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-between gap-4 md:flex-initial md:justify-end">
          <div className="flex items-center gap-3 rounded-full bg-slate-100/80 px-3 py-2 shadow-inner">
            <button
              onClick={() => onStockChange(product.id, -1)}
              className="rounded-full bg-white/80 p-2 text-rose-500 shadow hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={product.currentStock <= 0}
            >
              <MinusIcon className="h-5 w-5" />
            </button>
            <div className="flex flex-col items-center gap-1 md:items-end">
              <span className={`min-w-[4rem] text-center text-3xl font-semibold tracking-tight ${isLowStock ? 'text-rose-600' : 'text-slate-900'}`}>
                {product.currentStock}
              </span>
              <ProductStockBar
                current={product.currentStock}
                safety={product.safetyStock}
                isLowStock={isLowStock}
                className="w-24"
              />
            </div>
            <button
              onClick={() => onStockChange(product.id, 1)}
              className="rounded-full bg-blue-500/90 p-2 text-white shadow hover:bg-blue-500"
            >
              <PlusIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
      <footer className="flex items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/80 px-4 py-3 text-sm text-slate-500">
        <span className="hidden text-xs text-slate-400 md:inline">실행 옵션</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onViewHistory(product)}
            className="rounded-lg px-3 py-2 transition hover:bg-blue-50 hover:text-blue-600"
          >
            <span className="flex items-center gap-2">
              <HistoryIcon className="h-4 w-4" /> 기록
            </span>
          </button>
          <button
            onClick={() => onEdit(product)}
            className="rounded-lg px-3 py-2 transition hover:bg-blue-50 hover:text-blue-600"
          >
            <span className="flex items-center gap-2">
              <PencilIcon className="h-4 w-4" /> 편집
            </span>
          </button>
          <button
            onClick={() => onDelete(product.id)}
            className="rounded-lg px-3 py-2 transition hover:bg-rose-50 hover:text-rose-600"
          >
            <span className="flex items-center gap-2">
              <TrashIcon className="h-4 w-4" /> 삭제
            </span>
          </button>
        </div>
      </footer>
    </article>
  );
};

export default ProductItem;