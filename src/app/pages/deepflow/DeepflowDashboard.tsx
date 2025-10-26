import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createEmptyProduct,
  DEFAULT_UNIT,
  normalizeProduct,
  type InventoryRisk,
  type Product,
  type ProductInventoryEntry,
} from '../../../domains/products';
import {
  fetchForecast,
  fetchWarehouses,
  fetchLocations,
  type ForecastResponse,
  type ApiWarehouse,
  type ApiLocation,
} from '../../../services/api';
import { downloadTemplate } from '../../../services/csv';
import * as ProductService from '../../../services/products';
import { type HttpError } from '../../../services/http';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { motion } from 'framer-motion';
import ServiceCoveragePanel from '../../../../components/ServiceCoveragePanel';
import PolicyMetricsChart from './components/PolicyMetricsChart';
import WarehouseManagementPanel from './components/WarehouseManagementPanel';
import PartnerManagementPanel from './components/PartnerManagementPanel';
import CategoryManagementPanel from './components/CategoryManagementPanel';
import ProductCsvUploadDialog from './components/ProductCsvUploadDialog';
import CategoryManageDialog from './components/CategoryManageDialog';
import { type ForecastChartLine, type ForecastRange } from './components/ForecastChart';
import ForecastChartCard from './components/ForecastChartCard';
import ForecastInsightsSection from './components/ForecastInsightsSection';
import { type ActionPlanItem } from './components/ActionPlanCards';
import { extractFirstDetail, validateProductDraft } from './productValidation';
import ProductForm from './components/ProductForm';
import ProductDetailPanel from './components/ProductDetailPanel';
import { subscribeInventoryRefresh } from '../../utils/inventoryEvents';
import { savePolicies, type PolicyDraft } from '../../../services/policies';

interface ForecastRow {
  date: string;
  actual: number;
  fc: number;
  promo?: boolean;
}

interface ForecastSeriesPoint {
  date: string;
  actual: number | null;
  fc: number;
  phase: 'history' | 'forecast';
  promo?: boolean;
}

interface ForecastStateEntry {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data?: ForecastResponse;
  error?: string;
}

export interface PolicyRow extends PolicyDraft {}

interface KpiSummary {
  opening: number;
  avgDOS: number;
  turns: number;
  serviceLevel: number;
}

interface RiskSummaryEntry {
  risk: InventoryRisk;
  count: number;
  ratio: number;
}

type DrawerMode = 'new' | 'edit';

interface ProductDrawerState {
  originalSku?: string;
  mode: DrawerMode;
  row: Product;
}

type CsvStatusMessage = { kind: 'error' | 'success'; message: string };

const INITIAL_FORECAST: ForecastRow[] = [
  { date: '25-07', actual: 2000, fc: 2300 },
  { date: '25-08', actual: 5000, fc: 4800, promo: true },
  { date: '25-09', actual: 3000, fc: 3200 },
  { date: '25-10', actual: 2600, fc: 2800 },
  { date: '25-11', actual: 5200, fc: 5100 },
  { date: '25-12', actual: 4400, fc: 4489 },
];

const SERVICE_LEVEL_PRESETS = [85, 90, 93, 95, 97.5, 99] as const;

const INITIAL_POLICIES: PolicyRow[] = [
  { sku: 'D1E2F3G', forecastDemand: 320, demandStdDev: 48, leadTimeDays: 10, serviceLevelPercent: 95 },
  { sku: 'H4I5J6K', forecastDemand: 275, demandStdDev: 62, leadTimeDays: 21, serviceLevelPercent: 97 },
  { sku: 'L7M8N9O', forecastDemand: 190, demandStdDev: 28, leadTimeDays: 7, serviceLevelPercent: 93 },
];

const MONTHS = [
  '23-12',
  '24-01',
  '24-02',
  '24-03',
  '24-04',
  '24-05',
  '24-06',
  '24-07',
  '24-08',
  '24-09',
  '24-10',
  '24-11',
  '24-12',
];

const FORECAST_START_IDX = 7;
const LINE_COLORS = ['#6366f1', '#f97316', '#22c55e', '#ec4899', '#0ea5e9', '#a855f7'];
const HISTORY_MONTH_WINDOW = 6;

