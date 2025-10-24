import * as React from 'react';

interface ProductStockBarProps {
  current: number;
  safety: number;
  isLowStock: boolean;
  className?: string;
}

const clamp = (value: number, min = 0, max = 1) => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const ProductStockBar: React.FC<ProductStockBarProps> = ({ current, safety, isLowStock, className }) => {
  const ratio = safety > 0 ? current / safety : 1;
  const clampedRatio = clamp(ratio);
  const width = `${clampedRatio * 100}%`;
  const label = `현재 재고 ${current.toLocaleString()}개, 안전 재고 ${safety.toLocaleString()}개`;

  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <div
        role="img"
        aria-label={label}
        title={label}
        className="relative h-2 w-full min-w-[5rem] overflow-hidden rounded-full bg-slate-200"
      >
        <div
          className={`h-full origin-left rounded-full transition-all duration-500 ${
            isLowStock
              ? 'bg-gradient-to-r from-rose-400 via-amber-400 to-amber-500'
              : 'bg-gradient-to-r from-emerald-400 via-teal-400 to-sky-500'
          }`}
          style={{ width }}
        />
      </div>
      <span className="text-xs font-medium text-slate-500">
        {Math.round(clampedRatio * 100)}%
      </span>
    </div>
  );
};

export default ProductStockBar;
