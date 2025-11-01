import type { MovementRecord } from '../routes/movements.js';

type MovementTotals = { inbound: number; outbound: number; adjustments: number };

type WarehouseMovementBucket = MovementTotals & {
  bySku: Map<string, MovementTotals>;
};

type MovementBucket = MovementTotals & {
  date: string;
  bySku: Map<string, MovementTotals>;
  byWarehouse: Map<string, WarehouseMovementBucket>;
};

const dailyBuckets = new Map<string, MovementBucket>();

const toDateKey = (iso: string | undefined): string => {
  if (!iso) {
    return new Date().toISOString().slice(0, 10);
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }

  return date.toISOString().slice(0, 10);
};

const ensureBucket = (dateKey: string): MovementBucket => {
  const existing = dailyBuckets.get(dateKey);
  if (existing) {
    return existing;
  }

  const created: MovementBucket = {
    date: dateKey,
    inbound: 0,
    outbound: 0,
    adjustments: 0,
    bySku: new Map(),
    byWarehouse: new Map(),
  };
  dailyBuckets.set(dateKey, created);
  return created;
};

const applyTotals = (target: MovementTotals, inbound: number, outbound: number, adjustments: number) => {
  target.inbound += inbound;
  target.outbound += outbound;
  target.adjustments += adjustments;
};

const ensureSkuBucket = (map: Map<string, MovementTotals>, sku: string): MovementTotals => {
  const existing = map.get(sku);
  if (existing) {
    return existing;
  }
  const created: MovementTotals = { inbound: 0, outbound: 0, adjustments: 0 };
  map.set(sku, created);
  return created;
};

const ensureWarehouseBucket = (bucket: MovementBucket, warehouseCode: string): WarehouseMovementBucket => {
  const existing = bucket.byWarehouse.get(warehouseCode);
  if (existing) {
    return existing;
  }
  const created: WarehouseMovementBucket = {
    inbound: 0,
    outbound: 0,
    adjustments: 0,
    bySku: new Map(),
  };
  bucket.byWarehouse.set(warehouseCode, created);
  return created;
};

const recordWarehouseMovement = (
  bucket: MovementBucket,
  warehouseCode: string | undefined,
  sku: string,
  inbound: number,
  outbound: number,
  adjustments: number,
) => {
  if (!warehouseCode) {
    return;
  }

  const warehouseBucket = ensureWarehouseBucket(bucket, warehouseCode);
  applyTotals(warehouseBucket, inbound, outbound, adjustments);
  const skuBucket = ensureSkuBucket(warehouseBucket.bySku, sku);
  applyTotals(skuBucket, inbound, outbound, adjustments);
};

export function recordMovementForAnalytics(movement: MovementRecord): void {
  const dateKey = toDateKey(movement.occurredAt ?? movement.createdAt);
  const bucket = ensureBucket(dateKey);

  let inbound = 0;
  let outbound = 0;
  let adjustments = 0;

  switch (movement.type) {
    case 'RECEIPT': {
      inbound = movement.qty;
      recordWarehouseMovement(bucket, movement.toWarehouse, movement.sku, movement.qty, 0, 0);
      break;
    }
    case 'ISSUE': {
      outbound = movement.qty;
      recordWarehouseMovement(bucket, movement.fromWarehouse, movement.sku, 0, movement.qty, 0);
      break;
    }
    case 'TRANSFER': {
      inbound = movement.qty;
      outbound = movement.qty;
      recordWarehouseMovement(bucket, movement.fromWarehouse, movement.sku, 0, movement.qty, 0);
      recordWarehouseMovement(bucket, movement.toWarehouse, movement.sku, movement.qty, 0, 0);
      break;
    }
    case 'ADJUST': {
      adjustments = movement.qty;
      const targetWarehouse = movement.toWarehouse ?? movement.fromWarehouse;
      recordWarehouseMovement(bucket, targetWarehouse, movement.sku, 0, 0, movement.qty);
      break;
    }
    default:
      break;
  }

  applyTotals(bucket, inbound, outbound, adjustments);
  const skuBucket = ensureSkuBucket(bucket.bySku, movement.sku);
  applyTotals(skuBucket, inbound, outbound, adjustments);
}

const toTimestamp = (value: string | Date | undefined | null): number | null => {
  if (!value) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.getTime();
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

export interface MovementHistoryOptions {
  days?: number;
  sku?: string;
  warehouseCode?: string;
  from?: string | Date;
  to?: string | Date;
}

export interface MovementHistoryPoint {
  date: string;
  inbound: number;
  outbound: number;
  adjustments: number;
}

const shouldIncludeBucket = (
  bucket: MovementBucket,
  rangeStart: number | null,
  rangeEnd: number | null,
  limitStart: number | null,
) => {
  const bucketTime = Date.parse(bucket.date);
  if (Number.isNaN(bucketTime)) {
    return false;
  }

  if (rangeStart !== null && bucketTime < rangeStart) {
    return false;
  }

  if (rangeEnd !== null && bucketTime > rangeEnd) {
    return false;
  }

  if (limitStart !== null && bucketTime < limitStart) {
    return false;
  }

  return true;
};

export function getDailyMovementHistory(options: MovementHistoryOptions = {}): MovementHistoryPoint[] {
  const { days, sku, warehouseCode, from, to } = options;

  const limitStart = days && days > 0 ? Date.now() - days * 24 * 60 * 60 * 1000 : null;
  const rangeStart = toTimestamp(from);
  const rangeEnd = toTimestamp(to);

  return Array.from(dailyBuckets.values())
    .filter((bucket) => shouldIncludeBucket(bucket, rangeStart, rangeEnd, limitStart))
    .map((bucket) => {
      if (warehouseCode) {
        const warehouseBucket = bucket.byWarehouse.get(warehouseCode);
        if (!warehouseBucket) {
          return {
            date: bucket.date,
            inbound: 0,
            outbound: 0,
            adjustments: 0,
          };
        }

        if (sku) {
          const skuBucket = warehouseBucket.bySku.get(sku);
          return {
            date: bucket.date,
            inbound: skuBucket?.inbound ?? 0,
            outbound: skuBucket?.outbound ?? 0,
            adjustments: skuBucket?.adjustments ?? 0,
          };
        }

        return {
          date: bucket.date,
          inbound: warehouseBucket.inbound,
          outbound: warehouseBucket.outbound,
          adjustments: warehouseBucket.adjustments,
        };
      }

      if (sku) {
        const skuBucket = bucket.bySku.get(sku);
        return {
          date: bucket.date,
          inbound: skuBucket?.inbound ?? 0,
          outbound: skuBucket?.outbound ?? 0,
          adjustments: skuBucket?.adjustments ?? 0,
        };
      }

      return {
        date: bucket.date,
        inbound: bucket.inbound,
        outbound: bucket.outbound,
        adjustments: bucket.adjustments,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function summarizeMovementTotals(options: MovementHistoryOptions = {}): MovementTotals {
  return getDailyMovementHistory(options).reduce<MovementTotals>(
    (accumulator, point) => ({
      inbound: accumulator.inbound + point.inbound,
      outbound: accumulator.outbound + point.outbound,
      adjustments: accumulator.adjustments + point.adjustments,
    }),
    { inbound: 0, outbound: 0, adjustments: 0 },
  );
}

export function __resetMovementAnalytics(): void {
  dailyBuckets.clear();
}
