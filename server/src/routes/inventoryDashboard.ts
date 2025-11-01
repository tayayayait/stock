import type { FastifyInstance } from 'fastify';

import { findForecastProductBySku } from '../data/forecastSources.js';
import { listInventoryForSku } from '../stores/inventoryStore.js';
import { getPolicyDraft } from '../stores/policiesStore.js';
import {
  getDailyMovementHistory,
  summarizeMovementTotals,
  type MovementHistoryPoint,
} from '../stores/movementAnalyticsStore.js';
import { __getProductRecords } from './products.js';

const RISK_STABLE = '\uC815\uC0C1';
const RISK_SHORTAGE = '\uACB0\uD488\uC704\uD5D8';
const RISK_OVERSTOCK = '\uACFC\uC694';
type RiskLabel = typeof RISK_STABLE | typeof RISK_SHORTAGE | typeof RISK_OVERSTOCK;

const RISK_ORDER: RiskLabel[] = [RISK_STABLE, RISK_SHORTAGE, RISK_OVERSTOCK];
const normalizeSku = (value: string): string => value.trim().toUpperCase();
const SERVICE_LEVEL_Z_TABLE: Array<{ percent: number; z: number }> = [
  { percent: 90, z: 1.2816 },
  { percent: 95, z: 1.6449 },
  { percent: 98, z: 2.0537 },
  { percent: 99, z: 2.3263 },
];
const DEFAULT_SERVICE_LEVEL_PERCENT = 95;
const DEFAULT_LEAD_TIME_DAYS = 14;
const DEFAULT_MOVEMENT_WINDOW_DAYS = 60;
const TREND_WINDOW_DAYS = 7;

const resolveServiceLevelZ = (percent: number): number => {
  if (!Number.isFinite(percent)) {
    return 0;
  }

  let nearest = SERVICE_LEVEL_Z_TABLE[0];
  let minDiff = Math.abs(percent - nearest.percent);

  for (const entry of SERVICE_LEVEL_Z_TABLE) {
    const diff = Math.abs(percent - entry.percent);
    if (diff < minDiff) {
      nearest = entry;
      minDiff = diff;
    }
  }

  return nearest.z;
};

const resolveServiceLevelPercent = (product: ProductRecord): number => {
  switch (product.risk as RiskLabel | undefined) {
    case RISK_SHORTAGE:
      return 98;
    case RISK_OVERSTOCK:
      return 90;
    default:
      return DEFAULT_SERVICE_LEVEL_PERCENT;
  }
};

const resolveLeadTimeDays = (product: ProductRecord): number => {
  const forecast = findForecastProductBySku(product.sku);
  if (forecast && Number.isFinite(forecast.leadTimeDays)) {
    return Math.max(0, forecast.leadTimeDays);
  }
  return DEFAULT_LEAD_TIME_DAYS;
};

const computeSafetyStock = (product: ProductRecord): number => {
  const policy = getPolicyDraft(product.sku);

  const sigmaCandidate = policy?.demandStdDev;
  const sigma =
    Number.isFinite(sigmaCandidate ?? NaN) && (sigmaCandidate ?? 0) > 0
      ? Math.max(sigmaCandidate as number, 0)
      : Number.isFinite(product.dailyStd)
        ? Math.max(product.dailyStd, 0)
        : 0;
  if (sigma <= 0) {
    return 0;
  }

  const serviceLevelCandidate = policy?.serviceLevelPercent;
  const serviceLevelPercent =
    Number.isFinite(serviceLevelCandidate ?? NaN) && (serviceLevelCandidate ?? 0) > 0
      ? serviceLevelCandidate as number
      : resolveServiceLevelPercent(product);
  const z = resolveServiceLevelZ(serviceLevelPercent);
  if (z <= 0) {
    return 0;
  }

  const leadTimeCandidate = policy?.leadTimeDays;
  const leadTimeDays =
    Number.isFinite(leadTimeCandidate ?? NaN) && (leadTimeCandidate ?? 0) > 0
      ? leadTimeCandidate as number
      : resolveLeadTimeDays(product);
  if (!Number.isFinite(leadTimeDays) || leadTimeDays <= 0) {
    return 0;
  }

  return Math.max(0, Math.round(z * sigma * Math.sqrt(leadTimeDays)));
};


