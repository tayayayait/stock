import * as React from 'react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export interface ForecastChartLine {
  key: string;
  name: string;
  color?: string;
}

export interface ForecastRange {
  start: string;
  end: string;
}

interface ForecastChartProps {
  data: Array<Record<string, number | string | null>>;
  lines: ForecastChartLine[];
  forecastRange?: ForecastRange | null;
  colors?: string[];
  loading?: boolean;
  error?: string | null;
}

const DEFAULT_COLORS = ['#6366f1', '#f97316', '#22c55e', '#ec4899', '#0ea5e9', '#a855f7'];

const ForecastChart: React.FC<ForecastChartProps> = ({
  data,
  lines,
  forecastRange,
  colors = DEFAULT_COLORS,
  loading = false,
  error = null,
}) => {
  if (loading) {
    return (
      <div className="h-80 flex items-center justify-center text-sm text-slate-500">
        선택한 품목의 머신러닝 예측을 불러오는 중입니다...
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-80 flex items-center justify-center text-sm text-rose-500 text-center px-6">
        {error}
      </div>
    );
  }

  if (data.length === 0 || lines.length === 0) {
    return (
      <div className="h-80 flex items-center justify-center text-sm text-slate-400">
        표시할 예측 데이터가 없습니다.
      </div>
    );
  }

  return (
    <div className="h-80">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis />
          <Tooltip />
          <Legend />
          {forecastRange && (
            <ReferenceArea x1={forecastRange.start} x2={forecastRange.end} fill="#6366f1" fillOpacity={0.12} />
          )}
          {lines.map((line, index) => (
            <Line
              key={line.key}
              type="monotone"
              dataKey={line.key}
              name={line.name}
              stroke={line.color ?? colors[index % colors.length]}
              dot
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ForecastChart;
