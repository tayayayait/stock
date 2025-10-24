import * as React from 'react';

export interface ChartBarDatum {
  key: string;
  label: string;
  value: number;
  color?: string;
  secondaryLabel?: string;
}

interface ChartBarProps {
  data: ChartBarDatum[];
  maxValue?: number;
  formatValue?: (value: number) => string;
  className?: string;
  height?: number;
  emptyMessage?: string;
}

const fallbackPalette = ['#6366f1', '#22c55e', '#f97316', '#0ea5e9', '#a855f7'];

const ChartBar: React.FC<ChartBarProps> = ({
  data,
  maxValue,
  formatValue = (value) => value.toLocaleString('ko-KR'),
  className = '',
  height = 240,
  emptyMessage = '표시할 데이터가 없습니다.',
}) => {
  const safeData = Array.isArray(data) ? data.filter((item) => Number.isFinite(item.value)) : [];
  const computedMax = React.useMemo(() => {
    if (typeof maxValue === 'number' && Number.isFinite(maxValue) && maxValue > 0) {
      return maxValue;
    }
    const maxEntry = safeData.reduce((acc, item) => (item.value > acc ? item.value : acc), 0);
    return maxEntry > 0 ? maxEntry : 0;
  }, [maxValue, safeData]);

  if (!safeData.length) {
    return (
      <div
        className={`flex h-full items-center justify-center rounded-xl bg-slate-50 text-sm text-slate-500 ${className}`}
        style={{ minHeight: height }}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className={`flex h-full flex-col ${className}`}>
      <div className="flex flex-1 items-end gap-4 overflow-x-auto px-1 pb-2" style={{ minHeight: height }}>
        {safeData.map((item, index) => {
          const color = item.color ?? fallbackPalette[index % fallbackPalette.length];
          const percentage = computedMax > 0 ? Math.round((item.value / computedMax) * 100) : 0;
          const barHeight = `${Math.max(percentage, 2)}%`;

          return (
            <div key={item.key} className="flex min-w-[52px] flex-1 flex-col items-center gap-3">
              <div className="relative flex h-full w-full items-end">
                <div
                  className="flex w-full items-end"
                  title={`${item.label}: ${formatValue(item.value)}`}
                  aria-label={`${item.label}: ${formatValue(item.value)}`}
                >
                  <div
                    className="w-full rounded-t-lg bg-gradient-to-t from-slate-200/80 to-transparent"
                    style={{ height: '100%' }}
                    aria-hidden
                  />
                  <div
                    className="absolute inset-x-1 bottom-0 flex rounded-t-lg"
                    style={{
                      height: barHeight,
                      backgroundColor: color,
                    }}
                  >
                    <span className="sr-only">{`${item.label} ${formatValue(item.value)}`}</span>
                  </div>
                </div>
              </div>
              <div className="flex min-h-[2.5rem] flex-col items-center text-center text-sm">
                <span className="font-semibold text-slate-900">{formatValue(item.value)}</span>
                <span className="mt-1 text-xs text-slate-500">{item.secondaryLabel ?? item.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ChartBar;
