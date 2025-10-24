import React, { useMemo, useState } from 'react';
import { Product, ProductionStage, StockHistory, deriveStageFromProduct } from '../types';
import ProductItem from './ProductItem';
import StockOverviewCard from './StockOverviewCard';

interface DashboardProps {
  products: Product[];
  history: StockHistory[];
  onStockChange: (productId: string, change: number) => void;
  onEditProduct: (product: Product) => void;
  onDeleteProduct: (productId: string) => void;
  onViewHistory: (product: Product) => void;
  useServer?: boolean;
}

type StageGroup = Record<ProductionStage, Product[]>;

interface StageSummary {
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

type PeriodKey = '7d' | '30d' | '90d';

interface ComparisonOptions {
  unit?: string;
  fractionDigits?: number;
  invert?: boolean;
  valueFormatter?: (value: number) => string;
}

interface SummaryCardData {
  key: string;
  title: string;
  value: string;
  description: string;
  className: string;
  valueClassName: string;
  comparison?: { text: string; className: string };
}

interface OutstandingWorkOrderItem {
  id: string;
  productName: string;
  stage: ProductionStage;
  backlog: number;
  demandGap: number;
  inbound: number;
  leadTime: number | null;
  costPerUnit: number;
}

interface OutstandingWorkOrderSummary {
  total: number;
  items: OutstandingWorkOrderItem[];
}

interface SupplierRiskEntry {
  id: string;
  productName: string;
  stage: ProductionStage;
  supplier: string;
  risk: number;
}

interface SupplierRiskSummary {
  averageRisk: number;
  highRisk: SupplierRiskEntry[];
}

const stageOrder: ProductionStage[] = ['raw', 'wip', 'finished'];

const stageMeta: Record<ProductionStage, { label: string; description: string; gradient: string; border: string; pill: string; empty: string }> = {
  raw: {
    label: '원자재',
    description: '조달 및 자재 확보 단계의 품목을 모니터링합니다.',
    gradient: 'from-amber-50 via-white to-white',
    border: 'border-amber-100',
    pill: 'bg-amber-100 text-amber-700',
    empty: '필터 조건에 맞는 원자재가 없습니다.',
  },
  wip: {
    label: '공정 진행 중',
    description: '생산 라인에서 가공 중인 중간재를 추적합니다.',
    gradient: 'from-sky-50 via-white to-white',
    border: 'border-sky-100',
    pill: 'bg-sky-100 text-sky-700',
    empty: '현재 공정 중인 품목이 없습니다.',
  },
  finished: {
    label: '완제품',
    description: '출하 대기 또는 출고 가능한 완제품 현황입니다.',
    gradient: 'from-emerald-50 via-white to-white',
    border: 'border-emerald-100',
    pill: 'bg-emerald-100 text-emerald-700',
    empty: '완제품 항목이 없습니다.',
  },
};

const periodConfig: Record<PeriodKey, { days: number; label: string }> = {
  '7d': { days: 7, label: '전주 대비' },
  '30d': { days: 30, label: '전월 대비' },
  '90d': { days: 90, label: '전분기 대비' },
};

const stageFilterOptions: Array<{ key: 'all' | ProductionStage; label: string }> = [
  { key: 'all', label: '전체 요약' },
  { key: 'raw', label: stageMeta.raw.label },
  { key: 'wip', label: stageMeta.wip.label },
  { key: 'finished', label: stageMeta.finished.label },
];

const stageCategoryOptions: Array<{ key: 'all' | ProductionStage; label: string }> = [
  { key: 'all', label: '전체 단계' },
  { key: 'raw', label: stageMeta.raw.label },
  { key: 'wip', label: stageMeta.wip.label },
  { key: 'finished', label: stageMeta.finished.label },
];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const currencyFormatter = new Intl.NumberFormat('ko-KR', {
  style: 'currency',
  currency: 'KRW',
  maximumFractionDigits: 0,
});

const FALLBACK_LEAD_TIME_DAYS = 7;

const calculateAverageDailyDemand = (product: Product) => {
  if (typeof product.averageDailyDemand === 'number' && product.averageDailyDemand > 0) {
    return product.averageDailyDemand;
  }

  if (product.safetyStock > 0 && product.leadTimeDays > 0) {
    return product.safetyStock / product.leadTimeDays;
  }

  if (product.safetyStock > 0) {
    return product.safetyStock / 14;
  }

  return 0;
};

const normalizeDate = (value: Date | string | null | undefined) => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const calculateForecastMetrics = (product: Product, options: { preferServer?: boolean } = {}) => {
  const preferServer = options.preferServer ?? false;

  if (preferServer) {
    const recommended = typeof product.recommendedOrderQty === 'number' ? product.recommendedOrderQty : null;
    const projected = normalizeDate(product.projectedStockoutDate);

    if (recommended != null || projected) {
      return {
        recommendedOrderQty: recommended,
        projectedStockoutDate: projected,
      };
    }
  }

  const avgDailyDemand = calculateAverageDailyDemand(product);
  const leadTime = product.leadTimeDays > 0 ? product.leadTimeDays : FALLBACK_LEAD_TIME_DAYS;
  const reorderPoint = product.safetyStock + avgDailyDemand * leadTime;
  const recommendedOrderQty = reorderPoint - product.currentStock + avgDailyDemand * 7;
  const normalizedRecommended = Number.isFinite(recommendedOrderQty)
    ? Math.max(0, Math.round(recommendedOrderQty))
    : null;

  const projectedStockoutDate = avgDailyDemand > 0
    ? new Date(Date.now() + (product.currentStock / avgDailyDemand) * MS_PER_DAY)
    : null;

  return {
    recommendedOrderQty: normalizedRecommended,
    projectedStockoutDate,
  };
};

interface ForecastAggregation {
  recommendedOrderTotal: number | null;
  earliestStockoutDate: Date | null;
  earliestStockoutDays: number | null;
}

const aggregateForecastMetrics = (items: Product[], options: { preferServer: boolean }): ForecastAggregation => {
  if (items.length === 0) {
    return { recommendedOrderTotal: null, earliestStockoutDate: null, earliestStockoutDays: null };
  }

  let total = 0;
  let count = 0;
  const stockoutDates: Date[] = [];

  items.forEach((product) => {
    const metrics = calculateForecastMetrics(product, { preferServer: options.preferServer });
    if (metrics.recommendedOrderQty != null) {
      total += metrics.recommendedOrderQty;
      count += 1;
    }
    if (metrics.projectedStockoutDate) {
      stockoutDates.push(metrics.projectedStockoutDate);
    }
  });

  stockoutDates.sort((a, b) => a.getTime() - b.getTime());
  const earliest = stockoutDates[0] ?? null;
  const earliestDays = earliest ? (earliest.getTime() - Date.now()) / MS_PER_DAY : null;

  return {
    recommendedOrderTotal: count > 0 ? Math.round(total) : null,
    earliestStockoutDate: earliest,
    earliestStockoutDays: earliestDays != null ? Math.round(earliestDays * 10) / 10 : null,
  };
};

const formatStockoutDate = (date: Date) => {
  return date.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
};

const buildStageGroups = (items: Product[]): StageGroup => {
  return items.reduce<StageGroup>((acc, product) => {
    const stage = deriveStageFromProduct(product);
    acc[stage].push(product);
    return acc;
  }, { raw: [], wip: [], finished: [] });
};

const buildStageSummary = (items: Product[], stage: ProductionStage): StageSummary => {
  const required = items.reduce((sum, product) => sum + product.safetyStock, 0);
  const available = items.reduce((sum, product) => sum + product.currentStock, 0);
  const inbound = items.reduce((sum, product) => sum + (product.inboundUnits ?? 0), 0);
  const backlog = Math.max(required - (available + inbound), 0);
  const coverage = required > 0 ? available / required : items.length > 0 ? 1 : 0;
  const attainment = required > 0 ? (available + inbound) / required : items.length > 0 ? 1 : 0;

  return {
    stage,
    label: stageMeta[stage].label,
    required,
    available,
    inbound,
    backlog,
    coverage,
    attainment,
    productCount: items.length,
  };
};

const calculateProductionReadiness = (items: Product[]) => {
  const totalStock = items.reduce((sum, product) => sum + product.currentStock, 0);
  const totalDemand = items.reduce((sum, product) => {
    if (typeof product.averageDailyDemand === 'number') {
      return sum + product.averageDailyDemand;
    }
    if (product.safetyStock > 0) {
      return sum + product.safetyStock / 7;
    }
    return sum;
  }, 0);

  const daysOfCover = totalDemand > 0 ? Math.round((totalStock / totalDemand) * 10) / 10 : null;

  const leadTimeRecords = items
    .map((product) => {
      if (product.leadTimeDays == null && product.targetLeadTimeDays == null) {
        return null;
      }
      const target = product.targetLeadTimeDays ?? product.leadTimeDays ?? 0;
      const actual = product.leadTimeDays ?? target;
      if (target <= 0) {
        return null;
      }
      return { target, actual };
    })
    .filter((record): record is { target: number; actual: number } => record !== null);

  const leadTimeAdherence = leadTimeRecords.length
    ? Math.round((leadTimeRecords.filter((record) => record.actual <= record.target).length / leadTimeRecords.length) * 100)
    : null;

  return {
    totalStock,
    totalDemand,
    daysOfCover,
    leadTimeAdherence,
    leadSamples: leadTimeRecords.length,
  };
};

const calculateOutstandingWorkOrders = (items: Product[]): OutstandingWorkOrderSummary => {
  const records = items
    .map((product) => {
      const stage = deriveStageFromProduct(product);
      const inbound = product.inboundUnits ?? 0;
      const demandGap = Math.max(product.safetyStock - product.currentStock - inbound, 0);
      const backlog = Math.max(product.openWorkOrders ?? demandGap, 0);

      if (backlog <= 0 && demandGap <= 0) {
        return null;
      }

      return {
        id: product.id,
        productName: product.productName,
        stage,
        backlog,
        demandGap,
        inbound,
        leadTime: product.leadTimeDays ?? product.targetLeadTimeDays ?? null,
        costPerUnit: product.costPerUnit,
      };
    })
    .filter((item): item is OutstandingWorkOrderItem => item !== null)
    .sort((a, b) => b.backlog - a.backlog);

  const total = records.reduce((sum, item) => sum + item.backlog, 0);

  return {
    total,
    items: records,
  };
};

const calculateSupplierRisk = (items: Product[]): SupplierRiskSummary => {
  const entries = items.map((product) => {
    const stage = deriveStageFromProduct(product);
    const baseRisk = product.supplierRiskScore ?? (stage === 'raw' ? 0.55 : stage === 'wip' ? 0.35 : 0.25);
    const coverage = product.safetyStock > 0 ? product.currentStock / product.safetyStock : 1;
    const adjusted = Math.max(0, Math.min(1, baseRisk + (coverage < 1 ? (1 - coverage) * 0.4 : -0.15)));

    return {
      id: product.id,
      productName: product.productName,
      stage,
      supplier: product.supplierName ?? product.supplier ?? '미지정 공급사',
      risk: adjusted,
    };
  });

  const averageRisk = entries.length ? entries.reduce((sum, entry) => sum + entry.risk, 0) / entries.length : 0;
  const highRisk = entries.filter((entry) => entry.risk >= 0.6).sort((a, b) => b.risk - a.risk).slice(0, 6);

  return {
    averageRisk,
    highRisk,
  };
};

const computeServiceLevel = (items: Product[]) => {
  if (items.length === 0) {
    return null;
  }

  const required = items.reduce((sum, product) => sum + product.safetyStock, 0);
  if (required === 0) {
    return null;
  }

  const available = items.reduce((sum, product) => sum + product.currentStock + (product.inboundUnits ?? 0), 0);
  return Math.min(1, available / required);
};

const computePreviousProducts = (products: Product[], history: StockHistory[], periodDays: number) => {
  if (products.length === 0) {
    return { previousProducts: [], currentChanges: new Map<string, number>() };
  }

  const productIds = new Set(products.map((product) => product.id));
  const currentChanges = new Map<string, number>();
  const now = Date.now();
  const currentStart = now - periodDays * MS_PER_DAY;

  history.forEach((entry) => {
    if (!productIds.has(entry.productId)) {
      return;
    }
    const timestamp = entry.timestamp instanceof Date ? entry.timestamp.getTime() : new Date(entry.timestamp).getTime();
    if (Number.isNaN(timestamp)) {
      return;
    }
    if (timestamp >= currentStart) {
      currentChanges.set(entry.productId, (currentChanges.get(entry.productId) ?? 0) + entry.change);
    }
  });

  const previousProducts = products.map((product) => {
    const change = currentChanges.get(product.id) ?? 0;
    const previousStock = Math.max(0, product.currentStock - change);
    return { ...product, currentStock: previousStock };
  });

  return {
    previousProducts,
    currentChanges,
  };
};

const formatComparison = (
  label: string,
  current: number | null | undefined,
  previous: number | null | undefined,
  options: ComparisonOptions = {},
) => {
  if (current == null || previous == null) {
    return { text: `${label} 데이터 부족`, className: 'text-slate-400' };
  }

  const { unit, fractionDigits = 1, invert = false, valueFormatter } = options;
  const rawDelta = current - previous;
  const precisionThreshold = Math.pow(10, -(fractionDigits + 2));
  const normalizedDelta = Math.abs(rawDelta) < precisionThreshold ? 0 : rawDelta;
  const isPositive = normalizedDelta > 0;
  const isNegative = normalizedDelta < 0;
  const arrow = isPositive ? (invert ? '↓' : '↑') : isNegative ? (invert ? '↑' : '↓') : '→';
  const className = isPositive
    ? invert
      ? 'text-rose-600'
      : 'text-emerald-600'
    : isNegative
    ? invert
      ? 'text-emerald-600'
      : 'text-rose-600'
    : 'text-slate-500';
  const signPrefix = isPositive ? '+' : isNegative ? '−' : '±';
  const absoluteDelta = Math.abs(normalizedDelta);
  const formattedValue = valueFormatter
    ? valueFormatter(absoluteDelta)
    : absoluteDelta.toLocaleString(undefined, { maximumFractionDigits: fractionDigits });
  const unitSuffix = valueFormatter ? '' : unit ?? '';

  return {
    text: `${label} ${signPrefix}${formattedValue}${unitSuffix} ${arrow}`,
    className,
  };
};

const Dashboard: React.FC<DashboardProps> = ({
  products: rawProducts,
  history,
  onStockChange,
  onEditProduct,
  onDeleteProduct,
  onViewHistory,
  useServer = false,
}) => {
  const products = useMemo(
    () => rawProducts.filter((product) => !product.isDeleted),
    [rawProducts],
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState<'all' | 'low'>('all');
  const [dashboardView, setDashboardView] = useState<'operations' | 'executive'>('operations');
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodKey>('30d');
  const [summaryStageFilter, setSummaryStageFilter] = useState<'all' | ProductionStage>('all');
  const [activeStageCategory, setActiveStageCategory] = useState<'all' | ProductionStage>('all');

  const filteredProducts = useMemo(() => {
    return products
      .filter((product) => product.productName.toLowerCase().includes(searchTerm.toLowerCase()))
      .filter((product) => (filter === 'low' ? product.currentStock <= product.safetyStock : true))
      .sort((a, b) => a.productName.localeCompare(b.productName));
  }, [filter, products, searchTerm]);

  const summaryProducts = useMemo(() => {
    if (summaryStageFilter === 'all') {
      return filteredProducts;
    }
    return filteredProducts.filter((product) => deriveStageFromProduct(product) === summaryStageFilter);
  }, [filteredProducts, summaryStageFilter]);

  const categoryFilteredProducts = useMemo(() => {
    if (activeStageCategory === 'all') {
      return filteredProducts;
    }
    return filteredProducts.filter((product) => deriveStageFromProduct(product) === activeStageCategory);
  }, [activeStageCategory, filteredProducts]);

  const stageDisplayOrder = useMemo(() => {
    return activeStageCategory === 'all' ? stageOrder : stageOrder.filter((stage) => stage === activeStageCategory);
  }, [activeStageCategory]);

  const periodDays = periodConfig[selectedPeriod].days;
  const comparisonLabel = periodConfig[selectedPeriod].label;

  const summarySnapshot = useMemo(
    () => computePreviousProducts(summaryProducts, history, periodDays),
    [history, periodDays, summaryProducts],
  );

  const previousSummaryProducts = summarySnapshot.previousProducts;

  const summaryMetrics = useMemo(() => {
    const currentProductionReadiness = calculateProductionReadiness(summaryProducts);
    const previousProductionReadiness = calculateProductionReadiness(previousSummaryProducts);
    const currentOutstanding = calculateOutstandingWorkOrders(summaryProducts);
    const previousOutstanding = calculateOutstandingWorkOrders(previousSummaryProducts);
    const currentSupplierRisk = calculateSupplierRisk(summaryProducts);
    const previousSupplierRisk = calculateSupplierRisk(previousSummaryProducts);

    const inventoryValueCurrent = summaryProducts.reduce(
      (sum, product) => sum + product.currentStock * product.costPerUnit,
      0,
    );
    const inventoryValuePrevious = previousSummaryProducts.reduce(
      (sum, product) => sum + product.currentStock * product.costPerUnit,
      0,
    );

    const backlogValueCurrent = summaryProducts.reduce((sum, product) => {
      const inbound = product.inboundUnits ?? 0;
      const shortfall = Math.max(product.safetyStock - (product.currentStock + inbound), 0);
      return sum + shortfall * product.costPerUnit;
    }, 0);
    const backlogValuePrevious = previousSummaryProducts.reduce((sum, product) => {
      const inbound = product.inboundUnits ?? 0;
      const shortfall = Math.max(product.safetyStock - (product.currentStock + inbound), 0);
      return sum + shortfall * product.costPerUnit;
    }, 0);

    const potentialRevenueCurrent = summaryProducts.reduce(
      (sum, product) => sum + product.currentStock * product.costPerUnit * 1.7,
      0,
    );
    const potentialRevenuePrevious = previousSummaryProducts.reduce(
      (sum, product) => sum + product.currentStock * product.costPerUnit * 1.7,
      0,
    );

    const serviceLevelCurrent = computeServiceLevel(summaryProducts);
    const serviceLevelPrevious = computeServiceLevel(previousSummaryProducts);

    return {
      currentProductionReadiness,
      previousProductionReadiness,
      currentOutstanding,
      previousOutstanding,
      currentSupplierRisk,
      previousSupplierRisk,
      inventoryValueCurrent,
      inventoryValuePrevious,
      backlogValueCurrent,
      backlogValuePrevious,
      potentialRevenueCurrent,
      potentialRevenuePrevious,
      serviceLevelCurrent,
      serviceLevelPrevious,
    };
  }, [previousSummaryProducts, summaryProducts]);

  const forecastSummary = useMemo(
    () => ({
      current: aggregateForecastMetrics(summaryProducts, { preferServer: useServer }),
      previous: aggregateForecastMetrics(previousSummaryProducts, { preferServer: false }),
    }),
    [previousSummaryProducts, summaryProducts, useServer],
  );

  const {
    currentProductionReadiness,
    previousProductionReadiness,
    currentOutstanding,
    previousOutstanding,
    currentSupplierRisk,
    previousSupplierRisk,
    inventoryValueCurrent,
    inventoryValuePrevious,
    backlogValueCurrent,
    backlogValuePrevious,
    potentialRevenueCurrent,
    potentialRevenuePrevious,
    serviceLevelCurrent,
    serviceLevelPrevious,
  } = summaryMetrics;

  const summaryLabel = summaryStageFilter === 'all' ? '전체 품목' : stageMeta[summaryStageFilter].label;
  const hasSummaryProducts = summaryProducts.length > 0;

  const operationsSummaryCards = useMemo<SummaryCardData[]>(() => {
    const forecastLabel = useServer ? '서버 예측' : '로컬 추정';
    const recommendedOrderValue = forecastSummary.current.recommendedOrderTotal;
    const recommendedOrderPrevious = forecastSummary.previous.recommendedOrderTotal;
    const earliestStockoutDate = forecastSummary.current.earliestStockoutDate;
    const earliestStockoutDays = forecastSummary.current.earliestStockoutDays;
    const earliestStockoutPrevious = forecastSummary.previous.earliestStockoutDays;

    return [
      {
        key: 'recommendedOrderQty',
        title: '발주 권장수량',
        value:
          recommendedOrderValue != null
            ? `${Math.round(recommendedOrderValue).toLocaleString()}ea`
            : '예상 데이터 없음',
        description:
          recommendedOrderValue != null
            ? `${summaryLabel} ${forecastLabel} 기반 발주 권장량 합산`
            : `${summaryLabel} ${forecastLabel} 데이터를 수집 중입니다.`,
        className: 'border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-white',
        valueClassName: 'text-emerald-700',
        comparison:
          recommendedOrderValue != null && recommendedOrderPrevious != null
            ? formatComparison(
                comparisonLabel,
                recommendedOrderValue,
                recommendedOrderPrevious,
                { unit: 'ea', fractionDigits: 0 },
              )
            : undefined,
      },
      {
        key: 'stockoutDate',
        title: '결품 예상일',
        value: earliestStockoutDate ? formatStockoutDate(earliestStockoutDate) : '예상 데이터 없음',
        description:
          earliestStockoutDate && earliestStockoutDays != null
            ? `${summaryLabel} ${forecastLabel} 기준 가장 빠른 결품 예상 · ${
                earliestStockoutDays >= 0
                  ? `약 ${earliestStockoutDays.toFixed(1)}일 후`
                  : '이미 재고 부족 진행 중'
              }`
            : `${summaryLabel} ${forecastLabel} 데이터를 수집 중입니다.`,
        className: 'border-orange-100 bg-gradient-to-br from-orange-50 via-white to-white',
        valueClassName: 'text-orange-700',
        comparison:
          earliestStockoutDays != null && earliestStockoutPrevious != null
            ? formatComparison(
                comparisonLabel,
                earliestStockoutDays,
                earliestStockoutPrevious,
                { unit: '일', fractionDigits: 1, invert: true },
              )
            : undefined,
      },
      {
        key: 'cover',
        title: '생산 커버 일수',
        value:
          currentProductionReadiness.daysOfCover != null
            ? `${currentProductionReadiness.daysOfCover.toLocaleString()}일`
            : hasSummaryProducts
            ? '데이터 수집 중'
            : '데이터 없음',
        description:
          currentProductionReadiness.daysOfCover != null && currentProductionReadiness.totalDemand > 0
            ? `일일 수요 ${Math.round(currentProductionReadiness.totalDemand).toLocaleString()}ea 기준`
            : `${summaryLabel}의 수요 데이터가 연동되면 자동 계산됩니다.`,
        className: 'border-sky-100 bg-gradient-to-br from-sky-50 via-white to-white',
        valueClassName: 'text-sky-700',
        comparison: formatComparison(
          comparisonLabel,
          currentProductionReadiness.daysOfCover,
          previousProductionReadiness.daysOfCover,
          { unit: '일', fractionDigits: 1 },
        ),
      },
      {
        key: 'leadtime',
        title: '리드타임 준수율',
        value:
          currentProductionReadiness.leadTimeAdherence != null
            ? `${currentProductionReadiness.leadTimeAdherence.toLocaleString()}%`
            : hasSummaryProducts
            ? '데이터 수집 중'
            : '데이터 없음',
        description:
          currentProductionReadiness.leadSamples > 0
            ? `샘플 ${currentProductionReadiness.leadSamples}건 기준`
            : '리드타임 데이터가 연동되면 자동으로 계산됩니다.',
        className: 'border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-white',
        valueClassName: 'text-indigo-700',
        comparison: formatComparison(
          comparisonLabel,
          currentProductionReadiness.leadTimeAdherence,
          previousProductionReadiness.leadTimeAdherence,
          { unit: 'pt', fractionDigits: 0 },
        ),
      },
      {
        key: 'backlog',
        title: '미완료 작업지시',
        value: `${currentOutstanding.total.toLocaleString()}ea`,
        description: `${summaryLabel} 기준 안전재고 미달분과 발행된 작업지시를 집계합니다.`,
        className: 'border-amber-100 bg-gradient-to-br from-amber-50 via-white to-white',
        valueClassName: 'text-amber-700',
        comparison: formatComparison(
          comparisonLabel,
          currentOutstanding.total,
          previousOutstanding.total,
          { unit: 'ea', fractionDigits: 0, invert: false },
        ),
      },
      {
        key: 'risk',
        title: '공급 위험도',
        value: `${Math.round(currentSupplierRisk.averageRisk * 100)}%`,
        description: `${summaryLabel} 공급사의 위험도를 재고 커버리지와 사용자 입력 점수로 추정합니다.`,
        className: 'border-rose-100 bg-gradient-to-br from-rose-50 via-white to-white',
        valueClassName: 'text-rose-700',
        comparison: formatComparison(
          comparisonLabel,
          currentSupplierRisk.averageRisk * 100,
          previousSupplierRisk.averageRisk * 100,
          { unit: '%', fractionDigits: 1, invert: true },
        ),
      },
    ];
  }, [
    forecastSummary.current.earliestStockoutDate,
    forecastSummary.current.earliestStockoutDays,
    forecastSummary.current.recommendedOrderTotal,
    forecastSummary.previous.earliestStockoutDays,
    forecastSummary.previous.recommendedOrderTotal,
    comparisonLabel,
    currentOutstanding.total,
    currentProductionReadiness.daysOfCover,
    currentProductionReadiness.leadSamples,
    currentProductionReadiness.leadTimeAdherence,
    currentProductionReadiness.totalDemand,
    currentSupplierRisk.averageRisk,
    hasSummaryProducts,
    previousOutstanding.total,
    previousProductionReadiness.daysOfCover,
    previousProductionReadiness.leadTimeAdherence,
    previousSupplierRisk.averageRisk,
    summaryLabel,
    useServer,
  ]);

  const executiveSummaryCards = useMemo<SummaryCardData[]>(() => {
    return [
      {
        key: 'inventoryValue',
        title: '재고 자산 가치',
        value: currencyFormatter.format(inventoryValueCurrent),
        description: `${summaryLabel} 기준 장부가 추정치`,
        className: 'border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-white',
        valueClassName: 'text-emerald-700',
        comparison: formatComparison(comparisonLabel, inventoryValueCurrent, inventoryValuePrevious, {
          fractionDigits: 0,
          valueFormatter: (value) => currencyFormatter.format(value),
        }),
      },
      {
        key: 'revenue',
        title: '잠재 매출 기회',
        value: currencyFormatter.format(potentialRevenueCurrent),
        description: '표준 마진 70% 기준 예상 매출',
        className: 'border-indigo-100 bg-gradient-to-br from-indigo-50 via-white to-white',
        valueClassName: 'text-indigo-700',
        comparison: formatComparison(comparisonLabel, potentialRevenueCurrent, potentialRevenuePrevious, {
          fractionDigits: 0,
          valueFormatter: (value) => currencyFormatter.format(value),
        }),
      },
      {
        key: 'backlogValue',
        title: '부족 자산 위험도',
        value: currencyFormatter.format(backlogValueCurrent),
        description: '안전재고 미달분의 자본 부담 추정',
        className: 'border-amber-100 bg-gradient-to-br from-amber-50 via-white to-white',
        valueClassName: 'text-amber-700',
        comparison: formatComparison(comparisonLabel, backlogValueCurrent, backlogValuePrevious, {
          fractionDigits: 0,
          valueFormatter: (value) => currencyFormatter.format(value),
          invert: true,
        }),
      },
      {
        key: 'serviceLevel',
        title: '서비스 레벨',
        value:
          serviceLevelCurrent != null
            ? `${Math.round(serviceLevelCurrent * 100).toLocaleString()}%`
            : hasSummaryProducts
            ? '데이터 수집 중'
            : '데이터 없음',
        description: `${summaryLabel} 목표 대비 재고 충족률`,
        className: 'border-slate-200 bg-gradient-to-br from-slate-50 via-white to-white',
        valueClassName: 'text-slate-800',
        comparison: formatComparison(
          comparisonLabel,
          serviceLevelCurrent != null ? serviceLevelCurrent * 100 : null,
          serviceLevelPrevious != null ? serviceLevelPrevious * 100 : null,
          { unit: 'pt', fractionDigits: 1 },
        ),
      },
    ];
  }, [
    backlogValueCurrent,
    backlogValuePrevious,
    comparisonLabel,
    hasSummaryProducts,
    inventoryValueCurrent,
    inventoryValuePrevious,
    potentialRevenueCurrent,
    potentialRevenuePrevious,
    serviceLevelCurrent,
    serviceLevelPrevious,
    summaryLabel,
  ]);

  const summaryCards = dashboardView === 'operations' ? operationsSummaryCards : executiveSummaryCards;

  const { filteredStageGroups, filteredStageSummaries } = useMemo(() => {
    const groups = buildStageGroups(categoryFilteredProducts);
    const summaries = stageOrder.map((stage) => buildStageSummary(groups[stage], stage));
    return { filteredStageGroups: groups, filteredStageSummaries: summaries };
  }, [categoryFilteredProducts]);

  const activeStageSummaries = useMemo(() => {
    if (activeStageCategory === 'all') {
      return filteredStageSummaries;
    }
    return filteredStageSummaries.filter((summary) => summary.stage === activeStageCategory);
  }, [activeStageCategory, filteredStageSummaries]);

  const bottleneckAlerts = useMemo(() => {
    return categoryFilteredProducts
      .map((product) => {
        const stage = deriveStageFromProduct(product);
        const coverage = product.safetyStock > 0 ? product.currentStock / product.safetyStock : 1;
        return {
          id: product.id,
          productName: product.productName,
          stage,
          coverage,
        };
      })
      .filter((alert) => alert.coverage < 0.85)
      .sort((a, b) => a.coverage - b.coverage)
      .slice(0, 5);
  }, [categoryFilteredProducts]);

  const outstandingWorkOrdersGlobal = useMemo(() => calculateOutstandingWorkOrders(products), [products]);
  const supplierRiskGlobal = useMemo(() => calculateSupplierRisk(products), [products]);

  const executiveCapitalLeaders = useMemo(() => {
    const totalValue = inventoryValueCurrent;
    return summaryProducts
      .map((product) => {
        const value = product.currentStock * product.costPerUnit;
        return {
          id: product.id,
          productName: product.productName,
          stage: deriveStageFromProduct(product),
          value,
          share: totalValue > 0 ? Math.round((value / totalValue) * 100) : 0,
        };
      })
      .filter((item) => item.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 4);
  }, [inventoryValueCurrent, summaryProducts]);

  const executiveSignals = useMemo(() => {
    const backlogSignals = currentOutstanding.items.slice(0, 3).map((item) => ({
      id: `backlog-${item.id}`,
      title: item.productName,
      detail: `${stageMeta[item.stage].label} · 백로그 ${item.backlog.toLocaleString()}ea`,
      tone: 'warning' as const,
    }));

    const riskSignals = currentSupplierRisk.highRisk.slice(0, 3).map((entry) => ({
      id: `risk-${entry.id}`,
      title: entry.productName,
      detail: `${entry.supplier} · 위험도 ${Math.round(entry.risk * 100)}%`,
      tone: 'risk' as const,
    }));

    return [...backlogSignals, ...riskSignals].slice(0, 5);
  }, [currentOutstanding.items, currentSupplierRisk.highRisk]);

  const hasCategoryProducts = categoryFilteredProducts.length > 0;

  return (
    <div className="space-y-8 p-4 sm:p-6 lg:p-8">
      <section className="space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">대시보드 뷰</span>
              <button
                onClick={() => setDashboardView('operations')}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  dashboardView === 'operations'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                운영 관점
              </button>
              <button
                onClick={() => setDashboardView('executive')}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                  dashboardView === 'executive'
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/30'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                경영 관점
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">요약 범위</span>
              {stageFilterOptions.map((option) => (
                <button
                  key={option.key}
                  onClick={() => setSummaryStageFilter(option.key)}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                    summaryStageFilter === option.key
                      ? 'bg-slate-900 text-white shadow-lg shadow-slate-400/30'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">비교 기간</span>
              {(['7d', '30d', '90d'] as PeriodKey[]).map((period) => (
                <button
                  key={period}
                  onClick={() => setSelectedPeriod(period)}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                    selectedPeriod === period
                      ? 'bg-slate-900 text-white shadow-lg shadow-slate-400/30'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {period === '7d' ? '최근 7일' : period === '30d' ? '최근 30일' : '최근 90일'}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <div
              key={card.key}
              className={`rounded-2xl border bg-white/90 p-5 shadow-sm backdrop-blur transition hover:-translate-y-0.5 hover:shadow-md ${card.className}`}
            >
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{card.title}</p>
              <p className={`mt-3 text-2xl font-bold ${card.valueClassName}`}>{card.value}</p>
              <p className="mt-2 text-xs text-slate-500">{card.description}</p>
              {card.comparison && (
                <p className={`mt-2 text-xs font-semibold ${card.comparison.className}`}>{card.comparison.text}</p>
              )}
            </div>
          ))}
        </div>
      </section>

      {dashboardView === 'operations' ? (
        <>
          <section className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur">
            <div className="flex flex-col gap-4 md:flex-row md:flex-wrap md:items-start md:gap-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">카테고리</span>
                {stageCategoryOptions.map((option) => (
                  <button
                    key={option.key}
                    onClick={() => setActiveStageCategory(option.key)}
                    className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                      activeStageCategory === option.key
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-400/30'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="w-full md:flex-1 md:min-w-[260px] md:max-w-md">
                <label htmlFor="product-search" className="sr-only">
                  제품 검색
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                      <path
                        fillRule="evenodd"
                        d="M9 3.5a5.5 5.5 0 104.473 9.013l3.257 3.257a.75.75 0 101.06-1.06l-3.257-3.257A5.5 5.5 0 009 3.5zm-4 5.5a4 4 0 118 0 4 4 0 01-8 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </span>
                  <input
                    id="product-search"
                    type="text"
                    placeholder="제품 검색..."
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-10 py-2.5 text-sm text-slate-700 shadow-sm transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 md:ml-auto">
                <button
                  onClick={() => setFilter('all')}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    filter === 'all'
                      ? 'bg-slate-900 text-white shadow-lg shadow-slate-400/30'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  전체 보기
                </button>
                <button
                  onClick={() => setFilter('low')}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    filter === 'low'
                      ? 'bg-rose-600 text-white shadow-lg shadow-rose-400/30'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  안전재고 미달
                </button>
              </div>
            </div>

          {hasCategoryProducts ? (
            <div className="mt-6 grid gap-6 lg:grid-cols-[2fr_1fr]">
              <div className="space-y-6">
                  {stageDisplayOrder.map((stage) => {
                    const productsInStage = filteredStageGroups[stage];
                    const meta = stageMeta[stage];
                    return (
                      <section key={stage} className={`rounded-2xl border bg-white p-4 shadow-sm ${meta.border}`}>
                        <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${meta.pill}`}>
                              {meta.label}
                            </div>
                            <p className="mt-2 text-sm text-slate-500">{meta.description}</p>
                          </div>
                          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                            {productsInStage.length}개 품목
                          </span>
                        </header>
                        <div className="mt-4 space-y-4">
                          {productsInStage.length > 0 ? (
                            productsInStage.map((product) => (
                              <ProductItem
                                key={product.id}
                                product={product}
                                onStockChange={onStockChange}
                                onEdit={onEditProduct}
                                onDelete={onDeleteProduct}
                                onViewHistory={onViewHistory}
                              />
                            ))
                          ) : (
                            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-6 text-center text-sm text-slate-400">
                              {meta.empty}
                            </div>
                          )}
                        </div>
                      </section>
                    );
                  })}
                </div>
                <StockOverviewCard stageSummaries={activeStageSummaries} bottleneckAlerts={bottleneckAlerts} />
              </div>
            ) : (
              <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-10 text-center text-slate-500">
                선택한 카테고리에 해당하는 제품이 없습니다. 필터를 조정해 보세요.
              </div>
            )}
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur">
              <header className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">미완료 작업지시</h3>
                  <p className="text-sm text-slate-500">안전재고 미달분과 개방된 작업지시를 우선순위화합니다.</p>
                </div>
                <div className="rounded-full bg-amber-100 px-4 py-1 text-sm font-semibold text-amber-700">
                  총 {outstandingWorkOrdersGlobal.total.toLocaleString()}ea
                </div>
              </header>
              <p className="text-xs text-slate-400">전체 재고 기준 요약입니다. 세부 데이터 연동 시 자동으로 업데이트됩니다.</p>
              <div className="space-y-3">
                {outstandingWorkOrdersGlobal.items.length > 0 ? (
                  outstandingWorkOrdersGlobal.items.slice(0, 6).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between rounded-2xl border border-amber-100 bg-amber-50/60 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{item.productName}</p>
                        <p className="text-xs text-slate-500">
                          {stageMeta[item.stage].label} · 부족 {item.demandGap.toLocaleString()}ea
                          {item.inbound > 0 && ` · 입고 예정 ${item.inbound.toLocaleString()}ea`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-amber-700">{item.backlog.toLocaleString()}ea</p>
                        {item.leadTime != null && (
                          <p className="text-xs text-amber-600">리드타임 {item.leadTime}일</p>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-amber-200 bg-white/70 p-6 text-center text-sm text-amber-600">
                    미완료 작업지시가 없습니다.
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur">
              <header className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">공급 지연 위험</h3>
                  <p className="text-sm text-slate-500">공급사 리스크 신호를 바탕으로 선제 대응하세요.</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-400">평균 위험도</p>
                  <p className="text-xl font-bold text-rose-600">{Math.round(supplierRiskGlobal.averageRisk * 100)}%</p>
                </div>
              </header>
              <div className="h-2 w-full overflow-hidden rounded-full bg-rose-100">
                <div
                  className="h-full bg-gradient-to-r from-emerald-400 via-amber-400 to-rose-500"
                  style={{ width: `${Math.round(Math.min(supplierRiskGlobal.averageRisk, 1) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-slate-400">공급 지연 위험도는 재고 커버리지와 사용자 입력 리스크 점수를 조합한 추정치입니다.</p>
              <div className="space-y-3">
                {supplierRiskGlobal.highRisk.length > 0 ? (
                  supplierRiskGlobal.highRisk.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between rounded-2xl border border-rose-100 bg-rose-50/60 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{entry.productName}</p>
                        <p className="text-xs text-slate-500">
                          {stageMeta[entry.stage].label} · {entry.supplier}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-rose-600">{Math.round(entry.risk * 100)}%</p>
                        <div className="mt-1 h-1.5 w-20 overflow-hidden rounded-full bg-white/60">
                          <div
                            className="h-full rounded-full bg-rose-500"
                            style={{ width: `${Math.round(Math.min(entry.risk, 1) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="rounded-2xl border border-dashed border-rose-200 bg-white/70 p-6 text-center text-sm text-rose-600">
                    고위험 공급사가 없습니다. 지속적으로 데이터를 동기화하세요.
                  </div>
                )}
              </div>
            </div>
          </section>
        </>
      ) : (
        <section className="grid gap-6 lg:grid-cols-2">
          <div className="flex flex-col gap-4 rounded-2xl border border-emerald-100 bg-white/90 p-5 shadow-sm backdrop-blur">
            <header className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">자본 집중 제품</h3>
                <p className="text-sm text-slate-500">재고 자산 가치의 대부분을 차지하는 제품입니다.</p>
              </div>
              <div className="rounded-full bg-emerald-100 px-4 py-1 text-sm font-semibold text-emerald-700">
                총 {currencyFormatter.format(inventoryValueCurrent)}
              </div>
            </header>
            <div className="space-y-3">
              {executiveCapitalLeaders.length > 0 ? (
                executiveCapitalLeaders.map((leader) => (
                  <div
                    key={leader.id}
                    className="flex items-center justify-between rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{leader.productName}</p>
                      <p className="text-xs text-slate-500">{stageMeta[leader.stage].label}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-emerald-700">{currencyFormatter.format(leader.value)}</p>
                      <p className="text-xs text-emerald-600">자산 비중 {leader.share}%</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-emerald-200 bg-white/70 p-6 text-center text-sm text-emerald-600">
                  집계할 제품이 없습니다.
                </div>
              )}
            </div>
            <p className="text-xs text-slate-400">
              자본 집중 제품을 기반으로 리스크 분산 및 재고 운전자본 최적화를 추진하세요.
            </p>
          </div>

          <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur">
            <header className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">경영 주요 신호</h3>
                <p className="text-sm text-slate-500">자본 부담과 공급망 리스크를 기반으로 우선 순위를 제시합니다.</p>
              </div>
              <div className="rounded-full bg-slate-100 px-4 py-1 text-sm font-semibold text-slate-600">
                {executiveSignals.length}건
              </div>
            </header>
            <div className="space-y-3">
              {executiveSignals.length > 0 ? (
                executiveSignals.map((signal) => (
                  <div
                    key={signal.id}
                    className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${
                      signal.tone === 'risk'
                        ? 'border-rose-100 bg-rose-50/70'
                        : 'border-amber-100 bg-amber-50/70'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{signal.title}</p>
                      <p className="text-xs text-slate-500">{signal.detail}</p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        signal.tone === 'risk'
                          ? 'bg-rose-500/20 text-rose-700'
                          : 'bg-amber-500/20 text-amber-700'
                      }`}
                    >
                      {signal.tone === 'risk' ? '공급 리스크' : '수요 대응'}
                    </span>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-6 text-center text-sm text-slate-500">
                  경영 관점에서 주목할 신호가 없습니다.
                </div>
              )}
            </div>
            <p className="text-xs text-slate-400">
              주요 신호를 기반으로 생산·구매 전략을 조정하면 재고 운전자본 활용도를 높일 수 있습니다.
            </p>
          </div>
        </section>
      )}
    </div>
  );
};

export default Dashboard;