const toSafeNumber = (value: unknown): number =>
  Number.isFinite(value as number) ? Math.max(0, Number(value)) : 0;

const calculateAvailable = (onHand: number, reserved: number) => Math.max(onHand - reserved, 0);

const clamp = (value: number, min = 0, max = Number.POSITIVE_INFINITY) => Math.min(max, Math.max(min, value));

const selectPrimaryLocation = (
  inventory: Array<{ locationCode: string; onHand: number }> | undefined,
): string | null => {
  if (!inventory || inventory.length === 0) {
    return null;
  }

  return inventory
    .slice()
    .sort((a, b) => {
      if (a.onHand === b.onHand) {
        return a.locationCode.localeCompare(b.locationCode);
      }
      return b.onHand - a.onHand;
    })[0]?.locationCode ?? null;
};

const buildTrendSeries = (history: MovementHistoryPoint[], currentAvailable: number): number[] => {
  if (!history || history.length === 0) {
    const baseline = Math.max(0, Math.round(currentAvailable));
    return [baseline, baseline];
  }

  const recent = history.slice(-TREND_WINDOW_DAYS);
  const trend = new Array(recent.length);
  let running = Math.max(0, Math.round(currentAvailable));

  for (let index = recent.length - 1; index >= 0; index -= 1) {
    trend[index] = Math.max(0, Math.round(running));
    const point = recent[index];
    running -= toSafeNumber(point.inbound);
    running += toSafeNumber(point.outbound);
  }

  if (trend.length === 1) {
    trend.unshift(trend[0]);
  }

  return trend;
};

