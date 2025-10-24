import React, { useMemo } from 'react';

export interface HeroStatSummary {
  key: string;
  label: string;
  value: string;
  trendLabel: string;
  chipClass: string;
  cardClass: string;
  description: string;
  footnotes: string[];
}

export interface FocusItemSummary {
  sku: string;
  name: string;
  risk: '정상' | '결품위험' | '과잉';
  severity: 'critical' | 'warning' | 'info';
  coverage: number;
  expiry: number | null;
  segment: string;
  available: number;
  projected: number;
  actionLabel: string;
  actionDescription: string;
}

interface ServiceCoveragePanelProps {
  heroStats: HeroStatSummary[];
  focusItems: FocusItemSummary[];
}

const riskBadgePalette: Record<FocusItemSummary['risk'], string> = {
  결품위험: 'bg-red-50 text-red-600 border-red-200',
  과잉: 'bg-amber-50 text-amber-600 border-amber-200',
  정상: 'bg-emerald-50 text-emerald-600 border-emerald-200',
};

const riskBarPalette: Record<FocusItemSummary['risk'], string> = {
  결품위험: 'bg-gradient-to-r from-red-500 via-red-400 to-red-300',
  과잉: 'bg-gradient-to-r from-amber-500 via-amber-400 to-amber-300',
  정상: 'bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-300',
};

const ServiceCoveragePanel: React.FC<ServiceCoveragePanelProps> = ({ heroStats, focusItems }) => {
  const serviceStat = useMemo(() => heroStats.find((stat) => stat.key === 'service'), [heroStats]);
  const coverageStat = useMemo(() => heroStats.find((stat) => stat.key === 'coverage'), [heroStats]);

  const maxCoverage = useMemo(
    () => focusItems.reduce((max, item) => Math.max(max, item.coverage), 0),
    [focusItems],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">서비스 레벨</span>
            <span className="text-2xl font-semibold text-slate-800">{serviceStat?.value ?? '--'}</span>
            {serviceStat?.trendLabel ? (
              <span className="text-xs text-indigo-500">{serviceStat.trendLabel}</span>
            ) : null}
          </div>
          <div className="text-sm font-semibold text-slate-800">{serviceStat?.description ?? '서비스 지표 없음'}</div>
          <ul className="space-y-1 text-xs text-slate-500">
            {(serviceStat?.footnotes ?? ['지표를 불러오는 중입니다.']).map((note, index) => (
              <li key={`service-footnote-${index}`} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                {note}
              </li>
            ))}
          </ul>
        </div>
        <div className="w-full rounded-2xl border border-slate-200 bg-slate-50/70 p-4 sm:w-auto">
          <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">평균 커버리지</div>
          <div className="mt-1 text-2xl font-semibold text-slate-800">{coverageStat?.value ?? '--'}</div>
          {coverageStat?.trendLabel ? (
            <div className="text-xs text-indigo-500">{coverageStat.trendLabel}</div>
          ) : null}
          <div className="mt-2 text-xs text-slate-500">
            {coverageStat?.description ?? '재고 커버리지 추이를 확인하세요.'}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-800">커버리지 히트맵</h4>
          <span className="text-xs text-slate-400">우선 조치 대상 {focusItems.length}건 기준</span>
        </div>
        {focusItems.length === 0 ? (
          <p className="text-xs text-slate-500">현재 선택한 조건에서 커버리지 대상이 없습니다.</p>
        ) : (
          focusItems.map((item) => {
            const ratio = maxCoverage > 0 ? Math.min(100, Math.round((item.coverage / maxCoverage) * 100)) : 0;

            return (
              <div
                key={item.sku}
                className="rounded-2xl border border-slate-200 bg-white/60 p-3 transition hover:border-indigo-200"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-800">{item.name}</span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full border ${riskBadgePalette[item.risk]}`}>
                        {item.risk === '정상' ? '안정' : item.risk}
                      </span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full border border-slate-200 text-slate-500">
                        {item.segment}
                      </span>
                    </div>
                    <div className="font-mono text-[11px] text-slate-400">{item.sku}</div>
                  </div>
                  <div className="text-right text-xs text-slate-500 sm:text-left">
                    <div className="font-semibold text-slate-700">{item.actionLabel}</div>
                    <div>{item.actionDescription}</div>
                  </div>
                </div>
                <div className="mt-3 space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>커버리지</span>
                    <span>{item.coverage}일</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full rounded-full ${riskBarPalette[item.risk]}`}
                      style={{ width: `${ratio}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>가용 {item.available.toLocaleString()}ea</span>
                    <span>7일 후 {item.projected.toLocaleString()}ea</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ServiceCoveragePanel;
