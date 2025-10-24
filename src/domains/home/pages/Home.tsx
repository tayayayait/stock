import React, { useCallback, useMemo } from 'react';
import Card from '../../../../components/ui/Card';
import Sparkline from '../../../../components/ui/Sparkline';
import { formatPercent, formatQty } from '../../../../utils/format';
import useHomeDashboard from '../hooks/useHomeDashboard';
import { type InventoryRiskLevel, type RiskSku, type ScheduleDay } from '../services/homeDashboard';

interface HomeProps {
  onNavigate?: (path: string) => void;
}

interface ForecastSeries {
  id: string;
  label: string;
  color: string;
  data: number[];
  strokeDasharray?: string;
}

const riskLevelStyles: Record<InventoryRiskLevel, { label: string; className: string }> = {
  critical: { label: '긴급', className: 'bg-rose-100 text-rose-700 border border-rose-200' },
  high: { label: '주의', className: 'bg-amber-100 text-amber-700 border border-amber-200' },
  medium: { label: '관찰', className: 'bg-sky-100 text-sky-700 border border-sky-200' },
  stable: { label: '안정', className: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
};

const eventTypeStyles = {
  cutoff: 'border-amber-200 bg-amber-50 text-amber-700',
  review: 'border-sky-200 bg-sky-50 text-sky-700',
  meeting: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  shipment: 'border-emerald-200 bg-emerald-50 text-emerald-700',
} as const;

type EventType = keyof typeof eventTypeStyles;

const LoadingState: React.FC = () => (
  <div className="flex flex-col gap-6">
    <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 3 }).map((_, index) => (
        <Card key={`loading-card-${index}`} className="h-40" isLoading />
      ))}
    </section>
    <section className="grid grid-cols-1 gap-6 xl:grid-cols-12">
      <Card className="h-96 xl:col-span-7" isLoading />
      <div className="flex flex-col gap-6 xl:col-span-5">
        <Card className="h-64" isLoading />
        <Card className="h-64" isLoading />
      </div>
    </section>
  </div>
);

const ForecastChart: React.FC<{ labels: string[]; series: ForecastSeries[] }> = ({ labels, series }) => {
  const allValues = series.flatMap((item) => item.data);
  const max = Math.max(...allValues, 1);
  const min = Math.min(...allValues, 0);
  const verticalRange = Math.max(max - min, 1);

  const buildPath = (values: number[]) => {
    if (labels.length === 0) {
      return '';
    }

    const denominator = Math.max(labels.length - 1, 1);

    return values
      .map((value, index) => {
        const x = (index / denominator) * 100;
        const y = 100 - ((value - min) / verticalRange) * 100;
        return `${x},${y}`;
      })
      .join(' L ');
  };

  return (
    <div>
      <svg viewBox="0 0 100 100" className="h-48 w-full" role="img" aria-label="주간 수요 예측 추이">
        <g>
          {[0, 25, 50, 75, 100].map((tick) => (
            <line
              key={tick}
              x1={0}
              y1={tick}
              x2={100}
              y2={tick}
              stroke="rgba(148, 163, 184, 0.2)"
              strokeWidth={0.4}
            />
          ))}
        </g>
        {series.map((item) => (
          <path
            key={item.id}
            d={`M ${buildPath(item.data)}`}
            fill="none"
            stroke={item.color}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={item.strokeDasharray}
          />
        ))}
        {series.map((item) =>
          item.data.map((value, index) => {
            const denominator = Math.max(labels.length - 1, 1);
            const x = (index / denominator) * 100;
            const y = 100 - ((value - min) / verticalRange) * 100;
            return (
              <circle key={`${item.id}-${index}`} cx={x} cy={y} r={1.3} fill={item.color} />
            );
          }),
        )}
      </svg>
      <div className="mt-3 grid grid-cols-7 text-xs font-medium text-slate-500">
        {labels.map((label) => (
          <span key={label} className="text-center">
            {label}
          </span>
        ))}
      </div>
    </div>
  );
};

