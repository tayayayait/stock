import { type DemandHistoryPoint } from '../data/forecastSources.js';

const MS_PER_DAY = 86_400_000;

const toUtcDate = (value: string): Date => {
  const normalized = value.includes('T') ? value : `${value}T00:00:00Z`;
  return new Date(normalized);
};

const formatIsoMonth = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
};

const clampNumber = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, value);
};

interface RegressionResult {
  slope: number;
  intercept: number;
}

const linearRegression = (values: number[]): RegressionResult => {
  if (values.length <= 1) {
    return { slope: 0, intercept: values[0] ?? 0 };
  }

  const n = values.length;
  const meanX = (n - 1) / 2;
  const meanY = values.reduce((sum, value) => sum + value, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i += 1) {
    const deviationX = i - meanX;
    numerator += deviationX * (values[i] - meanY);
    denominator += deviationX * deviationX;
  }

  if (denominator === 0) {
    return { slope: 0, intercept: meanY };
  }

  const slope = numerator / denominator;
  const intercept = meanY - slope * meanX;
  return { slope, intercept };
};

const MONTHS_IN_YEAR = 12;

const computeSeasonalFactors = (
  history: DemandHistoryPoint[],
  intercept: number,
  slope: number,
): number[] => {
  const totals = new Array(MONTHS_IN_YEAR).fill(0);
  const counts = new Array(MONTHS_IN_YEAR).fill(0);

  history.forEach((point, index) => {
    const date = toUtcDate(point.date);
    const month = date.getUTCMonth();
    const baseline = intercept + slope * index;
    if (!Number.isFinite(baseline) || baseline === 0) {
      totals[month] += 1;
      counts[month] += 1;
      return;
    }
    totals[month] += point.quantity / baseline;
    counts[month] += 1;
  });

  const factors = totals.map((total, month) => {
    if (counts[month] === 0) {
      return 1;
    }
    const value = total / counts[month];
    return Number.isFinite(value) && value > 0 ? value : 1;
  });

  const valid = factors.filter((factor) => factor > 0);
  const average = valid.length > 0 ? valid.reduce((sum, value) => sum + value, 0) / valid.length : 1;

  if (!Number.isFinite(average) || average === 0) {
    return new Array(MONTHS_IN_YEAR).fill(1);
  }

  return factors.map((factor) => factor / average);
};

export interface ForecastPoint {
  date: string;
  actual: number | null;
  forecast: number;
  lower: number;
  upper: number;
  phase: 'history' | 'forecast';
  promo?: boolean;
}

export interface SeasonalForecastResult {
  timeline: ForecastPoint[];
  mape: number | null;
  sigma: number;
  slope: number;
  intercept: number;
  seasonalPeriod: number;
  seasonalFactors: number[];
  trainingStart: string;
  trainingEnd: string;
}

export interface BuildForecastOptions {
  horizon?: number;
  upcomingPromotions?: Record<string, string>;
}

export function buildSeasonalForecast(
  rawHistory: DemandHistoryPoint[],
  options: BuildForecastOptions = {},
): SeasonalForecastResult {
  if (rawHistory.length === 0) {
    throw new Error('수요 히스토리가 비어 있어 예측을 계산할 수 없습니다.');
  }

  const history = [...rawHistory].sort((a, b) => toUtcDate(a.date).getTime() - toUtcDate(b.date).getTime());
  const quantities = history.map((point) => point.quantity);
  const { slope, intercept } = linearRegression(quantities);
  const seasonalFactors = computeSeasonalFactors(history, intercept, slope);

  const fitted: number[] = history.map((point, index) => {
    const month = toUtcDate(point.date).getUTCMonth();
    const baseline = intercept + slope * index;
    const seasonal = seasonalFactors[month] ?? 1;
    return clampNumber(baseline * seasonal);
  });

  const residuals = history.map((point, index) => point.quantity - fitted[index]);
  const squaredSum = residuals.reduce((sum, value) => sum + value * value, 0);
  const sigma = Math.sqrt(squaredSum / Math.max(history.length - 1, 1));

  const absolutePercentageErrors: number[] = history
    .map((point, index) => {
      if (point.quantity <= 0) {
        return null;
      }
      const error = Math.abs(point.quantity - fitted[index]);
      return error / point.quantity;
    })
    .filter((value): value is number => value !== null && Number.isFinite(value));

  const mape =
    absolutePercentageErrors.length > 0
      ? (absolutePercentageErrors.reduce((sum, value) => sum + value, 0) / absolutePercentageErrors.length) * 100
      : null;

  const horizon = options.horizon ?? 6;
  const lastHistoryDate = toUtcDate(history[history.length - 1].date);

  const timeline: ForecastPoint[] = history.map((point, index) => ({
    date: point.date,
    actual: point.quantity,
    forecast: Math.round(fitted[index]),
    lower: Math.round(Math.max(fitted[index] - 1.64 * sigma, 0)),
    upper: Math.round(Math.max(fitted[index] + 1.64 * sigma, fitted[index])),
    phase: 'history',
    promo: point.promo ?? false,
  }));

  for (let step = 1; step <= horizon; step += 1) {
    const futureDate = new Date(Date.UTC(lastHistoryDate.getUTCFullYear(), lastHistoryDate.getUTCMonth() + step, 1));
    const month = futureDate.getUTCMonth();
    const baseline = intercept + slope * (history.length - 1 + step);
    const seasonal = seasonalFactors[month] ?? 1;
    const forecastValue = clampNumber(baseline * seasonal);
    const lower = Math.max(forecastValue - 1.64 * sigma, 0);
    const upper = Math.max(forecastValue + 1.64 * sigma, forecastValue);
    const isoDate = formatIsoMonth(futureDate);
    timeline.push({
      date: isoDate,
      actual: null,
      forecast: Math.round(forecastValue),
      lower: Math.round(lower),
      upper: Math.round(upper),
      phase: 'forecast',
      promo: options.upcomingPromotions ? isoDate in options.upcomingPromotions : false,
    });
  }

  return {
    timeline,
    mape: mape !== null ? Math.round(mape * 10) / 10 : null,
    sigma,
    slope,
    intercept,
    seasonalPeriod: MONTHS_IN_YEAR,
    seasonalFactors,
    trainingStart: history[0].date,
    trainingEnd: history[history.length - 1].date,
  };
}

export function estimateStockoutDate(
  availableStock: number,
  futureTimeline: ForecastPoint[],
): string | null {
  if (!Number.isFinite(availableStock) || availableStock <= 0) {
    return null;
  }

  let remaining = availableStock;

  for (const point of futureTimeline) {
    if (point.phase !== 'forecast') {
      continue;
    }
    const monthlyDemand = point.forecast;
    if (monthlyDemand <= 0) {
      continue;
    }
    const dailyDemand = monthlyDemand / 30;
    const consumptionDays = Math.ceil(remaining / dailyDemand);
    const pointDate = toUtcDate(point.date);
    if (consumptionDays <= 30) {
      const stockoutDate = new Date(pointDate.getTime() + Math.max(consumptionDays - 1, 0) * MS_PER_DAY);
      return stockoutDate.toISOString();
    }
    remaining -= monthlyDemand;
    if (remaining <= 0) {
      const stockoutDate = new Date(pointDate.getTime() + 29 * MS_PER_DAY);
      return stockoutDate.toISOString();
    }
  }

  return null;
}