const erf = (x: number): number => {
  const sign = x < 0 ? -1 : 1;
  const abs = Math.abs(x);
  const t = 1 / (1 + 0.5 * abs);
  const tau = t * Math.exp(
    -abs * abs -
      1.26551223 +
      t *
        (1.00002368 +
          t *
            (0.37409196 +
              t *
                (0.09678418 +
                  t *
                    (-0.18628806 +
                      t *
                        (0.27886807 +
                          t *
                            (-1.13520398 +
                              t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))
  );
  return sign * (1 - tau);
};

const standardNormalCdf = (x: number): number => 0.5 * (1 + erf(x / Math.SQRT2));

const inverseStandardNormalCdf = (p: number): number => {
  if (p <= 0) {
    return Number.NEGATIVE_INFINITY;
  }
  if (p >= 1) {
    return Number.POSITIVE_INFINITY;
  }

  const a = [
    -3.969683028665376e1,
    2.209460984245205e2,
    -2.759285104469687e2,
    1.38357751867269e2,
    -3.066479806614716e1,
    2.506628277459239,
  ] as const;
  const b = [
    -5.447609879822406e1,
    1.615858368580409e2,
    -1.556989798598866e2,
    6.680131188771972e1,
    -1.328068155288572e1,
  ] as const;
  const c = [
    -7.784894002430293e-3,
    -3.223964580411365e-1,
    -2.400758277161838,
    -2.549732539343734,
    4.374664141464968,
    2.938163982698783,
  ] as const;
  const d = [
    7.784695709041462e-3,
    3.224671290700398e-1,
    2.445134137142996,
    3.754408661907416,
  ] as const;

  const plow = 0.02425;
  const phigh = 1 - plow;

  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }

  if (p <= phigh) {
    const q = p - 0.5;
    const r = q * q;
    return (
      (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }

  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(
    (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
};

const serviceLevelPercentageToZ = (percent: number): number => {
  if (!Number.isFinite(percent)) {
    return Number.NaN;
  }
  const probability = Math.min(Math.max(percent / 100, 1e-4), 0.9999);
  return inverseStandardNormalCdf(probability);
};

const zToServiceLevelPercentage = (z: number): number => {
  if (!Number.isFinite(z)) {
    return 0;
  }
  return standardNormalCdf(z) * 100;
};

type ForecastMetrics = ForecastResponse['metrics'];
type ForecastExplanation = ForecastResponse['explanation'];

const createProjectedDate = (daysAhead: number): string | null => {
  if (!Number.isFinite(daysAhead)) {
    return null;
  }

  const base = new Date();
  base.setHours(0, 0, 0, 0);
  base.setDate(base.getDate() + Math.max(0, Math.round(daysAhead)));
  return base.toISOString().split('T')[0] ?? null;
};

const buildFallbackMetrics = (product: Product, series: ForecastSeriesPoint[]): ForecastMetrics => {
  const safeSeries = Array.isArray(series) && series.length > 0 ? series : buildFallbackSeries(product, 0, false);

  const history = safeSeries.filter((point) => point.phase === 'history');
  const outboundHistory = history.reduce((sum, point) => sum + Math.max(point.actual ?? 0, 0), 0);
  const promoOutbound = safeSeries
    .filter((point) => point.promo)
    .reduce((sum, point) => {
      const value = point.actual ?? point.fc ?? 0;
      return sum + Math.max(value, 0);
    }, 0);
  const projectedForecast = safeSeries
    .filter((point) => point.phase === 'forecast')
    .reduce((sum, point) => sum + Math.max(point.fc ?? 0, 0), 0);

  const outboundTotal = Math.max(outboundHistory + Math.round(projectedForecast * 0.25), 0);
  const outboundReasons: Record<string, number> = {};
  if (promoOutbound > 0) {
    outboundReasons['프로모션'] = promoOutbound;
  }
  outboundReasons['일반 수요'] = Math.max(outboundTotal - (outboundReasons['프로모션'] ?? 0), 0);

  const avgDailyDemand = Math.max(Math.round(product.dailyAvg), 0);
  const currentTotalStock = Math.max(product.onHand, 0);
  const reorderPoint = Math.max(Math.round(avgDailyDemand * 20), 0);
  const available = availableStock(product);
  const recommendedOrderQty = Math.max(reorderPoint - available, 0);
  const coverageDays = avgDailyDemand > 0 ? available / avgDailyDemand : null;

  return {
    windowStart: history[0]?.date ?? safeSeries[0]?.date ?? '',
    windowEnd: safeSeries[safeSeries.length - 1]?.date ?? history[history.length - 1]?.date ?? '',
    outboundTotal,
    outboundReasons,
    avgDailyDemand,
    currentTotalStock,
    reorderPoint,
    recommendedOrderQty,
    projectedStockoutDate: coverageDays !== null ? createProjectedDate(coverageDays) : null,
  };
};

const buildFallbackExplanation = (product: Product, metrics: ForecastMetrics): ForecastExplanation => {
  const reasonHighlights = Object.entries(metrics.outboundReasons)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label, value]) => `${label} 약 ${Math.round(value).toLocaleString()}개`);

  const available = availableStock(product);

  return {
    summary: `${product.name} (${product.sku})는 최근 기간 동안 총 ${metrics.outboundTotal.toLocaleString()}개의 출고가 발생했으며 일 평균 수요는 ${metrics.avgDailyDemand.toLocaleString()}개 수준입니다.`,
    drivers: reasonHighlights,
    details: `가용재고 ${available.toLocaleString()}개, 권장 발주량 ${metrics.recommendedOrderQty.toLocaleString()}개, 재고 소진 예상 ${metrics.projectedStockoutDate ?? '정보 없음'}.`,
    model: {
      name: '휴리스틱 기반 시뮬레이션',
      seasonalPeriod: 3,
      trainingWindow: `${metrics.windowStart || 'N/A'} ~ ${metrics.windowEnd || 'N/A'}`,
      generatedAt: new Date().toISOString(),
      mape: null,
    },
  };
};

const buildActionPlans = (product: Product, metrics: ForecastMetrics): ActionPlanItem[] => {
  const items: ActionPlanItem[] = [];
  const available = availableStock(product);
  const orderQty = Math.max(Math.round(metrics.recommendedOrderQty), 0);

  items.push({
    id: 'reorder',
    title: '발주 제안',
    tone: orderQty > 0 ? 'info' : 'success',
    description:
      orderQty > 0
        ? `${product.name}의 가용재고가 권장 재주문점 이하입니다. ${orderQty.toLocaleString()}개 발주를 검토하세요.`
        : `${product.name}의 가용재고가 권장 재주문점을 상회하고 있어 추가 발주가 필요하지 않습니다.`,
    metricLabel: orderQty > 0 ? `${orderQty.toLocaleString()}개 권장` : `${available.toLocaleString()}개 보유`,
  });

  if (metrics.projectedStockoutDate) {
    items.push({
      id: 'stockout',
      title: '재고 소진 경고',
      tone: 'warning',
      description: `${metrics.projectedStockoutDate} 전에 재고가 소진될 것으로 예상됩니다. 출고 속도 조절이나 대체 상품을 검토하세요.`,
      metricLabel: metrics.projectedStockoutDate,
    });
  } else {
    items.push({
      id: 'coverage',
      title: '재고 커버리지',
      tone: 'success',
      description: '예상 수요 대비 충분한 재고를 확보하고 있습니다. 판매 추이를 모니터링하면서 현 수준을 유지하세요.',
      metricLabel: `${available.toLocaleString()}개 가용`,
    });
  }

  const coverageGap = metrics.currentTotalStock - metrics.reorderPoint;
  items.push({
    id: 'buffer',
    title: coverageGap >= 0 ? '안전재고 충족' : '안전재고 미달',
    tone: coverageGap >= 0 ? 'success' : 'warning',
    description:
      coverageGap >= 0
        ? '현재 재고가 안전재고 이상을 유지하고 있습니다. 입고 일정과 프로모션 계획을 재확인하세요.'
        : '안전재고 이하로 떨어져 있어 보충이 필요합니다. 리드타임을 고려한 긴급 발주를 검토하세요.',
    metricLabel:
      coverageGap >= 0
        ? `${Math.round(coverageGap).toLocaleString()}개 초과`
        : `${Math.abs(Math.round(coverageGap)).toLocaleString()}개 부족`,
  });

  return items;
};

const formatMonthLabel = (iso: string): string => {
  if (!iso) {
    return iso;
  }
  if (/^\d{2}-\d{2}$/.test(iso)) {
    return iso;
  }
  const parsed = new Date(iso.includes('T') ? iso : `${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }
  const year = String(parsed.getUTCFullYear()).slice(-2);
  const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const buildFallbackSeries = (row: Product, idx: number, promoExclude: boolean): ForecastSeriesPoint[] => {
  return MONTHS.map((month, monthIndex) => {
    const base = Math.max(50, Math.round(row.dailyAvg * 18 + (idx + 1) * 25));
    const seasonalMultiplier = monthIndex % 6 === 2 ? 1.6 : monthIndex % 6 === 5 ? 1.4 : 1;
    const seasonal = Math.round(seasonalMultiplier * base);
    const actual = monthIndex < FORECAST_START_IDX
      ? Math.max(10, seasonal + (monthIndex % 2 === 0 ? -120 : 140))
      : null;
    const isPromoMonth = monthIndex === FORECAST_START_IDX + 1;
    const adjustedForecast = promoExclude && isPromoMonth ? 0.92 : 1;
    const fc = Math.round(seasonal * adjustedForecast);

    return {
      date: month,
      actual,
      fc,
      phase: monthIndex < FORECAST_START_IDX ? 'history' : 'forecast',
      promo: isPromoMonth,
    };
  });
};

const STANDARD_COVERAGE_DAYS = 30;
const SAFETY_COVERAGE_DAYS = 12;

const availableStock = (row: Product): number => Math.max(row.onHand - row.reserved, 0);

const resolveExpiryDays = (row: Product): number | null => {
  const value = row.expiryDays;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  if (value < 0) {
    return 0;
  }
  return Math.floor(value);
};

const hasExpiryWithin = (row: Product, threshold: number): boolean => {
  const expiry = resolveExpiryDays(row);
  return expiry !== null && expiry <= threshold;
};

const compareExpiryAsc = (a: Product, b: Product): number => {
  const expiryA = resolveExpiryDays(a);
  const expiryB = resolveExpiryDays(b);
  if (expiryA === null && expiryB === null) {
    return 0;
  }
  if (expiryA === null) {
    return 1;
  }
  if (expiryB === null) {
    return -1;
  }
  return expiryA - expiryB;
};

const formatExpiryBadge = (value: number | null): string => {
  if (value === null) {
    return '만료 정보 없음';
  }
  return `D-${value}`;
};
const safetyStock = (row: Product): number => Math.round(row.dailyAvg * SAFETY_COVERAGE_DAYS);
const standardStock = (row: Product): number => Math.round(row.dailyAvg * STANDARD_COVERAGE_DAYS);

const isHttpError = (error: unknown): error is HttpError =>
  Boolean(error && typeof error === 'object' && 'payload' in (error as { payload?: unknown }));

const toPositiveInteger = (value: number | null | undefined): number => {
  if (!Number.isFinite(value as number)) {
    return 0;
  }
  return Math.max(Math.round(value as number), 0);
};

const resolveTotalInbound = (row: Product): number => toPositiveInteger(row.totalInbound ?? 0);
const resolveTotalOutbound = (row: Product): number => toPositiveInteger(row.totalOutbound ?? 0);
const resolveAvgOutbound7d = (row: Product): number => toPositiveInteger(row.avgOutbound7d ?? 0);

const calculateEtaDays = (row: Product): number | null => {
  const recentAverage = resolveAvgOutbound7d(row);
  if (recentAverage <= 0) {
    return null;
  }
  const currentStock = toPositiveInteger(row.onHand);
  return Math.max(Math.round(currentStock / recentAverage), 0);
};

const calculateExcessRate = (row: Product, safetyOverride?: number): number | null => {
  const safety = toPositiveInteger(safetyOverride ?? safetyStock(row));
  if (safety <= 0) {
    return null;
  }
  const currentStock = toPositiveInteger(row.onHand);
  const ratio = ((currentStock - safety) / safety) * 100;
  if (!Number.isFinite(ratio)) {
    return null;
  }
  return Math.round(ratio);
};

const calculateServiceLevelPercent = (rows: Product[]): number => {
  const total = Math.max(rows.length, 1);
  const riskCount = rows.filter((row) => row.risk === '결품위험').length;
  const base = 100 - (riskCount / total) * 12;
  return Math.max(82, Math.min(99, Math.round(base)));
};

const projectedStock = (row: Product, daysAhead = 7): number => {
  const projected = availableStock(row) - row.dailyAvg * daysAhead;
  return Math.max(Math.round(projected), 0);
};

const monthlyDemand = (row: Product): number => Math.max(Math.round(row.dailyAvg * 30), 0);

const recommendedAction = (
  row: Product,
): { label: string; tone: string; description: string } => {
  const coverage = calculateEtaDays(row) ?? 0;
  const projected = projectedStock(row);
  const safety = safetyStock(row);

  if (coverage <= Math.max(Math.round(SAFETY_COVERAGE_DAYS / 2), 1)) {
    return {
      label: '긴급 발주',
      tone: 'bg-red-50 text-red-700 border-red-200',
      description: '오늘 발주로 결품 방지',
    };
  }

  if (coverage < SAFETY_COVERAGE_DAYS || projected < safety) {
    return {
      label: '보충 계획',
      tone: 'bg-amber-50 text-amber-700 border-amber-200',
      description: '이번 주 입고 일정 조정',
    };
  }

  if (coverage > Math.round(STANDARD_COVERAGE_DAYS * 1.6)) {
    return {
      label: '재고 소진',
      tone: 'bg-sky-50 text-sky-700 border-sky-200',
      description: '판촉/이동으로 재고 줄이기',
    };
  }

  return {
    label: '모니터링',
    tone: 'bg-slate-100 text-slate-600 border-slate-200',
    description: '일상 점검 유지',
  };
};

type ForecastPeriodLabel =
  | '\uC77C\uC8FC \uD6C4'
  | '\uC774\uC8FC \uD6C4'
  | '\uC77C\uB2EC \uD6C4'
  | '\uC0BC\uB2EC \uD6C4'
  | '\uC721\uB2EC \uD6C4';

type MonthKey = number;

const FORECAST_PERIOD_OPTIONS: Record<ForecastPeriodLabel, number> = {
  '\uC77C\uC8FC \uD6C4': 1,
  '\uC774\uC8FC \uD6C4': 2,
  '\uC77C\uB2EC \uD6C4': 4,
  '\uC0BC\uB2EC \uD6C4': 12,
  '\uC721\uB2EC \uD6C4': 24,
};

const MONTHLY_SHIPMENT_KEY = '\uCD9C\uACE0\uB7C9';
const AVAILABLE_STOCK_KEY = '\uAC00\uC6A9\uC7AC\uACE0';
const SAFETY_STOCK_KEY = '안전재고';
const OVERSTOCK_RATE_KEY = '\uCD08\uACFC\uC7AC\uACE0\uC728';

const parseForecastDate = (value: string): Date | null => {
  if (!value) {
    return null;
  }
  const normalized = value.includes('T') ? value : `${value}T00:00:00Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
};

const toMonthStartKey = (date: Date): MonthKey =>
  Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);

const formatMonthLabelKo = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}\uB144 ${month}\uC6D4`;
};

interface InventoryScope {
  warehouseCode: string | null;
  locationCode: string | null;
}

interface InventorySummary {
  onHand: number;
  reserved: number;
  available: number;
  entries: ProductInventoryEntry[];
}

const summarizeInventoryForScope = (row: Product, scope: InventoryScope): InventorySummary => {
  const baseEntries = Array.isArray(row.inventory) ? row.inventory : [];

  if (!scope.warehouseCode && !scope.locationCode) {
    return {
      onHand: row.onHand,
      reserved: row.reserved,
      available: availableStock(row),
      entries: baseEntries.map((entry) => ({ ...entry })),
    };
  }

  const filtered = baseEntries.filter((entry) => {
    if (scope.warehouseCode && entry.warehouseCode !== scope.warehouseCode) {
      return false;
    }
    if (scope.locationCode && entry.locationCode !== scope.locationCode) {
      return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    return { onHand: 0, reserved: 0, available: 0, entries: [] };
  }

  const onHand = filtered.reduce((sum, entry) => sum + Math.max(entry.onHand, 0), 0);
  const reserved = filtered.reduce((sum, entry) => sum + Math.max(entry.reserved, 0), 0);

  return {
    onHand,
    reserved,
    available: Math.max(onHand - reserved, 0),
    entries: filtered.map((entry) => ({ ...entry })),
  };
};

const matchesInventoryScope = (row: Product, scope: InventoryScope): boolean => {
  if (!scope.warehouseCode && !scope.locationCode) {
    return true;
  }

  return summarizeInventoryForScope(row, scope).entries.length > 0;
};

const RISK_ORDER: InventoryRisk[] = ['결품위험', '정상', '과잉'];

const riskPillPalette: Record<InventoryRisk, { active: string; outline: string }> = {
  결품위험: {
    active: 'bg-red-50 text-red-700 border-red-200',
    outline: 'border-red-200 text-red-600 hover:bg-red-50/40',
  },
  정상: {
    active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    outline: 'border-emerald-200 text-emerald-600 hover:bg-emerald-50/40',
  },
  과잉: {
    active: 'bg-amber-50 text-amber-700 border-amber-200',
    outline: 'border-amber-200 text-amber-600 hover:bg-amber-50/40',
  },
};

interface ProductsPageProps {
  skus: Product[];
  query: string;
  onQueryChange: (value: string) => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onEdit: (row: Product) => void;
  onDelete: (row: Product) => void;
  onNew: () => void;
  onCsvUpload: () => void;
  onCsvDownload: () => void;
  csvDownloading: boolean;
  csvStatus: CsvStatusMessage | null;
}

type ProductSortKey = 'name' | 'sku' | 'recent';
type ProductSortDirection = 'asc' | 'desc';

const SORT_OPTION_LABELS: Record<`${ProductSortKey}:${ProductSortDirection}`, string> = {
  'recent:desc': '최근 추가 순',
  'recent:asc': '오래된 순',
  'name:asc': '이름 오름차순',
  'name:desc': '이름 내림차순',
  'sku:asc': 'SKU 오름차순',
  'sku:desc': 'SKU 내림차순',
};

const ProductsPage: React.FC<ProductsPageProps> = ({
  skus,
  query,
  onQueryChange,
  loading,
  error,
  onRetry,
  onEdit,
  onDelete,
  onNew,
  onCsvUpload,
  onCsvDownload,
  csvDownloading,
  csvStatus,
}) => {
  const safeSkus = Array.isArray(skus) ? skus : [];
  const [sortKey, setSortKey] = useState<ProductSortKey>('recent');
  const [sortDirection, setSortDirection] = useState<ProductSortDirection>('desc');
  const [selectedSku, setSelectedSku] = useState<string | null>(null);

  const sortedSkus = useMemo(() => {
    const next = [...safeSkus];
    const baseCompare = (a: Product, b: Product): number => {
      switch (sortKey) {
        case 'name':
          return a.name.localeCompare(b.name, 'ko', { sensitivity: 'base' });
        case 'sku':
          return a.sku.localeCompare(b.sku, 'ko', { sensitivity: 'base' });
        case 'recent':
        default: {
          const legacyDiff = (a.legacyProductId ?? 0) - (b.legacyProductId ?? 0);
          if (legacyDiff !== 0) {
            return legacyDiff;
          }
          return a.productId.localeCompare(b.productId, 'ko', { sensitivity: 'base' });
        }
      }
    };

    next.sort((a, b) => {
      const result = baseCompare(a, b);
      return sortDirection === 'asc' ? result : -result;
    });

    return next;
  }, [safeSkus, sortDirection, sortKey]);

  useEffect(() => {
    if (!selectedSku) {
      return;
    }

    const exists = safeSkus.some((row) => row.sku === selectedSku);
    if (!exists) {
      setSelectedSku(null);
    }
  }, [safeSkus, selectedSku]);

  const selectedProduct = useMemo(
    () => safeSkus.find((row) => row.sku === selectedSku) ?? null,
    [safeSkus, selectedSku],
  );

  const { total, active, inactive, riskCounts, categories, grades } = useMemo(() => {
    const riskBase: Record<InventoryRisk, number> = { 정상: 0, 결품위험: 0, 과잉: 0 };
    let activeCount = 0;
    const categoryMap = new Map<string, number>();
    const gradeMap = new Map<string, number>();

    safeSkus.forEach((row) => {
      if (row.isActive) {
        activeCount += 1;
      }
      riskBase[row.risk] += 1;

      const categoryKey = row.category?.trim() || '미분류';
      categoryMap.set(categoryKey, (categoryMap.get(categoryKey) ?? 0) + 1);

      const subCategoryKey = row.subCategory?.trim();
      if (subCategoryKey) {
        const fullKey = `${categoryKey} · ${subCategoryKey}`;
        categoryMap.set(fullKey, (categoryMap.get(fullKey) ?? 0) + 1);
      }

      const gradeKey = `${row.abcGrade}${row.xyzGrade}`;
      gradeMap.set(gradeKey, (gradeMap.get(gradeKey) ?? 0) + 1);
    });

    const sortedCategories = Array.from(categoryMap.entries()).sort((a, b) => b[1] - a[1]);
    const sortedGrades = Array.from(gradeMap.entries()).sort((a, b) => b[1] - a[1]);

    return {
      total: safeSkus.length,
      active: activeCount,
      inactive: safeSkus.length - activeCount,
      riskCounts: riskBase,
      categories: sortedCategories,
      grades: sortedGrades,
    };
  }, [safeSkus]);

  const topCategories = categories.slice(0, 3);
  const topGrades = grades.slice(0, 3);
  const riskSummaryLine = useMemo(() => {
    if (total === 0) {
      return '등록된 품목이 없습니다.';
    }
    return RISK_ORDER.map((risk) => {
      const count = riskCounts[risk];
      const ratio = total > 0 ? Math.round((count / total) * 100) : 0;
      return `${risk} ${count.toLocaleString()}개 (${ratio}%)`;
    }).join(' · ');
  }, [riskCounts, total]);

  const topCategoryLine = useMemo(() => {
    if (topCategories.length === 0) {
      return null;
    }
    return topCategories
      .map(([category, count]) => `${category} (${count.toLocaleString()}개)`)
      .join(', ');
  }, [topCategories]);

  const topGradeLine = useMemo(() => {
    if (topGrades.length === 0) {
      return null;
    }
    return topGrades
      .map(([grade, count]) => `${grade} (${count.toLocaleString()}개)`)
      .join(', ');
  }, [topGrades]);

  const handleSearchChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      onQueryChange(event.target.value);
    },
    [onQueryChange],
  );

  return (
    <div className="p-6 space-y-6">
      <Card className="space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">품목 관리</h2>
            <p className="mt-1 text-sm text-slate-500">
              총 {total.toLocaleString()}개 품목 중 활성 {active.toLocaleString()}개 · 비활성 {inactive.toLocaleString()}개
            </p>
            <p className="mt-1 text-xs text-slate-500">{riskSummaryLine}</p>
            {topCategoryLine && (
              <p className="mt-1 text-xs text-slate-500">주요 카테고리: {topCategoryLine}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-100"
              onClick={onCsvDownload}
              disabled={csvDownloading}
            >
              {csvDownloading ? 'CSV 다운로드 중...' : 'CSV 템플릿' }
            </button>
            <button
              type="button"
              className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-600 transition hover:bg-indigo-100"
              onClick={onCsvUpload}
            >
              CSV 업로드
            </button>
            <button
              type="button"
              className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-500"
              onClick={onNew}
            >
              신규 품목
            </button>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <span>정렬</span>
              <select
                className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-600 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                value={`${sortKey}:${sortDirection}`}
                onChange={(event) => {
                  const [nextKey, nextDirection] = event.target.value.split(':') as [
                    ProductSortKey,
                    ProductSortDirection,
                  ];
                  setSortKey(nextKey);
                  setSortDirection(nextDirection);
                }}
              >
                {Object.entries(SORT_OPTION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="sm:w-72">
            <label htmlFor="product-search" className="sr-only">
              SKU, 품명, 카테고리 검색
            </label>
            <input
              id="product-search"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="SKU, 품명, 카테고리 검색"
              value={query}
              onChange={handleSearchChange}
            />
          </div>
          <div className="text-xs text-slate-500">
            상위 등급: {topGradeLine ?? '데이터 없음'}
          </div>
        </div>

        {csvStatus && (
          <div
            className={`rounded-xl border px-3 py-2 text-xs ${
              csvStatus.kind === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-rose-200 bg-rose-50 text-rose-600'
            }`}
          >
            {csvStatus.message}
          </div>
        )}

        {error && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-600">
            <span>{error}</span>
            <button
              type="button"
              className="rounded-full border border-rose-200 px-2 py-0.5 text-[11px] font-medium text-rose-600 transition hover:border-rose-300 hover:bg-rose-100"
              onClick={onRetry}
            >
              다시 시도
            </button>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <h3 className="text-lg font-semibold text-slate-900">품목 목록</h3>
            <div className="text-xs text-slate-500">
              {loading ? '품목을 불러오는 중입니다…' : `총 ${safeSkus.length.toLocaleString()}개 품목 표시 중`}
            </div>
          </div>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
            <div className="overflow-hidden rounded-2xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2">제품명</th>
                    <th className="px-3 py-2">SKU</th>
                    <th className="px-3 py-2">카테고리</th>
                    <th className="px-3 py-2">하위카테고리</th>
                    <th className="px-3 py-2 text-right">총수량</th>
                    <th className="px-3 py-2 text-right">작업</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500">
                        품목을 불러오는 중입니다...
                      </td>
                    </tr>
                  ) : safeSkus.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-500">
                        조건에 맞는 품목이 없습니다.
                      </td>
                    </tr>
                  ) : (
                    sortedSkus.map((row) => {
                    const isSelected = selectedSku === row.sku;
                    return (
                      <tr
                        key={row.sku}
                        data-testid="product-row"
                        data-product-name={row.name}
                        className={`border-b border-slate-100 last:border-transparent ${
                          isSelected ? 'bg-indigo-50/60' : 'hover:bg-slate-50'
                        } cursor-pointer transition`}
                        onClick={() => setSelectedSku(row.sku)}
                      >
                        <td className="px-3 py-3 align-top">
                          <div className="font-semibold text-slate-900">{row.name}</div>
                          {row.brand && (
                            <div className="mt-1 text-xs text-slate-500">{row.brand}</div>
                          )}
                        </td>
                        <td className="px-3 py-3 align-top">
                          <div className="font-mono text-xs text-slate-600">{row.sku}</div>
                        </td>
                        <td className="px-3 py-3 align-top">
                          <div className="text-sm text-slate-800">{row.category || '미분류'}</div>
                        </td>
                        <td className="px-3 py-3 align-top">
                          <div className="text-sm text-slate-800">{row.subCategory || '세부 없음'}</div>
                        </td>
                        <td className="px-3 py-3 align-top text-right">
                          <div className="font-semibold text-slate-900">
                            {row.onHand.toLocaleString()} {row.unit || DEFAULT_UNIT}
                          </div>
                        </td>
                        <td className="px-3 py-3 align-top">
                          <div className="flex justify-end gap-1 text-xs">
                            <button
                              type="button"
                              className="rounded-lg border border-slate-200 px-2 py-1 text-slate-600 hover:border-slate-300 hover:text-slate-900"
                              onClick={(event) => {
                                event.stopPropagation();
                                onEdit(row);
                              }}
                            >
                              수정
                            </button>
                            <button
                              type="button"
                              className="rounded-lg border border-rose-200 px-2 py-1 text-rose-600 hover:border-rose-300 hover:text-rose-700"
                              onClick={(event) => {
                                event.stopPropagation();
                                onDelete(row);
                              }}
                            >
                              삭제
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="min-h-[24rem]">
            <ProductDetailPanel product={selectedProduct} />
          </div>
        </div>
        </div>
      </Card>
    </div>
  );
};

const POLICY_DEFAULT_SERVICE_LEVEL = 95;
const POLICY_DEFAULT_LEAD_TIME_DAYS = 14;
const MIN_POLICY_HISTORY_MONTHS = 3;

const sanitizePolicyInteger = (value: number | null | undefined): number | null => {
  if (!Number.isFinite(value as number)) {
    return null;
  }
  const normalized = Math.max(Math.round(value as number), 0);
  return Number.isFinite(normalized) ? normalized : null;
};

const getDaysInMonthFromIso = (value: string): number => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return 30;
  }
  const year = Number.parseInt(match[1], 10);
  const monthIndex = Number.parseInt(match[2], 10) - 1;
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex)) {
    return 30;
  }
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return Number.isFinite(lastDay) && lastDay > 0 ? lastDay : 30;
};

const derivePolicyMetricsFromForecast = (
  forecast: ForecastResponse,
): { forecastDemand: number | null; demandStdDev: number | null; leadTimeDays: number | null } | null => {
  const historyPoints = forecast.timeline.filter(
    (point) => point.phase === 'history' && Number.isFinite(point.actual ?? Number.NaN),
  );

  if (historyPoints.length < MIN_POLICY_HISTORY_MONTHS) {
    return null;
  }

  const recentHistory = historyPoints.slice(-Math.max(MIN_POLICY_HISTORY_MONTHS, 1));
  const dailyValues = recentHistory
    .map((point) => {
      if (typeof point.actual !== 'number') {
        return null;
      }
      const daysInMonth = getDaysInMonthFromIso(point.date);
      if (daysInMonth <= 0) {
        return null;
      }
      return point.actual / daysInMonth;
    })
    .filter((value): value is number => value !== null && Number.isFinite(value));

  if (dailyValues.length < MIN_POLICY_HISTORY_MONTHS) {
    return null;
  }

  const mean = dailyValues.reduce((sum, value) => sum + value, 0) / dailyValues.length;
  const variance = dailyValues.reduce((sum, value) => sum + (value - mean) ** 2, 0) / dailyValues.length;
  const stdDev = Math.sqrt(Math.max(variance, 0));

  const leadTimeDays = Number.isFinite(forecast.product.leadTimeDays)
    ? Math.max(Math.round(forecast.product.leadTimeDays), 0)
    : null;

  return {
    forecastDemand: Math.max(Math.round(mean), 0),
    demandStdDev: Math.max(Math.round(stdDev), 0),
    leadTimeDays,
  };
};

interface CreatePolicyOptions {
  forecast?: ForecastResponse | null;
  serviceLevelPercent?: number | null;
}

const createPolicyFromProduct = (product: Product, options: CreatePolicyOptions = {}): PolicyRow => {
  const fallbackDemand = sanitizePolicyInteger(product.dailyAvg);
  const fallbackStdDev = sanitizePolicyInteger(product.dailyStd);
  const fallbackLeadTime = sanitizePolicyInteger(POLICY_DEFAULT_LEAD_TIME_DAYS);

  const derived = options.forecast ? derivePolicyMetricsFromForecast(options.forecast) : null;

  const forecastDemand = sanitizePolicyInteger(
    (derived && derived.forecastDemand !== null ? derived.forecastDemand : null) ?? fallbackDemand ?? null,
  );
  const demandStdDev = sanitizePolicyInteger(
    (derived && derived.demandStdDev !== null ? derived.demandStdDev : null) ?? fallbackStdDev ?? null,
  );
  const leadTimeDays = sanitizePolicyInteger(
    (derived && derived.leadTimeDays !== null ? derived.leadTimeDays : null) ?? fallbackLeadTime ?? null,
  );

  const serviceLevelPercent =
    typeof options.serviceLevelPercent === 'number' && Number.isFinite(options.serviceLevelPercent)
      ? options.serviceLevelPercent
      : POLICY_DEFAULT_SERVICE_LEVEL;

  return {
    sku: product.sku,
    forecastDemand,
    demandStdDev,
    leadTimeDays,
    serviceLevelPercent,
  };
};

interface PoliciesPageProps {
  skus: Product[];
  policyRows: PolicyRow[];
  setPolicyRows: React.Dispatch<React.SetStateAction<PolicyRow[]>>;
  forecastCache: Record<string, ForecastResponse>;
}

interface PolicyCreateDialogProps {
  open: boolean;
  products: Product[];
  existingSkus: ReadonlySet<string>;
  onClose: () => void;
  onSubmit: (product: Product) => void;
}

const PolicyCreateDialog: React.FC<PolicyCreateDialogProps> = ({
  open,
  products,
  existingSkus,
  onClose,
  onSubmit,
}) => {
  const [keyword, setKeyword] = useState('');
  const [candidateSku, setCandidateSku] = useState('');

  const availableProducts = useMemo(() => {
    const term = keyword.trim().toLowerCase();

    return products
      .filter((product) => !existingSkus.has(product.sku))
      .filter((product) => {
        if (!term) {
          return true;
        }

        const name = product.name?.toLowerCase() ?? '';
        return product.sku.toLowerCase().includes(term) || name.includes(term);
      });
  }, [existingSkus, keyword, products]);

  useEffect(() => {
    if (!open) {
      setKeyword('');
      setCandidateSku('');
      return;
    }

    setCandidateSku((prev) => {
      if (prev && availableProducts.some((product) => product.sku === prev)) {
        return prev;
      }
      return availableProducts[0]?.sku ?? '';
    });
  }, [availableProducts, open]);

  const handleSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!candidateSku) {
        return;
      }

      const product = availableProducts.find((item) => item.sku === candidateSku);
      if (!product) {
        return;
      }

      onSubmit(product);
      onClose();
    },
    [availableProducts, candidateSku, onClose, onSubmit],
  );

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 px-4 py-8">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">정책 추가</h3>
            <p className="mt-1 text-sm text-slate-500">정책을 적용할 SKU를 선택하세요.</p>
          </div>
          <button
            type="button"
            className="rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            onClick={onClose}
            aria-label="정책 추가 닫기"
          >
            <span aria-hidden>×</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="policy-add-search" className="text-sm font-medium text-slate-700">
              검색어
            </label>
            <input
              id="policy-add-search"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              placeholder="SKU 또는 품명을 입력하세요"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </div>

          <div>
            <label htmlFor="policy-add-sku" className="text-sm font-medium text-slate-700">
              SKU 선택
            </label>
            {availableProducts.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">추가 가능한 SKU가 없습니다.</p>
            ) : (
              <select
                id="policy-add-sku"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                value={candidateSku}
                onChange={(event) => setCandidateSku(event.target.value)}
              >
                {availableProducts.map((product) => (
                  <option key={product.sku} value={product.sku}>
                    {product.sku} · {product.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
              onClick={onClose}
            >
              취소
            </button>
            <button
              type="submit"
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
              disabled={!candidateSku || availableProducts.length === 0}
            >
              추가
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface PolicyEditDialogProps {
  open: boolean;
  sku: string;
  productName?: string;
  value: {
    forecastDemand: number | null;
    demandStdDev: number | null;
    leadTimeDays: number | null;
    serviceLevelPercent: number | null;
  };
  onClose: () => void;
  onSubmit: (next: {
    forecastDemand: number | null;
    demandStdDev: number | null;
    leadTimeDays: number | null;
    serviceLevelPercent: number | null;
  }) => void;
}

const PolicyEditDialog: React.FC<PolicyEditDialogProps> = ({ open, sku, productName, value, onClose, onSubmit }) => {
  const [demand, setDemand] = useState<string>(value.forecastDemand?.toString() ?? '');
  const [std, setStd] = useState<string>(value.demandStdDev?.toString() ?? '');
  const [lead, setLead] = useState<string>(value.leadTimeDays?.toString() ?? '');
  const [service, setService] = useState<string>(value.serviceLevelPercent?.toString() ?? '');

  useEffect(() => {
    if (!open) {
      return;
    }
    setDemand(value.forecastDemand?.toString() ?? '');
    setStd(value.demandStdDev?.toString() ?? '');
    setLead(value.leadTimeDays?.toString() ?? '');
    setService(value.serviceLevelPercent?.toString() ?? '');
  }, [open, value.forecastDemand, value.demandStdDev, value.leadTimeDays, value.serviceLevelPercent]);

  const toNonNegativeInt = (text: string): number | null => {
    const t = (text ?? '').trim();
    if (!t) return null;
    const n = Number.parseFloat(t);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, Math.round(n));
  };

  const toServicePercent = (text: string): number | null => {
    const t = (text ?? '').trim();
    if (!t) return null;
    const n = Number.parseFloat(t);
    if (!Number.isFinite(n)) return null;
    return Math.max(50, Math.min(99.9, Math.round(n * 10) / 10));
  };

  const zValue = useMemo(() => {
    const p = toServicePercent(service);
    return Number.isFinite(p as number) ? serviceLevelPercentageToZ(p as number) : null;
  }, [service]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl ring-1 ring-slate-200">
        <div className="mb-3">
          <h3 className="text-lg font-semibold text-slate-900">정책 수정</h3>
          <p className="mt-1 text-sm text-slate-500">
            {productName ?? sku} <span className="font-mono text-xs text-slate-400">({sku})</span>
          </p>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit({
              forecastDemand: toNonNegativeInt(demand),
              demandStdDev: toNonNegativeInt(std),
              leadTimeDays: toNonNegativeInt(lead),
              serviceLevelPercent: toServicePercent(service),
            });
          }}
          className="space-y-3"
        >
          <div>
            <label className="text-sm font-medium text-slate-700">예측 수요량 (EA/일)</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              inputMode="numeric"
              value={demand}
              onChange={(e) => setDemand(e.target.value)}
              placeholder="예: 320"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">수요 표준편차 (σ)</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              inputMode="numeric"
              value={std}
              onChange={(e) => setStd(e.target.value)}
              placeholder="예: 48"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">리드타임 (L, 일)</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              inputMode="numeric"
              value={lead}
              onChange={(e) => setLead(e.target.value)}
              placeholder="예: 10"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-slate-700">서비스 수준 (%)</label>
            <div className="mt-1 flex items-center gap-2">
              <select
                className="w-36 rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                value={service}
                onChange={(e) => setService(e.target.value)}
              >
                {service === '' && <option value="">선택</option>}
                {SERVICE_LEVEL_PRESETS.map((preset) => (
                  <option key={preset} value={preset.toString()}>
                    {Number.isInteger(preset) ? preset.toFixed(0) : preset.toFixed(1)}%
                  </option>
                ))}
              </select>
              <div className="text-xs text-slate-500">{zValue !== null ? `Z ≈ ${zValue.toFixed(2)}` : 'Z -'}</div>
            </div>
          </div>

          <div className="pt-2 text-right">
            <button
              type="button"
              className="mr-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:border-slate-300 hover:text-slate-900"
              onClick={onClose}
            >
              취소
            </button>
            <button
              type="submit"
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500"
            >
              저장
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const PoliciesPage: React.FC<PoliciesPageProps> = ({ skus, policyRows, setPolicyRows, forecastCache }) => {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const manualOverrideRef = useRef<Set<string>>(new Set());
  const [editOpen, setEditOpen] = useState(false);
  const [editSku, setEditSku] = useState<string | null>(null);

  const markManualOverride = useCallback((sku: string) => {
    manualOverrideRef.current.add(sku);
  }, []);

  const productBySku = useMemo(() => {
    const map = new Map<string, Product>();
    skus.forEach((row) => {
      map.set(row.sku, row);
    });
    return map;
  }, [skus]);

  const existingSkuSet = useMemo(() => new Set(policyRows.map((row) => row.sku)), [policyRows]);
  const canAddPolicy = useMemo(
    () => skus.some((product) => !existingSkuSet.has(product.sku)),
    [existingSkuSet, skus],
  );

  const filteredRows = useMemo(() => {
    const registeredRows = policyRows.filter((row) => productBySku.has(row.sku));
    const term = search.trim().toLowerCase();
    if (!term) {
      return registeredRows;
    }
    return registeredRows.filter((row) => {
      const product = productBySku.get(row.sku);
      const name = product?.name?.toLowerCase() ?? '';
      return row.sku.toLowerCase().includes(term) || name.includes(term);
    });
  }, [policyRows, productBySku, search]);

  useEffect(() => {
    if (!forecastCache || Object.keys(forecastCache).length === 0) {
      return;
    }

    setPolicyRows((prev) => {
      let changed = false;
      const next = prev.map((row) => {
        if (manualOverrideRef.current.has(row.sku)) {
          return row;
        }

        const product = productBySku.get(row.sku);
        if (!product) {
          return row;
        }

        const forecast = forecastCache[row.sku];
        if (!forecast) {
          return row;
        }

        const draft = createPolicyFromProduct(product, {
          forecast,
          serviceLevelPercent: row.serviceLevelPercent,
        });

        const merged: PolicyRow = {
          ...row,
          forecastDemand: draft.forecastDemand ?? row.forecastDemand,
          demandStdDev: draft.demandStdDev ?? row.demandStdDev,
          leadTimeDays: draft.leadTimeDays ?? row.leadTimeDays,
        };

        if (
          merged.forecastDemand !== row.forecastDemand ||
          merged.demandStdDev !== row.demandStdDev ||
          merged.leadTimeDays !== row.leadTimeDays
        ) {
          changed = true;
        }

        return merged;
      });

      return changed ? next : prev;
    });
  }, [forecastCache, productBySku, setPolicyRows]);

  const formatNumber = useCallback((value: number | null | undefined, fractionDigits = 0): string => {
    if (value === null || value === undefined || !Number.isFinite(value)) {
      return '-';
    }
    return value.toLocaleString(undefined, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
  }, []);

  const handleServiceLevelChange = useCallback(
    (sku: string, nextValue: string) => {
      const parsed = Number.parseFloat(nextValue);
      if (!Number.isFinite(parsed)) {
        return;
      }

      setPolicyRows((prev) =>
        prev.map((row) => (row.sku === sku ? { ...row, serviceLevelPercent: parsed } : row)),
      );
      markManualOverride(sku);
    },
    [markManualOverride, setPolicyRows],
  );

  const handleEditPolicy = useCallback(
    (sku: string) => {
      const targetRow = policyRows.find((row) => row.sku === sku);
      if (!targetRow) {
        setStatus({ type: 'error', text: '선택한 SKU 정책이 존재하지 않습니다.' });
        return;
      }
      setEditSku(sku);
      setEditOpen(true);
    },
    [policyRows, setStatus],
  );

  const openAddPolicyDialog = useCallback(() => {
    setStatus(null);
    setAddDialogOpen(true);
  }, []);

  const closeAddPolicyDialog = useCallback(() => {
    setAddDialogOpen(false);
  }, []);

  const handlePolicyCreate = useCallback(
    (product: Product) => {
      setPolicyRows((prev) => {
        if (prev.some((row) => row.sku === product.sku)) {
          return prev;
        }

        const existingTemplate = INITIAL_POLICIES.find((row) => row.sku === product.sku);
        const draft = existingTemplate
          ? { ...existingTemplate }
          : createPolicyFromProduct(product, { forecast: forecastCache[product.sku] });

        const next = [...prev, draft];
        next.sort((a, b) => a.sku.localeCompare(b.sku));
        return next;
      });

      manualOverrideRef.current.delete(product.sku);
      setStatus({ type: 'success', text: `${product.sku} 정책을 추가했습니다.` });
    },
    [forecastCache, setPolicyRows, setStatus],
  );

  const handleSavePolicies = useCallback(async () => {
    if (saving) {
      return;
    }

    setSaving(true);
    setStatus(null);

    try {
      await savePolicies(policyRows);
      setStatus({ type: 'success', text: '정책을 저장했습니다.' });
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : '정책 저장에 실패했습니다. 다시 시도해 주세요.';
      setStatus({ type: 'error', text: message });
    } finally {
      setSaving(false);
    }
  }, [policyRows, saving]);

  return (
    <div className="space-y-6 p-6">
      <Card>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">예측기준 정책</h2>
            <p className="mt-1 text-sm text-slate-500">
              총 {policyRows.length.toLocaleString()}개 SKU 정책을 관리합니다.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:w-96">
            <div className="flex gap-2">
              <div className="flex-1">
                <label htmlFor="policy-search" className="sr-only">
                  SKU 또는 품명 검색
                </label>
                <input
                  id="policy-search"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="SKU, 품명, 사유 검색"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <button
                type="button"
                className="rounded-xl bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                onClick={openAddPolicyDialog}
                disabled={!canAddPolicy}
              >
                + 정책 추가
              </button>
            </div>
          </div>
        </div>

        {status && (
          <div
            className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
              status.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-rose-200 bg-rose-50 text-rose-700'
            }`}
          >
            {status.text}
          </div>
        )}

        <div className="mt-6 overflow-auto rounded-2xl border border-slate-200">
          <table className="min-w-full text-sm" aria-label="정책 목록">
            <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">품명</th>
                <th className="px-3 py-2">SKU</th>
                <th className="px-3 py-2 text-right">예측 수요량 (EA/일)</th>
                <th className="px-3 py-2 text-right">수요 표준편차 (σ)</th>
                <th className="px-3 py-2 text-right">리드타임 (L, 일)</th>
                <th className="px-3 py-2 text-right">서비스 수준 (%)</th>
                <th className="px-3 py-2 text-right">수정</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    조건에 맞는 정책이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const product = productBySku.get(row.sku);

                  return (
                    <tr key={row.sku} className="border-b border-slate-100 last:border-transparent">
                      <td className="px-3 py-3 align-top">
                        <div className="font-semibold text-slate-900">{product?.name ?? '미등록 품목'}</div>
                        <div className="text-[11px] text-slate-500">
                          {product?.category ?? '카테고리 없음'} · {product?.subCategory ?? '세부 없음'}
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top font-mono text-xs text-slate-500">{row.sku}</td>
                      <td className="px-3 py-3 align-top text-right">{formatNumber(row.forecastDemand)}</td>
                      <td className="px-3 py-3 align-top text-right">{formatNumber(row.demandStdDev)}</td>
                      <td className="px-3 py-3 align-top text-right">{formatNumber(row.leadTimeDays)}</td>
                      <td className="px-3 py-3 align-top text-right">
                        <div className="flex items-center justify-end gap-2">
                          <label htmlFor={`service-level-${row.sku}`} className="sr-only">
                            {row.sku} 서비스 수준
                          </label>
                          <select
                            id={`service-level-${row.sku}`}
                            aria-label={`${row.sku} 서비스 수준`}
                            className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                            value={
                              row.serviceLevelPercent != null ? row.serviceLevelPercent.toString() : ''
                            }
                            onChange={(event) => handleServiceLevelChange(row.sku, event.target.value)}
                          >
                            {row.serviceLevelPercent == null && <option value="">선택</option>}
                            {SERVICE_LEVEL_PRESETS.map((preset) => (
                              <option key={preset} value={preset.toString()}>
                                {Number.isInteger(preset) ? preset.toFixed(0) : preset.toFixed(1)}%
                              </option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top text-right">
                        <button
                          type="button"
                          className="inline-flex items-center justify-center rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                          onClick={() => handleEditPolicy(row.sku)}
                        >
                          수정
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="mt-6 flex justify-end border-t border-slate-100 pt-4">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-300"
            onClick={handleSavePolicies}
            disabled={saving}
          >
            {saving ? '저장 중...' : '정책 저장'}
          </button>
        </div>
      </Card>
      <PolicyCreateDialog
        open={addDialogOpen}
        onClose={closeAddPolicyDialog}
        products={skus}
        existingSkus={existingSkuSet}
        onSubmit={handlePolicyCreate}
      />
      {editOpen && editSku && (
        <PolicyEditDialog
          open={editOpen}
          sku={editSku}
          productName={productBySku.get(editSku)?.name}
          value={(() => {
            const row = policyRows.find((r) => r.sku === editSku)!;
            return {
              forecastDemand: row.forecastDemand ?? null,
              demandStdDev: row.demandStdDev ?? null,
              leadTimeDays: row.leadTimeDays ?? null,
              serviceLevelPercent: row.serviceLevelPercent ?? null,
            };
          })()}
          onClose={() => {
            setEditOpen(false);
            setEditSku(null);
          }}
          onSubmit={(next) => {
            if (!editSku) return;
            setPolicyRows((prev) =>
              prev.map((row) =>
                row.sku === editSku
                  ? {
                      ...row,
                      forecastDemand: next.forecastDemand,
                      demandStdDev: next.demandStdDev,
                      leadTimeDays: next.leadTimeDays,
                      serviceLevelPercent: next.serviceLevelPercent ?? row.serviceLevelPercent,
                    }
                  : row,
              ),
            );
            markManualOverride(editSku);
            setStatus({ type: 'success', text: `${editSku} 정책을 수정했습니다.` });
            setEditOpen(false);
            setEditSku(null);
          }}
        />
      )}
    </div>
  );
};

const DeepflowDashboard: React.FC = () => {
  const [active, setActive] = useState<
    | 'inventory'
    | 'forecast'
    | 'products'
    | 'policies'
    | 'warehouses'
    | 'partners'
    | 'categories'
  >('inventory');
  const mountedRef = useRef(true);
  const [warehousePanelRefreshToken, setWarehousePanelRefreshToken] = useState(0);
  const requestWarehousePanelReload = useCallback(
    () => setWarehousePanelRefreshToken((value) => value + 1),
    [],
  );
  const [skus, setSkus] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const selectedRef = useRef<Product | null>(null);
  const [promoExclude, setPromoExclude] = useState(true);
  const [policyRows, setPolicyRows] = useState<PolicyRow[]>(INITIAL_POLICIES);
  const [forecastState, setForecastState] = useState<Record<number, ForecastStateEntry>>({});
  const [productDrawer, setProductDrawer] = useState<ProductDrawerState | null>(null);
  const [productQuery, setProductQuery] = useState('');
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [productActionError, setProductActionError] = useState<string | null>(null);
  const [productsVersion, setProductsVersion] = useState(0);
  const [productSaving, setProductSaving] = useState(false);
  const [productDeleting, setProductDeleting] = useState(false);
  const [csvDialogOpen, setCsvDialogOpen] = useState(false);
  const [csvDownloadPending, setCsvDownloadPending] = useState(false);
  const [csvStatus, setCsvStatus] = useState<CsvStatusMessage | null>(null);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const triggerProductsReload = useCallback(() => {
    setProductsError(null);
    setProductsVersion((value) => value + 1);
  }, [setProductsError]);

  const refreshSelectedProduct = useCallback(
    async (sku: string) => {
      try {
        const items = await ProductService.fetchProducts(sku);
        if (!mountedRef.current) {
          return;
        }
        const updated = items.find((item) => item.sku === sku) ?? null;
        if (updated) {
          setSelected((prev) => (prev && prev.sku === sku ? updated : prev));
        }
      } catch (error) {
        // 선택된 품목 새로고침 실패는 무시 (목록 새로고침으로 복구됨)
      }
    },
    [setSelected],
  );

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    const unsubscribe = subscribeInventoryRefresh((event) => {
      triggerProductsReload();

      const current = selectedRef.current;
      if (!current?.sku) {
        return;
      }

      const movements = event.detail?.movements ?? [];
      if (movements.length === 0) {
        void refreshSelectedProduct(current.sku);
        return;
      }

      const shouldRefresh = movements.some((movement) => {
        if (movement.product?.sku && movement.product.sku === current.sku) {
          return true;
        }
        if (
          typeof movement.productId === 'number' &&
          Number.isFinite(current.legacyProductId) &&
          movement.productId === current.legacyProductId
        ) {
          return true;
        }
        return false;
      });

      if (shouldRefresh) {
        void refreshSelectedProduct(current.sku);
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [refreshSelectedProduct, triggerProductsReload]);

  const handleCsvUploadOpen = useCallback(() => {
    setCsvStatus(null);
    setCsvDialogOpen(true);
  }, []);

  const handleCsvDialogClose = useCallback(() => {
    setCsvDialogOpen(false);
  }, []);

  const handleCsvDownload = useCallback(async () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') {
      setCsvStatus({ kind: 'error', message: '브라우저 환경에서만 다운로드를 지원합니다.' });
      return;
    }
    setCsvDownloadPending(true);
    setCsvStatus(null);
    try {
      const blob = await downloadTemplate('products');
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'products-template.csv';
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setCsvStatus({ kind: 'success', message: 'CSV 템플릿을 다운로드했습니다.' });
    } catch (error) {
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'CSV 템플릿을 다운로드하지 못했습니다.';
      setCsvStatus({ kind: 'error', message });
    } finally {
      setCsvDownloadPending(false);
    }
  }, []);

  const handleCsvCompleted = useCallback(() => {
    triggerProductsReload();
    setCsvStatus({ kind: 'success', message: 'CSV 업로드 작업이 완료되어 목록을 갱신했습니다.' });
  }, [triggerProductsReload]);

  const forecastProductIds = useMemo(() => {
    const ids = new Set<number>();
    skus.forEach((row) => {
      if (Number.isFinite(row.legacyProductId) && row.legacyProductId > 0) {
        ids.add(row.legacyProductId);
      }
    });
    return Array.from(ids).sort((a, b) => a - b);
  }, [skus]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setProductsLoading(true);
      try {
        const items = await ProductService.fetchProducts(productQuery);
        if (cancelled) {
          return;
        }
        setSkus(items);
        setProductsError(null);
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message =
          error instanceof Error && error.message
            ? error.message
            : '품목 목록을 불러오지 못했습니다.';
        setProductsError(message);
        setSkus([]);
      } finally {
        if (!cancelled) {
          setProductsLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [productQuery, productsVersion]);

  useEffect(() => {
    if (!selected && skus.length > 0) {
      setSelected(skus[0]);
      return;
    }

    if (selected) {
      const updated = skus.find((item) => item.sku === selected.sku);
      if (!updated && skus.length > 0) {
        setSelected(skus[0]);
      } else if (updated && updated !== selected) {
        setSelected(updated);
      }
    }
  }, [skus, selected]);

  useEffect(() => {
    const pending = forecastProductIds.filter((id) => id > 0 && !forecastState[id]);
    if (pending.length === 0) {
      return;
    }

    let cancelled = false;

    setForecastState((prev) => {
      const next = { ...prev };
      pending.forEach((id) => {
        if (!next[id]) {
          next[id] = { status: 'loading' };
        }
      });
      return next;
    });

    const run = async () => {
      const results = await Promise.all(
        pending.map(async (productId) => {
          try {
            const data = await fetchForecast(productId);
            return { productId, data } as const;
          } catch (error) {
            const message =
              error instanceof Error && error.message
                ? error.message
                : '수요예측을 불러오지 못했습니다.';
            return { productId, error: message } as const;
          }
        }),
      );

      if (cancelled) {
        return;
      }

      setForecastState((prev) => {
        const next = { ...prev };
        results.forEach((result) => {
          if ('data' in result && result.data) {
            next[result.productId] = { status: 'ready', data: result.data };
          } else if ('error' in result && result.error) {
            next[result.productId] = { status: 'error', error: result.error };
          }
        });
        return next;
      });
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [forecastProductIds, forecastState]);

  const kpis = useMemo<KpiSummary>(() => {
    if (skus.length === 0) {
      return { opening: 0, avgDOS: 0, turns: 8.4, serviceLevel: 0.95 };
    }

    const opening = skus.reduce((sum, item) => sum + item.onHand, 0);
    const etaSummary = skus.reduce(
      (acc, item) => {
        const eta = calculateEtaDays(item);
        if (eta !== null) {
          acc.sum += eta;
          acc.count += 1;
        }
        return acc;
      },
      { sum: 0, count: 0 },
    );
    const avgDOS = etaSummary.count > 0 ? Math.round(etaSummary.sum / etaSummary.count) : 0;
    const serviceLevel = calculateServiceLevelPercent(skus) / 100;

    return {
      opening,
      avgDOS,
      turns: 8.4,
      serviceLevel,
    };
  }, [skus]);

  const riskSummary = useMemo<RiskSummaryEntry[]>(() => {
    const totals: Record<InventoryRisk, number> = { 정상: 0, 결품위험: 0, 과잉: 0 };
    skus.forEach((row) => {
      totals[row.risk] += 1;
    });
    const totalSkus = skus.length;
    return RISK_ORDER.map((risk) => ({
      risk,
      count: totals[risk],
      ratio: totalSkus > 0 ? Math.round((totals[risk] / totalSkus) * 100) : 0,
    }));
  }, [skus]);

  const forecastCache = useMemo<Record<string, ForecastResponse>>(() => {
    const map: Record<string, ForecastResponse> = {};
    (Object.values(forecastState) as ForecastStateEntry[]).forEach((entry) => {
      if (entry?.status === 'ready' && entry.data) {
        map[entry.data.product.sku] = entry.data;
      }
    });
    return map;
  }, [forecastState]);

  const forecastStatusBySku = useMemo<Record<string, ForecastStateEntry>>(() => {
    const map: Record<string, ForecastStateEntry> = {};
    skus.forEach((row) => {
      if (row.legacyProductId > 0) {
        map[row.sku] = forecastState[row.legacyProductId] ?? { status: 'idle' };
      } else {
        map[row.sku] = { status: 'idle' };
      }
    });
    return map;
  }, [forecastState, skus]);

  const openProduct = useCallback(
    (row: Product, mode: DrawerMode = 'edit') => {
      setProductActionError(null);
      setProductDrawer({ mode, row: { ...row }, originalSku: mode === 'edit' ? row.sku : undefined });
    },
    [setProductActionError],
  );

  const closeProduct = useCallback(() => {
    setProductActionError(null);
    setProductDrawer(null);
  }, [setProductActionError]);

  const handleProductDelete = useCallback(
    async (row: Product) => {
      if (!row?.sku) {
        return;
      }

      if (typeof window !== 'undefined') {
        const confirmed = window.confirm(`'${row.name || row.sku}' 품목을 삭제하시겠습니까?`);
        if (!confirmed) {
          return;
        }
      }

      try {
        await ProductService.deleteProduct(row.sku);
        setSkus((prev) => prev.filter((item) => item.sku !== row.sku));
        setPolicyRows((prev) => prev.filter((item) => item.sku !== row.sku));
        setSelected((prev) => (prev && prev.sku === row.sku ? null : prev));
        setForecastState((prev) => {
          if (!row.legacyProductId || !(row.legacyProductId in prev)) {
            return prev;
          }
          const next = { ...prev };
          delete next[row.legacyProductId];
          return next;
        });
        setProductDrawer((current) => {
          if (!current) {
            return current;
          }
          const targetSku = current.originalSku ?? current.row.sku;
          if (targetSku === row.sku) {
            return null;
          }
          return current;
        });
        triggerProductsReload();
      } catch (error) {
        const message =
          error instanceof Error && error.message ? error.message : '품목 삭제에 실패했습니다.';
        setProductsError(message);
      }
    },
    [
      setSkus,
      setPolicyRows,
      setSelected,
      setForecastState,
      setProductDrawer,
      triggerProductsReload,
      setProductsError,
    ],
  );

  const saveProduct = useCallback(async () => {
    if (!productDrawer || productSaving) {
      return;
    }

    const { row, mode, originalSku } = productDrawer;
    if (!row.sku.trim() || !row.name.trim()) {
      setProductActionError('SKU와 품명은 비워둘 수 없습니다.');
      return;
    }

    const validationError = validateProductDraft(row);
    if (validationError) {
      setProductActionError(validationError);
      return;
    }

    const normalizedSku = row.sku.trim();
    const duplicateSkuExists = skus.some(
      (item) => item.sku === normalizedSku && (mode === 'new' || item.sku !== originalSku),
    );
    if (duplicateSkuExists) {
      setProductActionError('이미 존재하는 SKU입니다. 다른 값을 사용해 주세요.');
      return;
    }

    const normalized = normalizeProduct(row);
    setProductSaving(true);
    setProductActionError(null);
    try {
      const saved =
        mode === 'new'
          ? await ProductService.createProduct(normalized)
          : await ProductService.updateProduct(originalSku ?? row.sku, normalized);

      setPolicyRows((prev) => {
        const targetSku = originalSku ?? row.sku;
        const index = prev.findIndex((item) => item.sku === targetSku);
        if (index >= 0) {
          const next = [...prev];
          const draft = createPolicyFromProduct(saved, {
            forecast: forecastCache[saved.sku],
            serviceLevelPercent: next[index].serviceLevelPercent,
          });
          next[index] = {
            ...next[index],
            sku: saved.sku,
            forecastDemand: draft.forecastDemand ?? next[index].forecastDemand,
            demandStdDev: draft.demandStdDev ?? next[index].demandStdDev,
            leadTimeDays: draft.leadTimeDays ?? next[index].leadTimeDays,
          };
          return next;
        }

        const draft = createPolicyFromProduct(saved, { forecast: forecastCache[saved.sku] });
        const next = [...prev, draft];
        next.sort((a, b) => a.sku.localeCompare(b.sku));
        return next;
      });

      setSelected(saved);
      setProductActionError(null);
      closeProduct();
      triggerProductsReload();
    } catch (error) {
      const fallback =
        error instanceof Error && error.message ? error.message : '품목 저장에 실패했습니다.';
      if (isHttpError(error)) {
        const detail = extractFirstDetail(error.payload);
        setProductActionError(detail ?? fallback);
      } else {
        setProductActionError(fallback);
      }
    } finally {
      setProductSaving(false);
    }
  }, [closeProduct, forecastCache, productDrawer, productSaving, skus, triggerProductsReload]);

  const deleteProduct = useCallback(async () => {
    if (!productDrawer || productDrawer.mode !== 'edit' || productDeleting) {
      return;
    }

    const targetSku = productDrawer.originalSku ?? productDrawer.row.sku;
    if (!targetSku) {
      return;
    }

    setProductDeleting(true);
    setProductActionError(null);
    try {
      await ProductService.deleteProduct(targetSku);
      setPolicyRows((prev) => prev.filter((entry) => entry.sku !== targetSku));
      setProductActionError(null);
      setSelected((prev) => (prev && prev.sku === targetSku ? null : prev));
      if (productDrawer.row.legacyProductId) {
        setForecastState((prev) => {
          const next = { ...prev };
          delete next[productDrawer.row.legacyProductId];
          return next;
        });
      }
      closeProduct();
      triggerProductsReload();
    } catch (error) {
      const message =
        error instanceof Error && error.message ? error.message : '품목 삭제에 실패했습니다.';
      setProductActionError(message);
    } finally {
      setProductDeleting(false);
    }
  }, [closeProduct, productDeleting, productDrawer, triggerProductsReload]);

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-indigo-100 via-white to-sky-100 text-slate-900">
      <div className="flex min-h-screen w-full flex-col px-4 py-10 sm:px-6 lg:px-10 xl:px-12">
        <div className="flex flex-1 gap-6 rounded-[32px] bg-white/40 p-6 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.65)] backdrop-blur-2xl ring-1 ring-white/60">
          <aside className="flex w-72 flex-col rounded-3xl bg-white/70 p-6 text-sm shadow-xl ring-1 ring-white/70 backdrop-blur-xl">
            <div className="mb-6 text-lg font-semibold text-indigo-950/80">스마트창고</div>
            <nav className="flex-1 space-y-2">
              <NavItem label="수요예측" active={active === 'forecast'} onClick={() => setActive('forecast')} />
              <NavItem label="재고관리" active={active === 'inventory'} onClick={() => setActive('inventory')} />
              <NavItem label="품목관리" active={active === 'products'} onClick={() => setActive('products')} />
              <NavItem label="카테고리 수정" active={active === 'categories'} onClick={() => setActive('categories')} />
              <NavItem label="창고관리" active={active === 'warehouses'} onClick={() => setActive('warehouses')} />
              <NavItem label="거래처관리" active={active === 'partners'} onClick={() => setActive('partners')} />
              <NavItem label="예측기준관리" active={active === 'policies'} onClick={() => setActive('policies')} />
            </nav>
          </aside>

          <main className="flex flex-1 flex-col overflow-hidden rounded-[28px] bg-white/70 shadow-xl ring-1 ring-white/70 backdrop-blur-xl">
            <div className="flex-1 overflow-y-auto px-8 pb-10">
              {active === 'inventory' && (
                <InventoryPage
                  skus={skus}
                  selected={selected}
                  setSelected={setSelected}
                  kpis={kpis}
                  riskSummary={riskSummary}
                  forecastCache={forecastCache}
                  forecastStatusBySku={forecastStatusBySku}
                />
              )}

              {active === 'forecast' && (
                <ForecastPage
                  skus={skus}
                  promoExclude={promoExclude}
                  setPromoExclude={setPromoExclude}
                  forecastCache={forecastCache}
                  forecastStatusBySku={forecastStatusBySku}
                />
              )}

              {active === 'products' && (
                <ProductsPage
                  skus={skus}
                  query={productQuery}
                  onQueryChange={setProductQuery}
                  loading={productsLoading}
                  error={productsError}
                  onRetry={triggerProductsReload}
                  onEdit={(row) => openProduct(row, 'edit')}
                  onDelete={handleProductDelete}
                  onNew={() => openProduct(createEmptyProduct(), 'new')}
                  onCsvUpload={handleCsvUploadOpen}
                  onCsvDownload={handleCsvDownload}
                  csvDownloading={csvDownloadPending}
                  csvStatus={csvStatus}
                />
              )}

              {active === 'policies' && (
                <PoliciesPage
                  skus={skus}
                  policyRows={policyRows}
                  setPolicyRows={setPolicyRows}
                  forecastCache={forecastCache}
                />
              )}

              {active === 'warehouses' && (
                <WarehouseManagementPanel
                  refreshToken={warehousePanelRefreshToken}
                  onRequestReload={requestWarehousePanelReload}
                />
              )}

              {active === 'categories' && <CategoryManagementPanel />}

              {active === 'partners' && <PartnerManagementPanel />}
            </div>
          </main>
        </div>
      </div>

      <ProductCsvUploadDialog
        open={csvDialogOpen}
        onClose={handleCsvDialogClose}
        onCompleted={handleCsvCompleted}
      />

      {productDrawer && (
        <div className="fixed inset-0 bg-black/20 flex justify-end">
          <div className="w-[480px] h-full bg-white p-5 border-l overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">
                {productDrawer.mode === 'new' ? '품목 등록' : '품목 수정'} — {productDrawer.row.sku || '신규'}
              </h3>
              <button className="text-sm" onClick={closeProduct}>
                닫기
              </button>
            </div>
            <ProductForm
              row={productDrawer.row}
              onChange={(row) => setProductDrawer({ ...productDrawer, row })}
              existingSkus={skus
                .map((item) => item.sku)
                .filter((sku) => sku !== (productDrawer.originalSku ?? ''))}
            />
            {productActionError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
                {productActionError}
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              <button
                className="px-3 py-2 rounded-xl border"
                onClick={closeProduct}
                disabled={productSaving || productDeleting}
              >
                취소
              </button>
              {productDrawer.mode === 'edit' && (
                <button
                  className="px-3 py-2 rounded-xl border border-red-200 text-red-600"
                  onClick={deleteProduct}
                  disabled={productSaving || productDeleting}
                >
                  {productDeleting ? '삭제 중...' : '삭제'}
                </button>
              )}
              <button
                className="px-3 py-2 rounded-xl bg-indigo-600 text-white disabled:opacity-60"
                onClick={saveProduct}
                disabled={productSaving}
              >
                {productSaving ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface InventoryPageProps {
  skus: Product[];
  selected: Product | null;
  setSelected: (row: Product) => void;
  kpis: KpiSummary;
  riskSummary: RiskSummaryEntry[];
  forecastCache: Record<string, ForecastResponse>;
  forecastStatusBySku: Record<string, ForecastStateEntry>;
}

const InventoryPage: React.FC<InventoryPageProps> = ({
  skus,
  selected,
  setSelected,
  kpis,
  riskSummary,
  forecastCache,
  forecastStatusBySku,
}) => {
  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<'all' | InventoryRisk>('all');
  const [warehouses, setWarehouses] = useState<ApiWarehouse[]>([]);
  const [warehousesLoading, setWarehousesLoading] = useState(false);
  const [warehousesError, setWarehousesError] = useState<string | null>(null);
  const [warehouseFetchVersion, setWarehouseFetchVersion] = useState(0);
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null);
  const [locations, setLocations] = useState<ApiLocation[]>([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationsError, setLocationsError] = useState<string | null>(null);
  const [locationFetchVersion, setLocationFetchVersion] = useState(0);
  const [selectedLocationCode, setSelectedLocationCode] = useState<string | null>(null);
  const [forecastPeriod, setForecastPeriod] = useState<ForecastPeriodLabel>('\uC77C\uC8FC \uD6C4');
  const previousWarehouseIdRef = useRef<number | null>(null);
  const reloadWarehouses = useCallback(() => setWarehouseFetchVersion((value) => value + 1), []);
  const reloadLocations = useCallback(() => setLocationFetchVersion((value) => value + 1), []);
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setWarehousesLoading(true);
      setWarehousesError(null);
      try {
        const response = await fetchWarehouses({ pageSize: 100 });
        if (cancelled) {
          return;
        }
        const items = Array.isArray(response.items) ? response.items : [];
        setWarehouses(items);
        setSelectedWarehouseId((current) => {
          if (current === null) {
            return current;
          }
          return items.some((entry) => entry.id === current) ? current : null;
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message =
          error instanceof Error && error.message
            ? error.message
            : '창고 목록을 불러오지 못했습니다.';
        setWarehousesError(message);
        setWarehouses([]);
      } finally {
        if (!cancelled) {
          setWarehousesLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [warehouseFetchVersion]);

  useEffect(() => {
    if (previousWarehouseIdRef.current !== selectedWarehouseId) {
      setSelectedLocationCode(null);
      previousWarehouseIdRef.current = selectedWarehouseId;
    }
  }, [selectedWarehouseId]);

  const selectedWarehouse = useMemo(() => {
    if (selectedWarehouseId === null) {
      return null;
    }
    return warehouses.find((entry) => entry.id === selectedWarehouseId) ?? null;
  }, [selectedWarehouseId, warehouses]);

  const activeWarehouseCode = selectedWarehouse?.code ?? null;

  useEffect(() => {
    let cancelled = false;

    if (!activeWarehouseCode) {
      setLocations([]);
      setLocationsError(null);
      setLocationsLoading(false);
      return;
    }

    const run = async () => {
      setLocationsLoading(true);
      setLocationsError(null);
      try {
        const response = await fetchLocations(activeWarehouseCode);
        if (cancelled) {
          return;
        }
        const items = Array.isArray(response.items) ? response.items : [];
        setLocations(items);
        setSelectedLocationCode((current) => {
          if (!current) {
            return current;
          }
          return items.some((entry) => entry.code === current) ? current : null;
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message =
          error instanceof Error && error.message
            ? error.message
            : '로케이션 목록을 불러오지 못했습니다.';
        setLocationsError(message);
        setLocations([]);
      } finally {
        if (!cancelled) {
          setLocationsLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [activeWarehouseCode, locationFetchVersion]);

  const activeLocationCode = selectedLocationCode?.trim() ? selectedLocationCode.trim() : null;

  const inventoryScope = useMemo(
    () => ({ warehouseCode: activeWarehouseCode, locationCode: activeLocationCode }),
    [activeWarehouseCode, activeLocationCode],
  );

  const safeWarehouses = Array.isArray(warehouses) ? warehouses : [];
  const safeLocations = Array.isArray(locations) ? locations : [];
  const safeSkus = Array.isArray(skus) ? skus : [];

  const inventorySummaries = useMemo(() => {
    const map = new Map<string, InventorySummary>();
    safeSkus.forEach((row) => {
      map.set(row.sku, summarizeInventoryForScope(row, inventoryScope));
    });
    return map;
  }, [inventoryScope, safeSkus]);

  const todayLabel = useMemo(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  }, []);

  const futureMonths = useMemo(() => {
    const base = new Date();
    const year = base.getUTCFullYear();
    const month = base.getUTCMonth();
    return Array.from({ length: 6 }, (_, index) => {
      const point = new Date(Date.UTC(year, month + index, 1));
      return { key: toMonthStartKey(point), label: formatMonthLabelKo(point) };
    });
  }, []);

  const selectedSummary = selected ? inventorySummaries.get(selected.sku) : undefined;
  const scopedSelected = selected
    ? selectedSummary
      ? { ...selected, onHand: selectedSummary.onHand, reserved: selectedSummary.reserved }
      : selected
    : null;

  const selectedForecast = selected?.sku ? forecastCache[selected.sku] : undefined;
  const selectedForecastStatus = selected?.sku ? forecastStatusBySku[selected.sku] : undefined;

  const baseAvailable = scopedSelected ? availableStock(scopedSelected) : 0;
  const avgDailyDemand = selectedForecast?.metrics?.avgDailyDemand ?? selected?.dailyAvg ?? 0;

  const safetyBenchmark = useMemo(() => {
    const forecastSafety = selectedForecast?.product?.safetyStock;
    if (typeof forecastSafety === 'number' && Number.isFinite(forecastSafety) && forecastSafety > 0) {
      return forecastSafety;
    }
    if (selected) {
      return safetyStock(selected);
    }
    return 0;
  }, [selected, selectedForecast]);

  const roundedSafetyBenchmark = useMemo(() => Math.max(Math.round(safetyBenchmark), 0), [safetyBenchmark]);

  const forecastWeeks = useMemo(() => FORECAST_PERIOD_OPTIONS[forecastPeriod] ?? 1, [forecastPeriod]);

  const weeklyDemand = useMemo(() => Math.max(Math.round(avgDailyDemand * 7), 0), [avgDailyDemand]);
  const fallbackMonthlyDemand = useMemo(
    () => Math.max(Math.round(avgDailyDemand * 30), 0),
    [avgDailyDemand],
  );

  const forecastedAvailable = useMemo(
    () => Math.max(baseAvailable - weeklyDemand * forecastWeeks, 0),
    [baseAvailable, forecastWeeks, weeklyDemand],
  );

  const monthlyShipmentSeries = useMemo(() => {
    if (!selectedForecast) {
      return [];
    }
    const totals = new Map<MonthKey, number>();
    selectedForecast.timeline.forEach((point) => {
      if (point.phase !== 'history') {
        return;
      }
      const parsed = parseForecastDate(point.date);
      if (!parsed) {
        return;
      }
      const key = toMonthStartKey(parsed);
      const value = Math.max(point.actual ?? point.forecast ?? 0, 0);
      totals.set(key, (totals.get(key) ?? 0) + value);
    });
    return Array.from(totals.entries())
      .sort((a, b) => a[0] - b[0])
      .slice(-6)
      .map(([key, total]) => ({
        name: formatMonthLabelKo(new Date(key)),
        [MONTHLY_SHIPMENT_KEY]: Math.round(total),
      }));
  }, [selectedForecast]);

  const monthlyForecastTotals = useMemo(() => {
    const map = new Map<MonthKey, number>();
    if (!selectedForecast) {
      return map;
    }
    selectedForecast.timeline.forEach((point) => {
      if (point.phase !== 'forecast') {
        return;
      }
      const parsed = parseForecastDate(point.date);
      if (!parsed) {
        return;
      }
      const key = toMonthStartKey(parsed);
      const value = Math.max(point.forecast, 0);
      map.set(key, (map.get(key) ?? 0) + value);
    });
    return map;
  }, [selectedForecast]);

  const futureForecastSeries = useMemo(() => {
    if (!scopedSelected) {
      return futureMonths.map(({ label }) => ({
        name: label,
        [AVAILABLE_STOCK_KEY]: 0,
        [SAFETY_STOCK_KEY]: roundedSafetyBenchmark,
      }));
    }
    let remaining = baseAvailable;
    return futureMonths.map(({ key, label }) => {
      const demand = monthlyForecastTotals.get(key) ?? fallbackMonthlyDemand;
      remaining = Math.max(remaining - demand, 0);
      return {
        name: label,
        [AVAILABLE_STOCK_KEY]: Math.round(remaining),
        [SAFETY_STOCK_KEY]: roundedSafetyBenchmark,
      };
    });
  }, [
    baseAvailable,
    fallbackMonthlyDemand,
    futureMonths,
    monthlyForecastTotals,
    roundedSafetyBenchmark,
    scopedSelected,
  ]);

  const availableVsSafetySeries = useMemo(() => {
    if (!selected) {
      return [];
    }
    return [
      {
        name: selected.name,
        [AVAILABLE_STOCK_KEY]: forecastedAvailable,
        [SAFETY_STOCK_KEY]: roundedSafetyBenchmark,
      },
    ];
  }, [forecastedAvailable, roundedSafetyBenchmark, selected]);

  const overstockTrendSeries = useMemo(() => {
    if (futureForecastSeries.length === 0) {
      return futureMonths.map(({ label }) => ({
        name: label,
        [OVERSTOCK_RATE_KEY]: 0,
      }));
    }
    return futureForecastSeries.map((entry) => {
      const safety = entry[SAFETY_STOCK_KEY];
      const available = entry[AVAILABLE_STOCK_KEY];
      const rate = safety > 0 ? Math.round(((available - safety) / safety) * 100) : 0;
      return { name: entry.name, [OVERSTOCK_RATE_KEY]: rate };
    });
  }, [futureForecastSeries, futureMonths]);

  const chartYear = useMemo(() => {
    if (monthlyShipmentSeries.length === 0) {
      return new Date().getFullYear();
    }
    const last = monthlyShipmentSeries[monthlyShipmentSeries.length - 1]?.name ?? '';
    const match = last.match(/^(\d{4})/);
    return match ? Number.parseInt(match[1], 10) : new Date().getFullYear();
  }, [monthlyShipmentSeries]);

  const selectorClassName =
    'min-w-[160px] rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-slate-50 disabled:text-slate-400';
  const warehousePlaceholder = warehousesLoading ? '창고 불러오는 중...' : '전체 창고';
  const locationPlaceholder = !selectedWarehouseId
    ? '창고를 먼저 선택하세요'
    : locationsLoading
      ? '로케이션 불러오는 중...'
      : locationsError
        ? '로케이션을 불러오지 못했습니다'
        : safeLocations.length === 0
          ? '로케이션 없음'
          : '전체 로케이션';

  const filteredSkus = useMemo(() => {
    const term = search.trim().toLowerCase();
    return safeSkus.filter((row) => {
      const matchesTerm =
        term.length === 0 ||
        row.sku.toLowerCase().includes(term) ||
        row.name.toLowerCase().includes(term) ||
        row.category.toLowerCase().includes(term) ||
        row.subCategory.toLowerCase().includes(term);
      const matchesRisk = riskFilter === 'all' || row.risk === riskFilter;
      const matchesScope = matchesInventoryScope(row, inventoryScope);
      return matchesTerm && matchesRisk && matchesScope;
    });
  }, [inventoryScope, riskFilter, safeSkus, search]);

  useEffect(() => {
    if (filteredSkus.length === 0) {
      return;
    }
    if (!selected || !filteredSkus.some((row) => row.sku === selected.sku)) {
      setSelected(filteredSkus[0]);
    }
  }, [filteredSkus, selected, setSelected]);

  const metrics = useMemo(() => {
    const totals = filteredSkus.reduce(
      (acc, row) => {
        const summary = inventorySummaries.get(row.sku);
        const scopedRow = summary ? { ...row, onHand: summary.onHand, reserved: summary.reserved } : row;
        const available = availableStock(scopedRow);
        acc.totalOnHand += scopedRow.onHand;
        acc.totalAvailable += available;
        acc.totalAvgDaily += Math.max(row.dailyAvg, 0);
        acc.totalInbound += resolveTotalInbound(row);
        acc.totalOutbound += resolveTotalOutbound(row);
        const eta = calculateEtaDays(scopedRow);
        if (eta !== null) {
          acc.totalEta += eta;
          acc.etaCount += 1;
        }
        if (available < safetyStock(row)) {
          acc.belowSafetyCount += 1;
        }
        if (available > standardStock(row)) {
          acc.overStockCount += 1;
        }
        return acc;
      },
      {
        totalOnHand: 0,
        totalAvailable: 0,
        totalAvgDaily: 0,
        totalInbound: 0,
        totalOutbound: 0,
        totalEta: 0,
        etaCount: 0,
        belowSafetyCount: 0,
        overStockCount: 0,
      },
    );

    const coverageDays = totals.totalAvgDaily > 0 ? Math.round(totals.totalAvailable / totals.totalAvgDaily) : 0;
    const averageEta = totals.etaCount > 0 ? Math.round(totals.totalEta / totals.etaCount) : null;

    return {
      totalOnHand: totals.totalOnHand,
      totalAvailable: totals.totalAvailable,
      totalAvgDaily: totals.totalAvgDaily,
      totalInbound: totals.totalInbound,
      totalOutbound: totals.totalOutbound,
      averageEta,
      belowSafetyCount: totals.belowSafetyCount,
      overStockCount: totals.overStockCount,
      coverageDays,
      itemCount: filteredSkus.length,
    };
  }, [filteredSkus, inventorySummaries]);

  const totalSkus = useMemo(() => riskSummary.reduce((sum, entry) => sum + entry.count, 0), [riskSummary]);

  const riskCounts = useMemo(() => {
    const base: Record<InventoryRisk, number> = { 정상: 0, 결품위험: 0, 과잉: 0 };
    riskSummary.forEach((entry) => {
      base[entry.risk] = entry.count;
    });
    return base;
  }, [riskSummary]);

  const filterOptions: Array<{ label: string; value: 'all' | InventoryRisk }> = useMemo(
    () => [
      { label: `전체 ${totalSkus}`, value: 'all' },
      { label: `결품위험 ${riskCounts['결품위험']}`, value: '결품위험' },
      { label: `정상 ${riskCounts['정상']}`, value: '정상' },
      { label: `과잉 ${riskCounts['과잉']}`, value: '과잉' },
    ],
    [riskCounts, totalSkus],
  );

  return (
    <div className="p-6 grid grid-cols-12 gap-6">
      <Card className="col-span-12">
        <div className="mb-4 space-y-2">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="sm:w-64">
                <label htmlFor="inventory-search" className="sr-only">
                  품번, 품명 검색
                </label>
                <input
                  id="inventory-search"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="품번, 품명 검색"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex flex-col">
                  <label
                    htmlFor="inventory-warehouse-filter"
                    className="text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                  >
                    창고
                  </label>
                  <select
                    id="inventory-warehouse-filter"
                    aria-label="창고 선택"
                    className={selectorClassName}
                    value={selectedWarehouseId !== null ? String(selectedWarehouseId) : ''}
                    onChange={(event) => {
                      const value = event.target.value;
                      setSelectedWarehouseId(value ? Number(value) : null);
                    }}
                    disabled={warehousesLoading && safeWarehouses.length === 0}
                  >
                    <option value="">{warehousePlaceholder}</option>
                    {safeWarehouses.map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.name} ({warehouse.code})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col">
                  <label
                    htmlFor="inventory-location-filter"
                    className="text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                  >
                    로케이션
                  </label>
                  <select
                    id="inventory-location-filter"
                    aria-label="로케이션 선택"
                    className={selectorClassName}
                    value={selectedLocationCode ?? ''}
                    onChange={(event) => {
                      const value = event.target.value;
                      setSelectedLocationCode(value ? value : null);
                    }}
                    disabled={
                      !selectedWarehouseId ||
                      locationsLoading ||
                      Boolean(locationsError) ||
                      safeLocations.length === 0
                    }
                  >
                    <option value="">{locationPlaceholder}</option>
                    {selectedWarehouseId &&
                      !locationsLoading &&
                      !locationsError &&
                      safeLocations.map((location) => (
                        <option key={location.id} value={location.code}>
                          {(location.description ?? location.code) + ` (${location.code})`}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="text-xs text-slate-500 lg:text-right">
              {selectedWarehouse ? `${selectedWarehouse.name} (${selectedWarehouse.code})` : '전체 창고'}
              {activeLocationCode ? ` · ${activeLocationCode}` : ''}
            </div>
          </div>
          <div className="flex flex-col gap-1 text-xs">
            {warehousesError && (
              <div className="flex items-center gap-2 text-rose-500">
                <span>{warehousesError}</span>
                <button
                  type="button"
                  className="rounded-full border border-rose-200 px-2 py-0.5 text-[11px] font-medium text-rose-500 transition hover:border-rose-300 hover:bg-rose-50"
                  onClick={reloadWarehouses}
                >
                  다시 시도
                </button>
              </div>
            )}
            {selectedWarehouseId && locationsError && (
              <div className="flex items-center gap-2 text-rose-500">
                <span>{locationsError}</span>
                <button
                  type="button"
                  className="rounded-full border border-rose-200 px-2 py-0.5 text-[11px] font-medium text-rose-500 transition hover:border-rose-300 hover:bg-rose-50"
                  onClick={reloadLocations}
                >
                  다시 시도
                </button>
              </div>
            )}
            {selectedWarehouseId &&
              !locationsError &&
              !locationsLoading &&
              safeLocations.length === 0 && (
                <div className="text-slate-500">선택한 창고에 등록된 로케이션이 없습니다.</div>
              )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 mb-4 text-xs">
          <span className="text-slate-500">
            총 {metrics.itemCount}개 품목 · 총입고 {metrics.totalInbound.toLocaleString()}개 · 총출고 {metrics.totalOutbound.toLocaleString()}개 · 평균 ETA{' '}
            {metrics.averageEta !== null ? `${metrics.averageEta}일` : '-'} · 가용재고 {metrics.totalAvailable.toLocaleString()}개
          </span>
          <div className="flex flex-wrap gap-2">
            {filterOptions.map((option) => {
              const isActive = riskFilter === option.value;
              const baseClass = 'px-3 py-1 rounded-full border text-xs font-medium transition-colors bg-white';
              if (option.value === 'all') {
                const tone = isActive
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50';
                return (
                  <button
                    key={option.value}
                    className={`${baseClass} ${tone}`}
                    onClick={() => setRiskFilter(option.value)}
                  >
                    {option.label}
                  </button>
                );
              }
              const palette = riskPillPalette[option.value];
              const tone = isActive ? palette.active : palette.outline;
              return (
                <button
                  key={option.value}
                  className={`${baseClass} ${tone}`}
                  onClick={() => setRiskFilter(option.value)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="overflow-auto max-h-[440px]">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-1.5 pr-3">품목</th>
                <th className="py-1.5 pr-3 text-right">월평균출고</th>
                <th className="py-1.5 pr-3 text-right">총입고량</th>
                <th className="py-1.5 pr-3 text-right">총출고량</th>
                <th className="py-1.5 pr-3 text-right">현재고</th>
                <th className="py-1.5 pr-3 text-right">가용재고</th>
                <th className="py-1.5 pr-3 text-right">안전재고</th>
                <th className="py-1.5 pr-3 text-right">1주후 예상</th>
                <th className="py-1.5 pr-3 text-right">재고소진예상일(ETA)</th>
                <th className="py-1.5 pr-3 text-right">초과재고율</th>
                <th className="py-1.5 pr-3">위험도</th>
                <th className="py-1.5 pr-3">작업지시</th>
              </tr>
            </thead>
            <tbody>
              {filteredSkus.length === 0 ? (
                <tr>
                  <td colSpan={12} className="py-12 text-center text-slate-500">
                    조건에 맞는 품목이 없습니다.
                  </td>
                </tr>
              ) : (
                filteredSkus.map((row) => {
                  const summary = inventorySummaries.get(row.sku);
                  const scopedRow = summary ? { ...row, onHand: summary.onHand, reserved: summary.reserved } : row;
                  const available = availableStock(scopedRow);
                  const safety = Math.max(safetyStock(row), 0);
                  const projected = projectedStock(scopedRow);
                  const inboundTotal = resolveTotalInbound(row);
                  const outboundTotal = resolveTotalOutbound(row);
                  const recentAverage = resolveAvgOutbound7d(row);
                  const etaDays = calculateEtaDays(scopedRow);
                  const etaDate = etaDays !== null ? createProjectedDate(etaDays) : null;
                  const excessRate = calculateExcessRate(scopedRow, safety);
                  const action = recommendedAction(scopedRow);
                  return (
                    <tr
                      key={row.sku}
                      className={`cursor-pointer transition-colors border-b border-slate-100 last:border-transparent ${
                        selected?.sku === row.sku ? 'bg-indigo-50/70' : 'hover:bg-slate-50'
                      }`}
                      onClick={() => setSelected(row)}
                    >
                      <td className="py-2 pr-3 align-top">
                        <div className="font-semibold text-slate-800 leading-tight">{row.name}</div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                          <span className="font-mono">{row.sku}</span>
                          <span>{row.category}</span>
                          <span className="text-slate-400">·</span>
                          <span>{row.subCategory}</span>
                        </div>
                        <div className="mt-1">
                          <ExpiryTag d={resolveExpiryDays(row)} />
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-right align-top">
                        <div className="font-semibold text-slate-800 leading-tight">{monthlyDemand(row).toLocaleString()}</div>
                        <div className="text-[11px] text-slate-500">월평균</div>
                      </td>
                      <td className="py-2 pr-3 text-right align-top">
                        <div className="font-semibold text-slate-800 leading-tight">{inboundTotal.toLocaleString()}</div>
                        <div className="text-[11px] text-slate-500">누적 입고</div>
                      </td>
                      <td className="py-2 pr-3 text-right align-top">
                        <div className="font-semibold text-slate-800 leading-tight">{outboundTotal.toLocaleString()}</div>
                        <div className="text-[11px] text-slate-500">최근 7일 평균 {recentAverage.toLocaleString()}개</div>
                      </td>
                      <td className="py-2 pr-3 text-right align-top">
                        <div className="font-semibold text-slate-800 leading-tight">{scopedRow.onHand.toLocaleString()}</div>
                        <div className="text-[11px] text-slate-500">예약 {scopedRow.reserved.toLocaleString()}</div>
                      </td>
                      <td className="py-2 pr-3 text-right align-top">
                        <div className="font-semibold text-slate-800 leading-tight">{available.toLocaleString()}</div>
                        <div className="text-[11px] text-slate-500">가용</div>
                      </td>
                      <td className="py-2 pr-3 text-right align-top">
                        <div className="font-semibold text-slate-800 leading-tight">{safety.toLocaleString()}</div>
                        <div className="text-[11px] text-slate-500">목표 {SAFETY_COVERAGE_DAYS}일</div>
                      </td>
                      <td className="py-2 pr-3 text-right align-top">
                        <div className="font-semibold text-slate-800 leading-tight">{projected.toLocaleString()}</div>
                        <div className="text-[11px] text-slate-500">주간 예측</div>
                      </td>
                      <td className="py-2 pr-3 text-right align-top">
                        <div className="font-semibold text-slate-800 leading-tight">
                          {etaDays !== null ? `${etaDays}일` : '-'}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {etaDate ?? '예상일 없음'}
                        </div>
                      </td>
                      <td className="py-2 pr-3 text-right align-top">
                        <div className="font-semibold text-slate-800 leading-tight">
                          {excessRate !== null ? `${excessRate > 0 ? '+' : ''}${excessRate}%` : '-'}
                        </div>
                        <div className="text-[11px] text-slate-500">안전재고 {safety.toLocaleString()}개</div>
                      </td>
                      <td className="py-2 pr-3 align-top">
                        <RiskTag risk={row.risk} />
                      </td>
                      <td className="py-2 pr-3 align-top">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full border text-[11px] font-medium ${action.tone}`}>
                          {action.label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="col-span-12 xl:col-span-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">📆 {chartYear}년 월별 출고 추이</h3>
          <span className="text-xs text-slate-500">기준일 {todayLabel}</span>
        </div>
        <div className="h-64">
          {monthlyShipmentSeries.length === 0 ? (
            <div className="h-full flex items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 text-sm text-slate-500">
              {selectedForecastStatus?.status === 'loading'
                ? '\uC6D4\uBCC4 \uCD9C\uACE0 \uB370\uC774\uD130\uB97C \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.'
                : '\uD45C\uC2DC\uD560 \uC6D4\uBCC4 \uCD9C\uACE0 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={monthlyShipmentSeries}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value) => [`${Math.round(Number(value)).toLocaleString()}개`, MONTHLY_SHIPMENT_KEY]} />
                <Legend />
                <Area
                  type="monotone"
                  dataKey={MONTHLY_SHIPMENT_KEY}
                  stroke="#4f46e5"
                  fill="#c7d2fe"
                  strokeWidth={2}
                  name={MONTHLY_SHIPMENT_KEY}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <Card className="col-span-12 xl:col-span-6 space-y-4">
        <h3 className="font-semibold">📊 향후 6개월 가용 재고 추이</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={futureForecastSeries}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(value) => [`${Math.round(Number(value)).toLocaleString()}개`, AVAILABLE_STOCK_KEY]} />
              <Legend />
              <Bar dataKey={AVAILABLE_STOCK_KEY} fill="#60a5fa" />
              <ReferenceLine
                y={roundedSafetyBenchmark}
                stroke="#f87171"
                strokeWidth={3}
                strokeDasharray="6 3"
                ifOverflow="extendDomain"
                label={{ value: '안전재고 \uAE30\uC900\uC120', position: 'insideTopLeft', fill: '#f87171', fontSize: 12 }}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="col-span-12 xl:col-span-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">📉 가용 재고 vs 안전재고 ({forecastPeriod})</h3>
          <select
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            value={forecastPeriod}
            onChange={(event) => setForecastPeriod(event.target.value as ForecastPeriodLabel)}
          >
            {(Object.keys(FORECAST_PERIOD_OPTIONS) as ForecastPeriodLabel[]).map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div className="h-56">
          {availableVsSafetySeries.length === 0 ? (
            <div className="h-full flex items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 text-sm text-slate-500">
              {selectedForecastStatus?.status === 'loading'
                ? '가용재고 \uB370\uC774\uD130\uB97C \uBD88\uB7EC\uC624\uB294 \uC911\uC785\uB2C8\uB2E4.'
                : '\uD45C\uC2DC\uD560 가용재고 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={availableVsSafetySeries}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip formatter={(value, name) => [`${Math.round(Number(value)).toLocaleString()}개`, name as string]} />
                <Legend />
                <Bar dataKey={AVAILABLE_STOCK_KEY} fill="#f97316" name="가용재고" />
                <Bar dataKey={SAFETY_STOCK_KEY} fill="#10b981" name="안전재고" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <Card className="col-span-12 xl:col-span-6 space-y-4">
        <h3 className="font-semibold">⚠️ 초과재고율 변동 추이</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={overstockTrendSeries}>
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip formatter={(value) => [`${Math.round(Number(value)).toLocaleString()}%`, OVERSTOCK_RATE_KEY]} />
              <Legend />
              <Line
                type="monotone"
                dataKey={OVERSTOCK_RATE_KEY}
                stroke="#ef4444"
                strokeWidth={3}
                dot={{ r: 4 }}
                name={OVERSTOCK_RATE_KEY}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>



    </div>
  );
};

interface ForecastPageProps {
  skus: Product[];
  promoExclude: boolean;
  setPromoExclude: (next: boolean) => void;
  forecastCache: Record<string, ForecastResponse>;
  forecastStatusBySku: Record<string, ForecastStateEntry>;
}

const ForecastPage: React.FC<ForecastPageProps> = ({
  skus,
  promoExclude,
  setPromoExclude,
  forecastCache,
  forecastStatusBySku,
}) => {
  const [mode, setMode] = useState<'perSku' | 'overall'>('perSku');
  const [selectedSku, setSelectedSku] = useState<string | null>(skus[0]?.sku ?? null);

  useEffect(() => {
    if (skus.length === 0) {
      if (selectedSku !== null) {
        setSelectedSku(null);
      }
      return;
    }

    if (!selectedSku || !skus.some((row) => row.sku === selectedSku)) {
      setSelectedSku(skus[0].sku);
    }
  }, [skus, selectedSku]);

  const { seriesMap, forecastIndexMap } = useMemo(() => {
    const map: Record<string, ForecastSeriesPoint[]> = {};
    const indexMap: Record<string, number> = {};

    skus.forEach((row, idx) => {
      const forecast = forecastCache[row.sku];
      if (forecast) {
        const points = forecast.timeline.map((point) => {
          const label = formatMonthLabel(point.date);
          const fcValue =
            promoExclude && point.phase === 'forecast' && point.promo
              ? Math.round(point.forecast * 0.92)
              : Math.round(point.forecast);
          return {
            date: label,
            actual: point.actual !== null ? Math.round(point.actual) : null,
            fc: fcValue,
            phase: point.phase,
            promo: point.promo ?? false,
          } satisfies ForecastSeriesPoint;
        });
        map[row.sku] = points;
        const forecastIdx = points.findIndex((point) => point.phase === 'forecast');
        indexMap[row.sku] = forecastIdx >= 0 ? forecastIdx : points.length;
      } else {
        const points = buildFallbackSeries(row, idx, promoExclude);
        map[row.sku] = points;
        const forecastIdx = points.findIndex((point) => point.phase === 'forecast');
        indexMap[row.sku] = forecastIdx >= 0 ? forecastIdx : points.length;
      }
    });

    return { seriesMap: map, forecastIndexMap: indexMap };
  }, [forecastCache, promoExclude, skus]);

  const anchorSku = useMemo(() => {
    return selectedSku ?? skus[0]?.sku ?? null;
  }, [selectedSku, skus]);

  const anchorSeries = anchorSku ? seriesMap[anchorSku] ?? [] : [];
  const anchorForecastIndex = anchorSku
    ? forecastIndexMap[anchorSku] ?? anchorSeries.length
    : anchorSeries.length;

  const forecastRange: ForecastRange | null =
    anchorForecastIndex >= 0 && anchorForecastIndex < anchorSeries.length
      ? {
          start: anchorSeries[anchorForecastIndex].date,
          end: anchorSeries[anchorSeries.length - 1].date,
        }
      : null;

  const handleRowClick = useCallback((sku: string) => {
    setSelectedSku(sku);
  }, []);

  const { chartData, lines } = useMemo<{
    chartData: Array<Record<string, number | string | null>>;
    lines: ForecastChartLine[];
  }>(() => {
    if (mode === 'overall') {
      const targetSku = anchorSku ?? skus[0]?.sku;
      if (!targetSku) {
        return { chartData: [], lines: [] };
      }
      const targetSeries = targetSku ? seriesMap[targetSku] ?? [] : [];
      const forecastIdx = targetSku ? forecastIndexMap[targetSku] ?? targetSeries.length : targetSeries.length;
      const start = Math.max((forecastIdx >= 0 ? forecastIdx : targetSeries.length) - HISTORY_MONTH_WINDOW, 0);
      const data = targetSeries.slice(start).map((point) => ({
        date: point.date,
        actual: point.actual,
        fc: point.fc,
      }));
      return {
        chartData: data,
        lines: [
          { key: 'actual', name: '실적' },
          { key: 'fc', name: '예측' },
        ],
      };
    }
    const targetSku = selectedSku ?? anchorSku ?? skus[0]?.sku;
    if (!targetSku) {
      return { chartData: [], lines: [] };
    }

    const targetSeries = seriesMap[targetSku] ?? [];
    const forecastIdx = forecastIndexMap[targetSku] ?? targetSeries.length;
    const start = Math.max((forecastIdx >= 0 ? forecastIdx : targetSeries.length) - HISTORY_MONTH_WINDOW, 0);
    const data = targetSeries.slice(start).map((point) => ({
      date: point.date,
      actual: point.actual,
      fc: point.fc,
    }));

    return {
      chartData: data,
      lines: [
        { key: 'actual', name: '실적' },
        { key: 'fc', name: '예측' },
      ],
    };
  }, [anchorSku, forecastIndexMap, mode, selectedSku, seriesMap, skus]);

  const anchorForecast = anchorSku ? forecastCache[anchorSku] : undefined;
  const anchorStatus = anchorSku ? forecastStatusBySku[anchorSku] : undefined;
  const anchorLoading = anchorStatus?.status === 'loading';
  const anchorError =
    anchorStatus?.status === 'error'
      ? anchorStatus.error || '예측 데이터를 불러오지 못했습니다.'
      : null;
  const activeProduct = useMemo(() => {
    if (!anchorSku) {
      return null;
    }
    return skus.find((row) => row.sku === anchorSku) ?? null;
  }, [anchorSku, skus]);

  const resolvedMetrics = useMemo<ForecastMetrics | null>(() => {
    if (anchorForecast?.metrics) {
      return anchorForecast.metrics;
    }
    if (activeProduct) {
      return buildFallbackMetrics(activeProduct, anchorSeries);
    }
    return null;
  }, [anchorForecast, activeProduct, anchorSeries]);

  const resolvedExplanation = useMemo<ForecastExplanation | null>(() => {
    if (anchorForecast?.explanation) {
      return anchorForecast.explanation;
    }
    if (activeProduct && resolvedMetrics) {
      return buildFallbackExplanation(activeProduct, resolvedMetrics);
    }
    return null;
  }, [anchorForecast, activeProduct, resolvedMetrics]);

  const actionPlans = useMemo<ActionPlanItem[]>(() => {
    if (!activeProduct || !resolvedMetrics) {
      return [];
    }
    return buildActionPlans(activeProduct, resolvedMetrics);
  }, [activeProduct, resolvedMetrics]);

  const chartLoading = anchorLoading && !anchorForecast && chartData.length === 0;
  const panelLoading = anchorLoading && !anchorForecast && !resolvedMetrics;

  return (
    <div className="p-6 grid grid-cols-12 gap-6">
      <Card className="col-span-12">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="font-semibold text-lg">수요예측</h2>
          <div className="text-xs flex flex-wrap items-center justify-end gap-1">
            <button
              className={`px-2 py-1 border rounded ${mode === 'perSku' ? 'bg-indigo-50' : ''}`}
              onClick={() => setMode('perSku')}
            >
              개별상품
            </button>
            <button
              className={`px-2 py-1 border rounded ${mode === 'overall' ? 'bg-indigo-50' : ''}`}
              onClick={() => setMode('overall')}
            >
              전체
            </button>
            <label className="inline-flex items-center gap-2 ml-4">
              <input
                type="checkbox"
                checked={promoExclude}
                onChange={(event) => setPromoExclude(event.target.checked)}
              />
              <span>프로모션 기간 제외</span>
            </label>
          </div>
        </div>
        <div className="overflow-auto max-h-[260px] border rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500">
                <th className="py-2 px-3">SKU</th>
                <th className="py-2 px-3">품명</th>
                <th className="py-2 px-3">카테고리</th>
                <th className="py-2 px-3">하위카테고리</th>
                <th className="py-2 px-3">단위</th>
                <th className="py-2 px-3 text-right">표준재고</th>
                <th className="py-2 px-3 text-right">안전재고</th>
              </tr>
            </thead>
            <tbody>
              {skus.map((row) => {
                const isSelected = selectedSku === row.sku;
                return (
                  <tr
                    key={row.sku}
                    onClick={() => handleRowClick(row.sku)}
                    className={`${isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50'} cursor-pointer`}
                    aria-selected={isSelected}
                  >
                    <td className="py-2 px-3 font-mono">{row.sku}</td>
                    <td className="py-2 px-3">{row.name}</td>
                    <td className="py-2 px-3">{row.category}</td>
                    <td className="py-2 px-3">{row.subCategory}</td>
                    <td className="py-2 px-3">{row.unit || 'EA'}</td>
                    <td className="py-2 px-3 text-right">{standardStock(row).toLocaleString()}</td>
                    <td className="py-2 px-3 text-right">{safetyStock(row).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <ForecastChartCard
        sku={anchorSku}
        chartData={chartData}
        lines={lines}
        forecastRange={forecastRange}
        colors={LINE_COLORS}
        loading={chartLoading}
        error={anchorError}
      >
        <ForecastInsightsSection
          sku={anchorSku}
          productName={activeProduct?.name}
          metrics={resolvedMetrics}
          explanation={resolvedExplanation}
          actionPlans={actionPlans}
          loading={panelLoading}
          error={anchorError}
        />
      </ForecastChartCard>

    </div>
  );
};

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

const Card: React.FC<CardProps> = ({ children, className = '' }) => (
  <motion.div
    className={`rounded-3xl border border-white/70 bg-white/60 p-5 shadow-lg backdrop-blur-sm ${className}`}
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.25 }}
  >
    {children}
  </motion.div>
);

interface NavItemProps {
  label: string;
  active: boolean;
  onClick: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ label, active, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full rounded-2xl px-4 py-2 text-left text-sm font-medium transition-colors duration-150 ${
      active
        ? 'bg-indigo-500/90 text-white shadow-sm ring-1 ring-indigo-300/70'
        : 'text-indigo-950/70 hover:bg-indigo-200/40 hover:text-indigo-800'
    }`}
  >
    {label}
  </button>
);

const RiskTag: React.FC<{ risk: InventoryRisk }> = ({ risk }) => {
  const className =
    risk === '결품위험'
      ? 'bg-red-100 text-red-700'
      : risk === '과잉'
        ? 'bg-amber-100 text-amber-700'
        : 'bg-emerald-100 text-emerald-700';
  return <span className={`px-2 py-1 rounded-full text-xs ${className}`}>{risk}</span>;
};

const ExpiryTag: React.FC<{ d: number | null | undefined }> = ({ d }) => {
  if (typeof d !== 'number' || !Number.isFinite(d)) {
    return <span className="px-2 py-1 rounded-full text-xs bg-slate-100 text-slate-500">만료 정보 없음</span>;
  }

  const normalized = Math.max(0, Math.floor(d));
  const className =
    normalized <= 14
      ? 'bg-red-100 text-red-700'
      : normalized <= 60
        ? 'bg-amber-100 text-amber-700'
        : 'bg-slate-100 text-slate-700';

  return <span className={`px-2 py-1 rounded-full text-xs ${className}`}>{formatExpiryBadge(normalized)}</span>;
};


function runSelfTests() {
  const mu = 100;
  const sigma = 30;
  const L = 10;
  const R = 7;
  const z1 = 1.28;
  const z2 = 2.33;
  const ss1 = Math.round(z1 * sigma * Math.sqrt(L + R));
  const ss2 = Math.round(z2 * sigma * Math.sqrt(L + R));
  console.assert(ss2 > ss1, 'Safety stock should increase with z');
  const rop1 = Math.round(mu * (L + R) + ss1);
  const rop2 = Math.round(mu * (L + R) + ss2);
  console.assert(rop2 > rop1, 'ROP should increase with higher SS');
}

if (typeof window !== 'undefined') {
  runSelfTests();
}

export { ProductsPage };
export const __test__ = {
  PoliciesPage,
  serviceLevelPercentageToZ,
  zToServiceLevelPercentage,
};
export default DeepflowDashboard;
