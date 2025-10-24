import React, { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type PolicyMetricsChartProps = {
  metrics: {
    onHand: number;
    meanLR: number;
    safetyStock: number;
    target: number;
    shortage: number;
    recommendedOrder: number;
    sigmaLR: number;
  };
};

type Step = {
  label: string;
  start: number;
  end: number;
  color: string;
  isTotal?: boolean;
};

const formatNumber = (value: number) => Math.round(value).toLocaleString();

const PolicyMetricsChart: React.FC<PolicyMetricsChartProps> = ({ metrics }) => {
  const { onHand, meanLR, safetyStock, target, shortage, recommendedOrder, sigmaLR } = metrics;

  const inventorySteps = useMemo<Step[]>(() => {
    const safeTarget = Math.max(0, target);
    const shortageGap = Math.max(0, safeTarget - onHand);
    const overStock = Math.max(0, onHand - safeTarget);
    const steps: Step[] = [
      { label: '현재 재고', start: 0, end: onHand, color: '#6366F1', isTotal: true },
    ];

    if (shortageGap > 0) {
      steps.push({ label: '부족분', start: onHand, end: onHand + shortageGap, color: '#F97316' });
    }

    if (overStock > 0) {
      steps.push({ label: '초과분', start: safeTarget, end: onHand, color: '#22C55E' });
    }

    steps.push({ label: '목표 재고', start: 0, end: safeTarget, color: '#0EA5E9', isTotal: true });
    return steps;
  }, [onHand, target]);

  const shortageValue = useMemo(() => Math.max(0, shortage), [shortage]);
  const roundingValue = useMemo(() => Math.max(0, recommendedOrder - shortageValue), [recommendedOrder, shortageValue]);

  const orderSteps = useMemo<Step[]>(() => {
    const steps: Step[] = [];
    if (shortageValue > 0) {
      steps.push({ label: '부족분', start: 0, end: shortageValue, color: '#F97316' });
    }
    if (roundingValue > 0) {
      steps.push({ label: '패키지 반올림', start: shortageValue, end: shortageValue + roundingValue, color: '#38BDF8' });
    }
    steps.push({ label: '최종 발주', start: 0, end: recommendedOrder, color: '#10B981', isTotal: true });
    return steps;
  }, [recommendedOrder, roundingValue, shortageValue]);

  const inventoryMax = useMemo(() => {
    const maxCandidate = Math.max(onHand, target, onHand + Math.max(0, target - onHand));
    return Math.max(1, maxCandidate);
  }, [onHand, target]);

  const orderMax = useMemo(() => Math.max(1, recommendedOrder, shortageValue + roundingValue), [recommendedOrder, roundingValue, shortageValue]);

  const levelData = useMemo(
    () => [
      {
        category: '현재 재고',
        current: onHand,
        mean: 0,
        safety: 0,
        order: 0,
      },
      {
        category: '목표 재고',
        current: 0,
        mean: Math.max(0, meanLR),
        safety: safetyStock,
        order: 0,
      },
      {
        category: '권고 발주',
        current: 0,
        mean: 0,
        safety: 0,
        order: recommendedOrder,
      },
    ],
    [meanLR, onHand, recommendedOrder, safetyStock],
  );

  const renderSteps = (steps: Step[], maxValue: number) => (
    <div className="space-y-1">
      {steps.map((step, index) => {
        const start = Math.min(step.start, step.end);
        const end = Math.max(step.start, step.end);
        const widthPercent = ((end - start) / maxValue) * 100;
        const offsetPercent = (start / maxValue) * 100;
        const displayValue = step.isTotal ? end : end - start;

        return (
          <div key={`${step.label}-${index}`} className="flex items-center gap-3">
            <div className="w-24 text-xs text-slate-500">{step.label}</div>
            <div className="flex-1 relative h-4">
              <div className="absolute inset-0 rounded-full bg-slate-100" />
              <div
                className="absolute top-0 h-4 rounded-full shadow-sm"
                style={{
                  left: `${offsetPercent}%`,
                  width: `${widthPercent}%`,
                  backgroundColor: step.color,
                }}
              />
              {index < steps.length - 1 && (
                <div
                  className="absolute top-0 bottom-0 border-r border-dashed border-slate-300"
                  style={{ left: `${(end / maxValue) * 100}%` }}
                />
              )}
            </div>
            <div className="w-16 text-right text-xs font-semibold text-slate-700">{formatNumber(displayValue)}</div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
          <span>재고 수준 비교</span>
          <span>σ(L+R)≈{sigmaLR.toFixed(1)}</span>
        </div>
        <div className="h-40">
          <ResponsiveContainer>
            <BarChart data={levelData} barGap={16}>
              <CartesianGrid vertical={false} stroke="#E2E8F0" strokeDasharray="3 3" />
              <XAxis dataKey="category" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={(value) => formatNumber(value)} />
              <Tooltip formatter={(value: number) => formatNumber(value)} cursor={{ fill: 'rgba(148, 163, 184, 0.15)' }} />
              <Bar dataKey="current" stackId="inventory" fill="#6366F1" radius={[8, 8, 0, 0]} name="현재 재고" />
              <Bar dataKey="mean" stackId="inventory" fill="#38BDF8" radius={[8, 8, 0, 0]} name="예상 수요" />
              <Bar dataKey="safety" stackId="inventory" fill="#F97316" radius={[8, 8, 0, 0]} name="안전재고" />
              <Bar dataKey="order" stackId="inventory" fill="#10B981" radius={[8, 8, 0, 0]} name="권고 발주" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 text-xs text-slate-600 sm:grid-cols-2">
        <div>
          <div className="font-semibold text-slate-700 mb-2">재고 워터폴</div>
          {renderSteps(inventorySteps, inventoryMax)}
        </div>
        <div>
          <div className="font-semibold text-slate-700 mb-2">발주량 워터폴</div>
          {renderSteps(orderSteps, orderMax)}
        </div>
      </div>
    </div>
  );
};

export default PolicyMetricsChart;
