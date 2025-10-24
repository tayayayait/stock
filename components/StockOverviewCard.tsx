import * as React from 'react';
import { ProductionStage } from '../types';

interface StageSummaryDatum {
  stage: ProductionStage;
  label: string;
  required: number;
  available: number;
  inbound: number;
  backlog: number;
  coverage: number;
  attainment: number;
  productCount: number;
}

interface BottleneckAlert {
  id: string;
  productName: string;
  stage: ProductionStage;
  coverage: number;
}

interface StockOverviewCardProps {
  stageSummaries: StageSummaryDatum[];
  bottleneckAlerts: BottleneckAlert[];
}

const stagePalette: Record<ProductionStage, { label: string; accent: string; dot: string; bar: string }> = {
  raw: {
    label: '원자재',
    accent: 'text-amber-200',
    dot: 'bg-amber-400',
    bar: 'from-amber-400 via-orange-400 to-orange-500',
  },
  wip: {
    label: '공정 진행 중',
    accent: 'text-sky-200',
    dot: 'bg-sky-400',
    bar: 'from-sky-400 via-blue-500 to-indigo-500',
  },
  finished: {
    label: '완제품',
    accent: 'text-emerald-200',
    dot: 'bg-emerald-400',
    bar: 'from-emerald-400 via-teal-400 to-cyan-400',
  },
};

const StockOverviewCard: React.FC<StockOverviewCardProps> = ({ stageSummaries, bottleneckAlerts }) => {
  const totalRequired = stageSummaries.reduce((sum, item) => sum + item.required, 0);
  const totalCovered = stageSummaries.reduce((sum, item) => sum + item.available + item.inbound, 0);
  const attainmentPercent = totalRequired > 0 ? Math.min(Math.round((totalCovered / totalRequired) * 100), 200) : 0;

  return (
    <aside className="relative overflow-hidden rounded-2xl bg-slate-900 text-white shadow-2xl">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.25),_transparent_65%)]" aria-hidden />
      <div className="relative z-10 flex h-full flex-col gap-6 p-6">
        <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-300">제조 단계 커버리지</h3>
            <p className="mt-1 text-2xl font-bold">
              총 충족률 {totalRequired === 0 ? '데이터 수집 중' : `${attainmentPercent}%`}
            </p>
            <p className="text-sm text-slate-400">
              입고 예정 물량을 포함한 전체 단계별 수급 상황입니다.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-right">
            <p className="text-xs uppercase tracking-wide text-slate-200/70">감시중인 제품</p>
            <p className="text-lg font-semibold">{stageSummaries.reduce((sum, item) => sum + item.productCount, 0)}개</p>
          </div>
        </header>

        <div className="space-y-5">
          {stageSummaries.length > 0 ? (
            stageSummaries.map((stage) => {
              const palette = stagePalette[stage.stage];
              const coveragePercent = stage.required > 0 ? Math.round(Math.min(stage.coverage, 2) * 100) : 100;
              const inboundContribution = stage.required > 0 ? Math.min(stage.inbound, Math.max(stage.required - stage.available, 0)) : 0;
              const availableWidth = stage.required > 0 ? Math.min((stage.available / stage.required) * 100, 100) : stage.available > 0 ? 100 : 0;
              const inboundWidth = stage.required > 0 ? Math.min((inboundContribution / stage.required) * 100, Math.max(100 - availableWidth, 0)) : 0;
              const gapWidth = Math.max(0, 100 - availableWidth - inboundWidth);
              const shortfall = Math.max(stage.required - (stage.available + stage.inbound), 0);

              return (
                <div key={stage.stage} className="space-y-2">
                  <div className="flex items-center justify-between text-sm text-slate-200">
                    <div className="flex items-center gap-3">
                      <span className={`h-2.5 w-2.5 rounded-full ${palette.dot}`} aria-hidden />
                      <span className="font-medium text-white">{stage.label}</span>
                      <span className={`text-xs font-semibold ${palette.accent}`}>
                        커버율 {stage.required === 0 ? '데이터 부족' : `${coveragePercent}%`}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400">
                      <span>필요 {stage.required.toLocaleString()}ea</span>
                      <span>가용 {stage.available.toLocaleString()}ea</span>
                      {stage.inbound > 0 && <span>입고 예정 {stage.inbound.toLocaleString()}ea</span>}
                    </div>
                  </div>
                  <div className="relative h-10 overflow-hidden rounded-xl border border-white/10 bg-white/5">
                    <div
                      className={`absolute inset-y-0 left-0 rounded-r-xl bg-gradient-to-r ${palette.bar}`}
                      style={{ width: `${availableWidth}%` }}
                    />
                    {inboundWidth > 0 && (
                      <div
                        className="absolute inset-y-0 rounded-r-xl bg-gradient-to-r from-cyan-300/80 via-sky-300/70 to-sky-400/70"
                        style={{
                          left: `${availableWidth}%`,
                          width: `${inboundWidth}%`,
                        }}
                      />
                    )}
                    {gapWidth > 0 && (
                      <div
                        className="absolute inset-y-0 right-0 rounded-l-xl bg-gradient-to-r from-transparent via-transparent to-rose-500/40"
                        style={{ width: `${gapWidth}%` }}
                      />
                    )}
                    <div className="absolute inset-0 flex items-center justify-between px-4 text-xs font-semibold text-slate-200">
                      <span>단계별 가용률</span>
                      {shortfall > 0 ? (
                        <span className="flex items-center gap-1 rounded-full bg-rose-500/20 px-2 py-1 text-[0.65rem] text-rose-100">
                          부족 {shortfall.toLocaleString()}ea
                        </span>
                      ) : (
                        <span className="rounded-full bg-emerald-400/20 px-2 py-1 text-[0.65rem] text-emerald-100">충분</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="flex h-32 items-center justify-center rounded-xl border border-dashed border-white/20 text-sm text-slate-300">
              표시할 제조 단계 데이터가 없습니다.
            </div>
          )}
        </div>

        <div>
          <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">병목 경보</h4>
          <div className="mt-3 space-y-2">
            {bottleneckAlerts.length > 0 ? (
              bottleneckAlerts.map((alert) => {
                const palette = stagePalette[alert.stage];
                const alertPercent = Math.round(Math.max(alert.coverage, 0) * 100);

                return (
                  <div
                    key={alert.id}
                    className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200"
                  >
                    <div className="flex flex-col">
                      <span className="font-semibold text-white">{alert.productName}</span>
                      <span className={`text-xs ${palette.accent}`}>{stagePalette[alert.stage].label}</span>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-[0.7rem] font-semibold ${
                        alert.coverage < 0.5 ? 'bg-rose-500/30 text-rose-100' : 'bg-amber-500/20 text-amber-100'
                      }`}
                    >
                      커버율 {alertPercent}%
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-slate-300">
                현재 병목 위험으로 표시된 제품이 없습니다.
              </div>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};

export default StockOverviewCard;
