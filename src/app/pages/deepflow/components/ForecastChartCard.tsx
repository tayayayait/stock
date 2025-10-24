import * as React from 'react';
import { motion } from 'framer-motion';
import ForecastChart, { type ForecastChartLine, type ForecastRange } from './ForecastChart';

interface ForecastChartCardProps {
  sku: string | null;
  chartData: Array<Record<string, number | string | null>>;
  lines: ForecastChartLine[];
  forecastRange?: ForecastRange | null;
  colors?: string[];
  loading?: boolean;
  error?: string | null;
  children?: React.ReactNode;
}

const ForecastChartCard: React.FC<ForecastChartCardProps> = ({
  sku,
  chartData,
  lines,
  forecastRange,
  colors,
  loading = false,
  error = null,
  children,
}) => {
  return (
    <motion.section
      className="col-span-12 rounded-3xl border border-white/70 bg-white/60 p-5 shadow-lg backdrop-blur-sm"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-semibold">품번: {sku ?? '선택 없음'}</h3>
      </div>
      <ForecastChart
        data={chartData}
        lines={lines}
        forecastRange={forecastRange}
        colors={colors}
        loading={loading}
        error={error}
      />
      {children}
    </motion.section>
  );
};

export default ForecastChartCard;