const WeeklySchedule: React.FC<{
  days: ScheduleDay[];
  onNavigate: (path: string) => void;
}> = ({ days, onNavigate }) => (
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
    {days.map((day) => (
      <div
        key={day.id}
        className={`flex h-full flex-col gap-3 rounded-xl border border-slate-200/70 bg-white/70 p-4 ${
          day.isToday ? 'ring-1 ring-slate-300' : ''
        }`}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-slate-400">{day.weekday}</p>
            <p className="text-lg font-semibold text-slate-900">{day.dateLabel}</p>
          </div>
          {day.isToday && <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">오늘</span>}
        </div>
        <ul className="flex flex-col gap-3">
          {day.events.length === 0 ? (
            <li className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400">
              일정이 없습니다.
            </li>
          ) : (
            day.events.map((event) => {
              const type = event.type as EventType;
              return (
                <li key={event.id}>
                  <button
                    type="button"
                    onClick={() => onNavigate(event.path)}
                    className={`flex w-full items-start justify-between gap-3 rounded-xl border px-3 py-3 text-left text-sm shadow-sm transition hover:-translate-y-0.5 hover:shadow ${
                      eventTypeStyles[type]
                    }`}
                  >
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{event.time}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{event.title}</p>
                      <p className="text-xs text-slate-600">{event.owner}</p>
                    </div>
                    <span className="text-xs font-medium text-slate-600">바로가기 →</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    ))}
  </div>
);

const RiskActions: React.FC<{ sku: string; riskLevel: InventoryRiskLevel; onNavigate: (path: string) => void }> = ({
  sku,
  riskLevel,
  onNavigate,
}) => {
  const baseButtonClasses =
    'rounded-full border px-3 py-1 text-xs font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-2';
  const actions = [
    {
      id: 'monitor',
      label: '모니터링',
      path: `/inventory/monitoring?sku=${encodeURIComponent(sku)}`,
      className: `${baseButtonClasses} border-slate-300 bg-white text-slate-700 hover:border-slate-400 focus:ring-slate-200`,
      disabled: false,
    },
    {
      id: 'plan',
      label: '보충계획',
      path: `/planning/replenishment?sku=${encodeURIComponent(sku)}`,
      className: `${baseButtonClasses} border-indigo-200 bg-indigo-50 text-indigo-700 hover:border-indigo-300 focus:ring-indigo-200`,
      disabled: riskLevel === 'stable',
    },
    {
      id: 'expedite',
      label: '긴급발주',
      path: `/procurement/expedite?sku=${encodeURIComponent(sku)}`,
      className: `${baseButtonClasses} border-rose-200 bg-rose-50 text-rose-700 hover:border-rose-300 focus:ring-rose-200`,
      disabled: riskLevel === 'stable' || riskLevel === 'medium',
    },
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          onClick={() => onNavigate(action.path)}
          disabled={action.disabled}
          className={`${action.className} ${action.disabled ? 'cursor-not-allowed opacity-50' : ''}`.trim()}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
};

const Home: React.FC<HomeProps> = ({ onNavigate }) => {
  const { data, isLoading, error } = useHomeDashboard();

  const handleNavigate = useCallback(
    (path: string) => {
      if (!path) {
        return;
      }

      if (onNavigate) {
        onNavigate(path);
        return;
      }

      if (typeof window !== 'undefined') {
        window.location.href = path;
      }
    },
    [onNavigate],
  );

  const shortageRateText = useMemo(() => {
    if (!data) {
      return '-';
    }

    return formatPercent(data.shortageRate, { maximumFractionDigits: 1 });
  }, [data]);

  const netMovementSeries = useMemo(() => {
    if (!data) {
      return [];
    }

    return data.movementHistory.map((item) => item.inbound - item.outbound);
  }, [data]);

  const forecastSeries: ForecastSeries[] = useMemo(() => {
    if (!data) {
      return [];
    }

    return [
      {
        id: 'forecast',
        label: '예측',
        color: '#6366f1',
        data: data.demandForecast.map((point) => point.forecast),
        strokeDasharray: '5 3',
      },
      {
        id: 'actual',
        label: '실적',
        color: '#0ea5e9',
        data: data.demandForecast.map((point) => point.actual),
      },
    ];
  }, [data]);

  const forecastLabels = useMemo(() => data?.demandForecast.map((point) => point.label) ?? [], [data]);

  const forecastTotals = useMemo(() => {
    if (!data) {
      return { forecast: 0, actual: 0, accuracy: 0 };
    }

    const aggregated = data.demandForecast.reduce(
      (acc, point) => {
        acc.forecast += point.forecast;
        acc.actual += point.actual;
        return acc;
      },
      { forecast: 0, actual: 0 },
    );

    const accuracy = aggregated.forecast
      ? 1 - Math.abs(aggregated.forecast - aggregated.actual) / aggregated.forecast
      : 0;

    return { ...aggregated, accuracy: Math.max(0, Math.min(accuracy, 1)) };
  }, [data]);

  return (
    <main className="min-h-screen bg-slate-50/80 pb-16 pt-12">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-6 lg:px-10">
        <header className="flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Inventory Control</p>
          <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">재고 운영 통합 대시보드</h1>
          <p className="text-sm text-slate-500 sm:text-base">
            핵심 지표와 위험 SKU, 주간 일정, 수요 예측을 한 화면에서 확인하고 즉시 조치하세요.
          </p>
        </header>

        {isLoading && <LoadingState />}

        {!isLoading && error && (
          <Card className="border-rose-200 bg-rose-50 text-rose-700">
            <p className="text-sm font-semibold">데이터 로딩 중 문제가 발생했습니다.</p>
            <p className="mt-1 text-xs">잠시 후 다시 시도하거나 관리자에게 문의하세요.</p>
          </Card>
        )}

        {!isLoading && data && (
          <>
            <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
              <Card className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">전체 SKU</p>
                    <p className="mt-2 text-3xl font-bold text-slate-900">{formatQty(data.totalSkuCount, { maximumFractionDigits: 0 })}</p>
                  </div>
                  <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-600">
                    갱신 {new Date(data.updatedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-sm text-slate-500">
                  관리 대상 SKU <span className="font-semibold text-slate-900">{data.totalSkuCount.toLocaleString()}</span>개 중
                  {` `}
                  <span className="font-semibold text-indigo-600">{data.shortageSkuCount.toLocaleString()}</span>개가 부족 위험 상태입니다.
                </p>
              </Card>

              <Card className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">부족 SKU</p>
                    <p className="mt-2 text-3xl font-bold text-rose-600">{formatQty(data.shortageSkuCount, { maximumFractionDigits: 0 })}</p>
                  </div>
                  <span className="rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-600">{shortageRateText}</span>
                </div>
                <p className="text-sm text-slate-500">
                  결품 위험 비중이 {shortageRateText} 수준으로 추세 모니터링이 필요합니다. 보충 계획을 우선 점검하세요.
                </p>
                <button
                  type="button"
                  onClick={() => handleNavigate('/inventory/risk?view=shortage')}
                  className="mt-auto w-fit rounded-full border border-rose-200 bg-white px-4 py-2 text-xs font-semibold text-rose-600 transition hover:border-rose-300 hover:text-rose-700"
                >
                  부족 재고 상세 보기
                </button>
              </Card>

              <Card className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">7일 입출고 합계</p>
                    <p className="mt-2 text-3xl font-bold text-slate-900">
                      {formatQty(data.movementTotals.inbound + data.movementTotals.outbound, { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                  <span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white">
                    순이동 {formatQty(data.movementTotals.net, { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-xs text-slate-500">입고</p>
                    <p className="text-lg font-semibold text-emerald-600">
                      {formatQty(data.movementTotals.inbound, { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">출고</p>
                    <p className="text-lg font-semibold text-amber-600">
                      {formatQty(data.movementTotals.outbound, { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                </div>
                <Sparkline
                  data={netMovementSeries}
                  stroke="#0f172a"
                  fill="rgba(30, 41, 59, 0.12)"
                  ariaLabel="최근 7일 순이동 추이"
                  className="mt-auto h-16"
                />
              </Card>
            </section>

            <section className="grid grid-cols-1 gap-6 xl:grid-cols-12">
              <Card className="xl:col-span-7">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">부족 위험 TOP20</h2>
                    <p className="text-sm text-slate-500">재고 커버리지와 Fill Rate를 기반으로 위험도가 높은 SKU 순으로 정렬했습니다.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleNavigate('/inventory/risk?view=top20')}
                    className="mt-2 w-fit rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
                  >
                    전체 위험 리스트
                  </button>
                </div>

                <div className="mt-6 overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                    <thead className="bg-slate-50/70 text-xs uppercase tracking-wider text-slate-500">
                      <tr>
                        <th scope="col" className="px-3 py-3">순위</th>
                        <th scope="col" className="px-3 py-3">SKU / 품명</th>
                        <th scope="col" className="px-3 py-3">카테고리</th>
                        <th scope="col" className="px-3 py-3">커버리지</th>
                        <th scope="col" className="px-3 py-3">부족 수량</th>
                        <th scope="col" className="px-3 py-3">Fill Rate</th>
                        <th scope="col" className="px-3 py-3">추세</th>
                        <th scope="col" className="px-3 py-3">액션</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white/70">
                      {data.riskTop20.map((item: RiskSku, index) => (
                        <tr key={item.id} className="align-top text-xs sm:text-sm">
                          <td className="px-3 py-4 text-sm font-semibold text-slate-600">#{index + 1}</td>
                          <td className="px-3 py-4">
                            <div className="flex flex-col gap-1">
                              <span className="font-mono text-xs text-slate-500">{item.sku}</span>
                              <span className="font-semibold text-slate-900">{item.name}</span>
                              <span
                                className={`w-fit rounded-full px-2 py-1 text-[11px] font-semibold ${riskLevelStyles[item.riskLevel].className}`}
                              >
                                {riskLevelStyles[item.riskLevel].label}
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-4">
                            <div className="flex flex-col text-xs text-slate-500">
                              <span>{item.category}</span>
                              <span className="font-medium text-slate-600">{item.location}</span>
                            </div>
                          </td>
                          <td className="px-3 py-4 font-semibold text-slate-700">{item.daysOfCover.toFixed(1)}일</td>
                          <td className="px-3 py-4 font-semibold text-rose-600">{formatQty(item.shortageQty, { maximumFractionDigits: 0 })}</td>
                          <td className="px-3 py-4 font-semibold text-slate-700">{formatPercent(item.fillRate, { maximumFractionDigits: 0, multiplyBy100: true })}</td>
                          <td className="px-3 py-4">
                            <Sparkline
                              data={item.trend}
                              stroke="#fb7185"
                              fill="rgba(248, 113, 113, 0.12)"
                              ariaLabel={`${item.sku} 주간 추세`}
                              className="h-10"
                            />
                          </td>
                          <td className="px-3 py-4">
                            <RiskActions sku={item.sku} riskLevel={item.riskLevel} onNavigate={handleNavigate} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>

              <div className="flex flex-col gap-6 xl:col-span-5">
                <Card className="flex h-full flex-col gap-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-xl font-semibold text-slate-900">주간 일정 캘린더</h2>
                      <p className="text-sm text-slate-500">재고 운영 관련 일정과 담당 조직을 확인하세요.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleNavigate('/planning/calendar')}
                      className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-slate-300 hover:text-slate-800"
                    >
                      일정 전체 보기
                    </button>
                  </div>
                  <WeeklySchedule days={data.weeklySchedule} onNavigate={handleNavigate} />
                </Card>

                <Card className="flex flex-col gap-6">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-xl font-semibold text-slate-900">수요 예측 추이</h2>
                      <p className="text-sm text-slate-500">예측 대비 실적 흐름을 비교해 정확도를 점검하세요.</p>
                    </div>
                    <div className="flex items-center gap-3 text-xs font-semibold">
                      <span className="flex items-center gap-1 text-indigo-600">
                        <span className="h-2 w-6 rounded-full bg-indigo-500" /> 예측
                      </span>
                      <span className="flex items-center gap-1 text-sky-600">
                        <span className="h-2 w-6 rounded-full bg-sky-500" /> 실적
                      </span>
                    </div>
                  </div>
                  <ForecastChart labels={forecastLabels} series={forecastSeries} />
                  <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                      <p className="text-xs text-slate-500">주간 예측 수요</p>
                      <p className="mt-2 text-2xl font-semibold text-indigo-600">
                        {formatQty(forecastTotals.forecast, { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                      <p className="text-xs text-slate-500">주간 실적 수요</p>
                      <p className="mt-2 text-2xl font-semibold text-sky-600">
                        {formatQty(forecastTotals.actual, { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white/80 p-4 sm:col-span-2">
                      <p className="text-xs text-slate-500">예측 정확도</p>
                      <p className="mt-2 text-2xl font-semibold text-emerald-600">
                        {formatPercent(forecastTotals.accuracy, { maximumFractionDigits: 1, multiplyBy100: true })}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        오차율 {formatPercent(1 - forecastTotals.accuracy, { maximumFractionDigits: 1, multiplyBy100: true })} 수준으로
                        개선 목표 대비 추이를 추적하세요.
                      </p>
                    </div>
                  </div>
                </Card>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
};

export default Home;
