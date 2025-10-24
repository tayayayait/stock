import * as React from 'react';
import type { ForecastExplanation } from '../../../../services/api';

interface ModelInterpretationBlockProps {
  explanation: ForecastExplanation | null;
  loading?: boolean;
  error?: string | null;
}

const ModelInterpretationBlock: React.FC<ModelInterpretationBlockProps> = ({
  explanation,
  loading = false,
  error = null,
}) => {
  if (loading) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
        <h4 className="text-sm font-semibold text-slate-700">모델 해석</h4>
        <p className="mt-3 text-xs text-slate-500">예측 결과 해석을 수집하는 중입니다...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-xs text-rose-600 shadow-sm">
        {error}
      </section>
    );
  }

  if (!explanation) {
    return (
      <section className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-4 text-xs text-slate-500">
        머신러닝 인사이트를 표시할 데이터가 없습니다.
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
      <header>
        <h4 className="text-sm font-semibold text-slate-700">모델 해석</h4>
        <p className="mt-1 text-xs text-slate-500">{explanation.model.name}</p>
      </header>
      <p className="mt-3 text-xs leading-5 text-slate-600">{explanation.summary}</p>
      {explanation.drivers.length > 0 && (
        <ul className="mt-4 list-disc list-inside space-y-1 text-xs text-slate-600">
          {explanation.drivers.map((driver, index) => (
            <li key={index}>{driver}</li>
          ))}
        </ul>
      )}
      <footer className="mt-4 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
        <div>
          학습 구간: {explanation.model.trainingWindow}
          {explanation.model.seasonalPeriod ? ` · 계절성 ${explanation.model.seasonalPeriod}` : ''}
        </div>
        <div>
          생성 시각: {new Date(explanation.model.generatedAt).toLocaleString('ko-KR', { hour12: false })}
          {typeof explanation.model.mape === 'number' ? ` · MAPE ${explanation.model.mape.toFixed(1)}%` : ''}
        </div>
      </footer>
    </section>
  );
};

export default ModelInterpretationBlock;
