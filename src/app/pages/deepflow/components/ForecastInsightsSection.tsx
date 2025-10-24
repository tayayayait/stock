import * as React from 'react';
import type { ForecastExplanation, ForecastResponse } from '../../../../services/api';
import SalesAnalysisPanel from './SalesAnalysisPanel';
import ModelInterpretationBlock from './ModelInterpretationBlock';
import ActionPlanCards, { type ActionPlanItem } from './ActionPlanCards';

interface ForecastInsightsSectionProps {
  sku: string | null;
  productName?: string;
  metrics: ForecastResponse['metrics'] | null;
  explanation: ForecastExplanation | null;
  actionPlans: ActionPlanItem[];
  loading?: boolean;
  error?: string | null;
}

const ForecastInsightsSection: React.FC<ForecastInsightsSectionProps> = ({
  sku,
  productName,
  metrics,
  explanation,
  actionPlans,
  loading = false,
  error = null,
}) => {
  return (
    <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-3">
      <SalesAnalysisPanel
        sku={sku}
        productName={productName}
        metrics={metrics}
        loading={loading}
      />
      <ModelInterpretationBlock explanation={explanation} loading={loading} error={error} />
      <ActionPlanCards items={actionPlans} loading={loading} />
    </div>
  );
};

export default ForecastInsightsSection;