const aggregateMovementHistory = (
  histories: Map<string, MovementHistoryPoint[]>,
): Array<{ date: string; inbound: number; outbound: number; adjustments: number }> => {
  const totalsByDate = new Map<string, { inbound: number; outbound: number; adjustments: number }>();

  histories.forEach((history) => {
    history.forEach((point) => {
      const current = totalsByDate.get(point.date) ?? { inbound: 0, outbound: 0, adjustments: 0 };
      current.inbound += toSafeNumber(point.inbound);
      current.outbound += toSafeNumber(point.outbound);
      current.adjustments += toSafeNumber(point.adjustments);
      totalsByDate.set(point.date, current);
    });
  });

  return Array.from(totalsByDate.entries())
    .map(([date, totals]) => ({
      date,
      inbound: totals.inbound,
      outbound: totals.outbound,
      adjustments: totals.adjustments,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_ANALYSIS_RANGE_DAYS = 30;
const MAX_ANALYSIS_RANGE_DAYS = 366;

type GroupByOption = 'week' | 'month';
type ProductRecord = ReturnType<typeof __getProductRecords>[number];

interface AnalysisRange {
  from: string;
  to: string;
  dayCount: number;
}

interface DailyMovementSummary {
  date: string;
  inbound: number;
  outbound: number;
  adjustments: number;
  net: number;
}

interface StockTrajectoryPoint {
  date: string;
  onHand: number;
  available: number;
  safetyStock: number;
}

interface PeriodSummary {
  periodStart: string;
  periodEnd: string;
  label: string;
  inbound: number;
  outbound: number;
  adjustments: number;
  net: number;
  endingOnHand: number;
  endingAvailable: number;
  safetyStock: number;
}

const toUtcDateOnly = (value: Date): Date =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

const addUtcDays = (value: Date, days: number): Date => {
  const next = new Date(value.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
};

const formatDateKey = (value: Date): string => value.toISOString().slice(0, 10);

const parseAnalysisRange = (params: { from?: string; to?: string }): AnalysisRange => {
  const now = toUtcDateOnly(new Date());
  const endCandidate = params.to ? new Date(params.to) : now;
  if (Number.isNaN(endCandidate.getTime())) {
    throw new Error('Invalid end date');
  }
  const end = toUtcDateOnly(endCandidate);

  let start: Date;
  if (params.from) {
    const startCandidate = new Date(params.from);
    if (Number.isNaN(startCandidate.getTime())) {
      throw new Error('Invalid start date');
    }
    start = toUtcDateOnly(startCandidate);
  } else {
    start = addUtcDays(end, -(DEFAULT_ANALYSIS_RANGE_DAYS - 1));
  }

  if (start.getTime() > end.getTime()) {
    throw new Error('Date range start must not be after end date');
  }

  const dayCount = Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
  if (dayCount > MAX_ANALYSIS_RANGE_DAYS) {
    throw new Error('Date range exceeds allowed window');
  }

  return {
    from: formatDateKey(start),
    to: formatDateKey(end),
    dayCount,
  };
};

const resolveGroupBy = (range: AnalysisRange, requested?: string): GroupByOption => {
  if (requested === 'week' || requested === 'month') {
    return requested;
  }
  return range.dayCount <= 90 ? 'week' : 'month';
};

const enumerateDateKeys = (range: AnalysisRange): string[] => {
  const start = new Date(`${range.from}T00:00:00.000Z`);
  const end = new Date(`${range.to}T00:00:00.000Z`);
  const dates: string[] = [];

  for (let cursor = new Date(start.getTime()); cursor.getTime() <= end.getTime(); cursor = addUtcDays(cursor, 1)) {
    dates.push(formatDateKey(cursor));
  }

  return dates;
};

const zeroFillDailySeries = (range: AnalysisRange, points: MovementHistoryPoint[]): DailyMovementSummary[] => {
  const byDate = new Map(points.map((point) => [point.date, point]));
  return enumerateDateKeys(range).map((date) => {
    const point = byDate.get(date);
    const inbound = toSafeNumber(point?.inbound ?? 0);
    const outbound = toSafeNumber(point?.outbound ?? 0);
    const adjustments = toSafeNumber(point?.adjustments ?? 0);
    const net = inbound - outbound + adjustments;
    return { date, inbound, outbound, adjustments, net };
  });
};

const getWeekStart = (value: Date): Date => {
  const date = toUtcDateOnly(value);
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addUtcDays(date, offset);
};

const getWeekEnd = (weekStart: Date): Date => addUtcDays(weekStart, 6);

const getMonthStart = (value: Date): Date => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));

const getMonthEnd = (monthStart: Date): Date =>
  new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0));

const formatPeriodLabel = (start: Date, end: Date, groupBy: GroupByOption): string => {
  if (groupBy === 'month') {
    const year = start.getUTCFullYear();
    const month = String(start.getUTCMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  }

  return `${formatDateKey(start)}~${formatDateKey(end)}`;
};

const buildStockTrajectory = (
  daily: DailyMovementSummary[],
  startingOnHand: number,
  currentReserved: number,
  safetyStock: number,
): StockTrajectoryPoint[] => {
  let running = startingOnHand;
  return daily.map((point) => {
    running += point.net;
    const onHand = Math.max(0, running);
    const available = Math.max(onHand - currentReserved, 0);
    return {
      date: point.date,
      onHand,
      available,
      safetyStock,
    };
  });
};

const groupDailySeries = (
  daily: DailyMovementSummary[],
  groupBy: GroupByOption,
  startingOnHand: number,
  currentReserved: number,
  safetyStock: number,
): PeriodSummary[] => {
  const buckets = new Map<
    string,
    { start: Date; end: Date; inbound: number; outbound: number; adjustments: number; net: number }
  >();

  daily.forEach((point) => {
    const date = new Date(`${point.date}T00:00:00.000Z`);
    const periodStart = groupBy === 'week' ? getWeekStart(date) : getMonthStart(date);
    const periodEnd = groupBy === 'week' ? getWeekEnd(periodStart) : getMonthEnd(periodStart);
    const key = formatDateKey(periodStart);

    const bucket =
      buckets.get(key) ?? {
        start: periodStart,
        end: periodEnd,
        inbound: 0,
        outbound: 0,
        adjustments: 0,
        net: 0,
      };

    bucket.inbound += point.inbound;
    bucket.outbound += point.outbound;
    bucket.adjustments += point.adjustments;
    bucket.net += point.net;

    if (periodEnd.getTime() > bucket.end.getTime()) {
      bucket.end = periodEnd;
    }

    buckets.set(key, bucket);
  });

  const ordered = Array.from(buckets.values()).sort((a, b) => a.start.getTime() - b.start.getTime());
  let runningOnHand = startingOnHand;

  return ordered.map((bucket) => {
    runningOnHand += bucket.net;
    const endingOnHand = Math.max(0, runningOnHand);
    const endingAvailable = Math.max(endingOnHand - currentReserved, 0);

    return {
      periodStart: formatDateKey(bucket.start),
      periodEnd: formatDateKey(bucket.end),
      label: formatPeriodLabel(bucket.start, bucket.end, groupBy),
      inbound: bucket.inbound,
      outbound: bucket.outbound,
      adjustments: bucket.adjustments,
      net: bucket.net,
      endingOnHand,
      endingAvailable,
      safetyStock,
    };
  });
};

const summarizeProductForWarehouse = (
  product: ProductRecord,
  warehouseCode: string | null,
): {
  onHand: number;
  reserved: number;
  available: number;
  entries: ProductRecord['inventory'];
} => {
  const entries = Array.isArray(product.inventory) ? product.inventory : [];
  if (!warehouseCode) {
    const onHand = toSafeNumber(product.onHand);
    const reserved = toSafeNumber(product.reserved);
    return {
      onHand,
      reserved,
      available: calculateAvailable(onHand, reserved),
      entries,
    };
  }

  const scoped = entries.filter((entry) => entry.warehouseCode === warehouseCode);
  if (scoped.length === 0) {
    return { onHand: 0, reserved: 0, available: 0, entries: [] };
  }

  const onHand = scoped.reduce((sum, entry) => sum + toSafeNumber(entry.onHand), 0);
  const reserved = scoped.reduce((sum, entry) => sum + toSafeNumber(entry.reserved), 0);
  return {
    onHand,
    reserved,
    available: calculateAvailable(onHand, reserved),
    entries: scoped,
  };
};

const aggregateTotalsForWarehouse = (
  products: ProductRecord[],
  warehouseCode: string | null,
): { onHand: number; reserved: number; available: number; safetyStock: number } => {
  const accumulator = products.reduce(
    (totals, product) => {
      const summary = summarizeProductForWarehouse(product, warehouseCode);
      totals.onHand += summary.onHand;
      totals.reserved += summary.reserved;
      if (!warehouseCode || summary.entries.length > 0 || summary.onHand > 0 || summary.reserved > 0) {
        totals.safetyStock += computeSafetyStock(product);
      }
      return totals;
    },
    { onHand: 0, reserved: 0, safetyStock: 0 },
  );

  return {
    onHand: accumulator.onHand,
    reserved: accumulator.reserved,
    available: calculateAvailable(accumulator.onHand, accumulator.reserved),
    safetyStock: accumulator.safetyStock,
  };
};

const computeProjectedStockoutDate = (available: number, avgDailyOutbound: number): string | null => {
  if (!Number.isFinite(avgDailyOutbound) || avgDailyOutbound <= 0) {
    return null;
  }

  const days = available / avgDailyOutbound;
  if (!Number.isFinite(days) || days < 0) {
    return null;
  }

  const baseline = toUtcDateOnly(new Date());
  const projected = addUtcDays(baseline, Math.max(0, Math.round(days)));
  return new Date(
    Date.UTC(projected.getUTCFullYear(), projected.getUTCMonth(), projected.getUTCDate()),
  ).toISOString();
};

export default async function inventoryDashboardRoutes(server: FastifyInstance) {
  server.get('/dashboard', async (_request, reply) => {
    const products = __getProductRecords();
    const skuCount = products.length;

    const movementHistoryBySku = new Map<string, MovementHistoryPoint[]>();
    products.forEach((product) => {
      movementHistoryBySku.set(
        product.sku,
        getDailyMovementHistory({ days: DEFAULT_MOVEMENT_WINDOW_DAYS, sku: product.sku }),
      );
    });

    const movementHistory = skuCount === 0 ? [] : aggregateMovementHistory(movementHistoryBySku);

    const totalOnHand = products.reduce((sum, product) => sum + toSafeNumber(product.onHand), 0);
    const totalReserved = products.reduce((sum, product) => sum + toSafeNumber(product.reserved), 0);
    const totalAvailable = calculateAvailable(totalOnHand, totalReserved);

    const shortageSkuCount = products.filter((product) => product.risk === RISK_SHORTAGE).length;
    const shortageRate = skuCount > 0 ? shortageSkuCount / skuCount : 0;

    const dosSamples = products
      .map((product) => {
        const available = calculateAvailable(product.onHand, product.reserved);
        const dailyDemand = Math.max(product.dailyAvg, 0.1);
        return available / dailyDemand;
      })
      .filter((value) => Number.isFinite(value) && value >= 0);
    const avgDaysOfSupply =
      dosSamples.length > 0 ? Math.round(dosSamples.reduce((sum, value) => sum + value, 0) / dosSamples.length) : 0;

    const totalOutbound = products.reduce((sum, product) => sum + toSafeNumber(product.totalOutbound), 0);
    const inventoryTurnover = totalOnHand > 0 ? Number((totalOutbound / totalOnHand).toFixed(2)) : 0;
    const serviceLevelPercent = Math.round(Math.max(82, Math.min(99, 100 - shortageRate * 25)));

    const riskDistribution = RISK_ORDER.map((risk) => {
      const count = products.filter((product) => product.risk === risk).length;
      const ratio = skuCount > 0 ? Math.round((count / skuCount) * 100) : 0;
      return { risk, count, ratio };
    });

    const warehouseAccumulator = new Map<string, { onHand: number; reserved: number }>();
    products.forEach((product) => {
      (product.inventory ?? []).forEach((entry) => {
        const bucket = warehouseAccumulator.get(entry.warehouseCode) ?? { onHand: 0, reserved: 0 };
        bucket.onHand += toSafeNumber(entry.onHand);
        bucket.reserved += toSafeNumber(entry.reserved);
        warehouseAccumulator.set(entry.warehouseCode, bucket);
      });
    });

    const warehouseTotals = Array.from(warehouseAccumulator.entries())
      .map(([warehouseCode, totals]) => ({
        warehouseCode,
        onHand: totals.onHand,
        reserved: totals.reserved,
        available: calculateAvailable(totals.onHand, totals.reserved),
      }))
      .sort((a, b) => b.onHand - a.onHand);

    const safetyStockFor = (product: (typeof products)[number]) => computeSafetyStock(product);

    const inventoryFlags = products.map((product) => {
      const available = calculateAvailable(product.onHand, product.reserved);
      const safety = safetyStockFor(product);
      const shortageQty = Math.max(safety - available, 0);
      const overstockQty = Math.max(available - safety, 0);
      const overstockRate = safety > 0 ? Math.round(((available - safety) / safety) * 100) : 0;
      const primaryLocation = selectPrimaryLocation(product.inventory);
      const daysOfCover = product.dailyAvg > 0 ? available / product.dailyAvg : 0;
      const fillRate = safety > 0 ? clamp(available / safety, 0, 1) : available > 0 ? 1 : 0;
      const trend = buildTrendSeries(movementHistoryBySku.get(product.sku) ?? [], available);

      return {
        sku: product.sku,
        name: product.name,
        category: product.category,
        onHand: product.onHand,
        reserved: product.reserved,
        available,
        safetyStock: safety,
        shortageQty,
        overstockQty,
        overstockRate,
        risk: product.risk as RiskLabel,
        dailyAvg: product.dailyAvg,
        totalInbound: toSafeNumber(product.totalInbound),
        totalOutbound: toSafeNumber(product.totalOutbound),
        primaryLocation,
        daysOfCover,
        fillRate,
        trend,
      };
    });

    const topShortages = inventoryFlags
      .filter((entry) => entry.shortageQty > 0)
      .sort((a, b) => b.shortageQty - a.shortageQty)
      .slice(0, 10);

    const topOverstock = inventoryFlags
      .filter((entry) => entry.overstockRate > 0)
      .sort((a, b) => b.overstockRate - a.overstockRate)
      .slice(0, 10);

    const locationSnapshots = products.slice(0, 5).map((product) => {
      const inventory = listInventoryForSku(product.sku);
      return {
        sku: product.sku,
        name: product.name,
        locations: inventory.map((entry) => ({
          warehouseCode: entry.warehouseCode,
          locationCode: entry.locationCode,
          onHand: entry.onHand,
          reserved: entry.reserved,
        })),
      };
    });

    return reply.send({
      generatedAt: new Date().toISOString(),
      summary: {
        skuCount,
        shortageSkuCount,
        shortageRate: Number((shortageRate * 100).toFixed(1)),
        totalOnHand,
        totalReserved,
        totalAvailable,
        avgDaysOfSupply,
        inventoryTurnover,
        serviceLevelPercent,
      },
      riskDistribution,
      warehouseTotals,
      movementHistory,
      insights: {
        shortages: topShortages,
        overstock: topOverstock,
        sampleLocations: locationSnapshots,
      },
    });
  });

  server.get('/analysis', async (request, reply) => {
    const query = (request.query ?? {}) as {
      from?: string;
      to?: string;
      warehouseCode?: string;
      groupBy?: string;
      sku?: string;
    };

    let range: AnalysisRange;
    try {
      range = parseAnalysisRange(query);
    } catch (error) {
      return reply.status(400).send({ error: (error as Error).message });
    }

    const scope =
      typeof query.warehouseCode === 'string' && query.warehouseCode.trim() ? query.warehouseCode.trim() : null;
    const groupBy = resolveGroupBy(range, typeof query.groupBy === 'string' ? query.groupBy : undefined);
    const skuCandidate =
      typeof query.sku === 'string' && query.sku.trim().length > 0 ? normalizeSku(query.sku) : null;

    const products = __getProductRecords();
    const scopedProducts =
      skuCandidate !== null
        ? products.filter((product) => normalizeSku(product.sku) === skuCandidate)
        : products;
    const movementPoints = getDailyMovementHistory({
      from: range.from,
      to: range.to,
      warehouseCode: scope ?? undefined,
      sku: skuCandidate ?? undefined,
    });
    const dailySeries = zeroFillDailySeries(range, movementPoints);
    const totals = summarizeMovementTotals({
      from: range.from,
      to: range.to,
      warehouseCode: scope ?? undefined,
      sku: skuCandidate ?? undefined,
    });

    const currentTotals = aggregateTotalsForWarehouse(scopedProducts, scope);

    const totalNet = dailySeries.reduce((sum, point) => sum + point.net, 0);
    const startingOnHand = currentTotals.onHand - totalNet;
    const stockSeries = buildStockTrajectory(dailySeries, startingOnHand, currentTotals.reserved, currentTotals.safetyStock);
    const periodSeries = groupDailySeries(
      dailySeries,
      groupBy,
      startingOnHand,
      currentTotals.reserved,
      currentTotals.safetyStock,
    );

    const avgDailyOutbound = range.dayCount > 0 ? totals.outbound / range.dayCount : 0;
    const stockoutEtaDays = avgDailyOutbound > 0 ? currentTotals.available / avgDailyOutbound : null;
    const projectedStockoutDate = computeProjectedStockoutDate(currentTotals.available, avgDailyOutbound);

    return reply.send({
      generatedAt: new Date().toISOString(),
      range: {
        from: range.from,
        to: range.to,
        dayCount: range.dayCount,
        groupBy,
      },
      scope: {
        warehouseCode: scope,
        sku: skuCandidate,
      },
      totals: {
        inbound: totals.inbound,
        outbound: totals.outbound,
        adjustments: totals.adjustments,
        net: totals.inbound - totals.outbound + totals.adjustments,
        currentOnHand: currentTotals.onHand,
        currentReserved: currentTotals.reserved,
        currentAvailable: currentTotals.available,
        safetyStock: currentTotals.safetyStock,
        avgDailyOutbound,
        stockoutEtaDays,
        projectedStockoutDate,
      },
      movementSeries: dailySeries.map(({ date, inbound, outbound, adjustments }) => ({
        date,
        inbound,
        outbound,
        adjustments,
      })),
      stockSeries,
      periodSeries,
    });
  });

  server.get('/warehouse-items', async (request, reply) => {
    const query = (request.query ?? {}) as {
      from?: string;
      to?: string;
      warehouseCode?: string;
    };

    const warehouseCode =
      typeof query.warehouseCode === 'string' && query.warehouseCode.trim() ? query.warehouseCode.trim() : null;

    if (!warehouseCode) {
      return reply.status(400).send({ error: 'warehouseCode is required' });
    }

    let range: AnalysisRange;
    try {
      range = parseAnalysisRange(query);
    } catch (error) {
      return reply.status(400).send({ error: (error as Error).message });
    }

    const products = __getProductRecords();

    const movementPoints = getDailyMovementHistory({
      from: range.from,
      to: range.to,
      warehouseCode,
    });
    const dailySeries = zeroFillDailySeries(range, movementPoints);

    const inboundTotal = dailySeries.reduce((sum, point) => sum + point.inbound, 0);
    const outboundTotal = dailySeries.reduce((sum, point) => sum + point.outbound, 0);

    const warehouseTotals = aggregateTotalsForWarehouse(products, warehouseCode);
    const avgDailyOutbound = range.dayCount > 0 ? outboundTotal / range.dayCount : 0;
    const stockoutEtaDays = avgDailyOutbound > 0 ? warehouseTotals.available / avgDailyOutbound : null;
    const projectedStockoutDate = computeProjectedStockoutDate(warehouseTotals.available, avgDailyOutbound);

    const items = products
      .map((product) => {
        const summary = summarizeProductForWarehouse(product, warehouseCode);
        const hasInventory = summary.onHand > 0 || summary.reserved > 0 || summary.available > 0;
        const skuSeriesRaw = getDailyMovementHistory({
          from: range.from,
          to: range.to,
          warehouseCode,
          sku: product.sku,
        });
        const skuSeries = zeroFillDailySeries(range, skuSeriesRaw);
        const skuInbound = skuSeries.reduce((sum, point) => sum + point.inbound, 0);
        const skuOutbound = skuSeries.reduce((sum, point) => sum + point.outbound, 0);
        if (!hasInventory && skuInbound === 0 && skuOutbound === 0) {
          return null;
        }
        const avgDailyInboundSku = range.dayCount > 0 ? skuInbound / range.dayCount : 0;
        const avgDailyOutboundSku = range.dayCount > 0 ? skuOutbound / range.dayCount : 0;
        const stockoutEtaSku = avgDailyOutboundSku > 0 ? summary.available / avgDailyOutboundSku : null;
        const projectedStockoutDateSku = computeProjectedStockoutDate(summary.available, avgDailyOutboundSku);
        const safetyStock = computeSafetyStock(product);
        return {
          sku: product.sku,
          name: product.name,
          category: product.category,
          onHand: summary.onHand,
          reserved: summary.reserved,
          available: summary.available,
          inbound: skuInbound,
          outbound: skuOutbound,
          safetyStock,
          avgDailyInbound: avgDailyInboundSku,
          avgDailyOutbound: avgDailyOutboundSku,
          stockoutEtaDays: stockoutEtaSku,
          projectedStockoutDate: projectedStockoutDateSku,
          trend: skuSeries.map(({ date, outbound }) => ({ date, outbound })),
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort((a, b) => {
        if (b.outbound !== a.outbound) {
          return b.outbound - a.outbound;
        }
        return b.available - a.available;
      });

    return reply.send({
      generatedAt: new Date().toISOString(),
      warehouseCode,
      range: {
        from: range.from,
        to: range.to,
        dayCount: range.dayCount,
      },
      totals: {
        inbound: inboundTotal,
        outbound: outboundTotal,
        avgDailyInbound: range.dayCount > 0 ? inboundTotal / range.dayCount : 0,
        avgDailyOutbound,
        onHand: warehouseTotals.onHand,
        reserved: warehouseTotals.reserved,
        available: warehouseTotals.available,
        safetyStock: warehouseTotals.safetyStock,
        stockoutEtaDays,
        projectedStockoutDate,
      },
      movementSeries: dailySeries.map(({ date, inbound, outbound, adjustments }) => ({
        date,
        inbound,
        outbound,
        adjustments,
      })),
      items,
    });
  });
}

