import * as React from 'react';

export interface ActionPlanItem {
  id: string;
  title: string;
  description: string;
  tone?: 'info' | 'warning' | 'success';
  metricLabel?: string;
}

interface ActionPlanCardsProps {
  items: ActionPlanItem[];
  loading?: boolean;
}

const toneClassMap: Record<'default' | 'info' | 'warning' | 'success', string> = {
  default: 'bg-slate-100 text-slate-600',
  info: 'bg-indigo-100 text-indigo-700',
  warning: 'bg-amber-100 text-amber-700',
  success: 'bg-emerald-100 text-emerald-700',
};

const ActionPlanCards: React.FC<ActionPlanCardsProps> = ({ items, loading = false }) => {
  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
        <h4 className="text-sm font-semibold text-slate-700">실행 계획</h4>
        <p className="mt-3 text-xs text-slate-500">맞춤 실행 계획을 준비하는 중입니다...</p>
      </section>
    );
  }

  if (!items.length) {
    return (
      <section className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-4 text-xs text-slate-500">
        실행 계획을 생성할 데이터가 부족합니다.
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
      <h4 className="text-sm font-semibold text-slate-700">실행 계획</h4>
      <ul className="mt-3 grid gap-3">
        {items.map((item) => {
          const badgeTone = item.tone ?? 'default';
          return (
            <li key={item.id} className="rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold ${toneClassMap[badgeTone]}`}>
                    {item.title}
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-600">{item.description}</p>
                </div>
                {item.metricLabel && (
                  <span className="rounded-full bg-indigo-50 px-3 py-1 text-[11px] font-semibold text-indigo-600 shadow-inner">
                    {item.metricLabel}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default ActionPlanCards;
