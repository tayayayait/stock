import * as React from 'react';

export interface ChartDonutSlice {
  key: string;
  label: string;
  value: number;
  color?: string;
}

interface ChartDonutProps {
  data: ChartDonutSlice[];
  totalLabel?: string;
  totalValue?: string | number;
  formatValue?: (value: number) => string;
  className?: string;
  emptyMessage?: string;
}

const defaultPalette = ['#6366f1', '#f97316', '#22c55e', '#0ea5e9', '#a855f7'];

const buildGradient = (slices: Array<ChartDonutSlice & { color: string }>, total: number) => {
  if (!total || total <= 0) {
    return 'conic-gradient(#e2e8f0 0 100%)';
  }

  let current = 0;
  const segments: string[] = [];

  slices.forEach((slice) => {
    const start = current;
    const percentage = (Math.max(slice.value, 0) / total) * 100;
    current += percentage;
    segments.push(`${slice.color} ${start}% ${current}%`);
  });

  if (current < 100) {
    segments.push(`#e2e8f0 ${current}% 100%`);
  }

  return `conic-gradient(${segments.join(', ')})`;
};

const ChartDonut: React.FC<ChartDonutProps> = ({
  data,
  totalLabel = '합계',
  totalValue,
  formatValue = (value) => value.toLocaleString('ko-KR'),
  className = '',
  emptyMessage = '표시할 데이터가 없습니다.',
}) => {
  const enriched = React.useMemo(() => {
    if (!Array.isArray(data)) {
      return [] as Array<ChartDonutSlice & { color: string }>;
    }
    return data.map((slice, index) => ({
      ...slice,
      color: slice.color ?? defaultPalette[index % defaultPalette.length],
    }));
  }, [data]);

  const total = React.useMemo(
    () => enriched.reduce((sum, slice) => sum + (Number.isFinite(slice.value) ? slice.value : 0), 0),
    [enriched],
  );

  if (!enriched.length) {
    return (
      <div className={`flex h-full items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500 ${className}`}>
        {emptyMessage}
      </div>
    );
  }

  const gradient = buildGradient(enriched, total);

  return (
    <div className={`flex flex-col gap-6 ${className}`}>
      <div className="relative mx-auto h-48 w-48">
        <div
          className="absolute inset-0 rounded-full border border-slate-200/70"
          style={{ backgroundImage: gradient }}
          aria-hidden
        />
        <div className="absolute inset-[22%] flex flex-col items-center justify-center rounded-full bg-white text-center shadow-sm">
          <span className="text-xs font-medium text-slate-500">{totalLabel}</span>
          <span className="mt-1 text-lg font-semibold text-slate-900">
            {totalValue !== undefined ? totalValue : formatValue(total)}
          </span>
        </div>
      </div>
      <ul className="grid gap-3 text-sm">
        {enriched.map((slice) => (
          <li key={slice.key} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: slice.color }}
                aria-hidden
              />
              <span className="text-slate-600">{slice.label}</span>
            </span>
            <span className="font-semibold text-slate-900">{formatValue(slice.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ChartDonut;
