import * as React from 'react';
import type { ForecastResponse } from '../../../../services/api';

interface SalesAnalysisPanelProps {
  sku: string | null;
  productName?: string;
  metrics: ForecastResponse['metrics'] | null;
  loading?: boolean;
}

const formatNumber = (value: number): string => value.toLocaleString();

const SalesAnalysisPanel: React.FC<SalesAnalysisPanelProps> = ({ sku, productName, metrics, loading = false }) => {
  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
        <h4 className="text-sm font-semibold text-slate-700">판매 분석</h4>
        <p className="mt-3 text-xs text-slate-500">판매 지표를 불러오는 중입니다...</p>
      </section>
    );
  }

  if (!metrics) {
    return (
      <section className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-4 text-xs text-slate-500">
        분석할 판매 데이터가 없습니다.
      </section>
    );
  }

  const reasonEntries = (Object.entries(metrics.outboundReasons ?? {}) as Array<[string, number]>)
    .filter(([, value]) => Number.isFinite(value))
    .sort((a, b) => b[1] - a[1]);

  const title = productName && sku ? `${productName} (${sku})` : sku ?? productName ?? '선택된 품목';

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
      <header>
        <h4 className="text-sm font-semibold text-slate-700">판매 분석</h4>
        <p className="mt-1 text-xs text-slate-500">{title}</p>
      </header>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs text-slate-600">
        <div>
          <dt className="font-semibold text-slate-700">분석 기간</dt>
          <dd className="mt-1 text-slate-500">
            {metrics.windowStart || 'N/A'} ~ {metrics.windowEnd || 'N/A'}
          </dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-700">총 출고</dt>
          <dd className="mt-1 text-slate-500">{formatNumber(metrics.outboundTotal)} 개</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-700">일 평균 수요</dt>
          <dd className="mt-1 text-slate-500">{formatNumber(metrics.avgDailyDemand)} 개</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-700">현재 재고</dt>
          <dd className="mt-1 text-slate-500">{formatNumber(metrics.currentTotalStock)} 개</dd>
        </div>
      </dl>
      {reasonEntries.length > 0 && (
        <div className="mt-4">
          <h5 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">출고 기여 요인</h5>
          <ul className="mt-2 space-y-1 text-xs text-slate-600">
            {reasonEntries.map(([label, value]) => (
              <li key={label} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span>{label}</span>
                <span className="font-mono text-slate-500">{formatNumber(Math.round(value))} 개</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

export default SalesAnalysisPanel;
