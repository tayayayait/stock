import type { FastifyInstance } from 'fastify';

import { listInventoryForSku } from '../stores/inventoryStore.js';
import {
  getDailyMovementHistory,
  type MovementHistoryPoint,
} from '../stores/movementAnalyticsStore.js';
import { __getProductRecords } from './products.js';

type RiskLabel = '정상' | '결품위험' | '과잉';

const RISK_ORDER: RiskLabel[] = ['정상', '결품위험', '과잉'];
const SAFETY_DAYS = 12;
const DEFAULT_MOVEMENT_WINDOW_DAYS = 60;
const TREND_WINDOW_DAYS = 7;

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

    const shortageSkuCount = products.filter((product) => product.risk === '결품위험').length;
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

    const safetyStockFor = (product: (typeof products)[number]) =>
      Math.round(Math.max(product.dailyAvg, 0) * SAFETY_DAYS);

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
}
