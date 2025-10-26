import type { MovementRecord } from '../routes/movements.js';

type MovementBucket = {
  date: string;
  inbound: number;
  outbound: number;
  adjustments: number;
  bySku: Map<string, { inbound: number; outbound: number; adjustments: number }>;
};

const dailyBuckets = new Map<string, MovementBucket>();

const toDateKey = (iso: string): string => {
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
  };
  dailyBuckets.set(dateKey, created);
  return created;
};

const applyToSkuBucket = (
  bucket: MovementBucket,
  sku: string,
  inbound: number,
  outbound: number,
  adjustments: number,
) => {
  const current = bucket.bySku.get(sku) ?? { inbound: 0, outbound: 0, adjustments: 0 };
  current.inbound += inbound;
  current.outbound += outbound;
  current.adjustments += adjustments;
  bucket.bySku.set(sku, current);
};

export function recordMovementForAnalytics(movement: MovementRecord): void {
  const dateKey = toDateKey(movement.occurredAt ?? movement.createdAt);
  const bucket = ensureBucket(dateKey);

  let inbound = 0;
  let outbound = 0;
  let adjustments = 0;

  switch (movement.type) {
    case 'RECEIPT':
      inbound = movement.qty;
      break;
    case 'ISSUE':
      outbound = movement.qty;
      break;
    case 'TRANSFER':
      inbound = movement.qty;
      outbound = movement.qty;
      break;
    case 'ADJUST':
      adjustments = movement.qty;
      break;
    default:
      break;
  }

  bucket.inbound += inbound;
  bucket.outbound += outbound;
  bucket.adjustments += adjustments;
  applyToSkuBucket(bucket, movement.sku, inbound, outbound, adjustments);
}

export interface MovementHistoryOptions {
  days?: number;
  sku?: string;
}

export interface MovementHistoryPoint {
  date: string;
  inbound: number;
  outbound: number;
  adjustments: number;
}

export function getDailyMovementHistory(options: MovementHistoryOptions = {}): MovementHistoryPoint[] {
  const { days, sku } = options;
  const limitStart = days && days > 0 ? Date.now() - days * 24 * 60 * 60 * 1000 : null;

  return Array.from(dailyBuckets.values())
    .filter((bucket) => {
      if (limitStart === null) {
        return true;
      }
      const bucketTime = Date.parse(bucket.date);
      return !Number.isNaN(bucketTime) && bucketTime >= limitStart;
    })
    .map((bucket) => {
      if (!sku) {
        return {
          date: bucket.date,
          inbound: bucket.inbound,
          outbound: bucket.outbound,
          adjustments: bucket.adjustments,
        };
      }

      const skuBucket = bucket.bySku.get(sku);
      return {
        date: bucket.date,
        inbound: skuBucket?.inbound ?? 0,
        outbound: skuBucket?.outbound ?? 0,
        adjustments: skuBucket?.adjustments ?? 0,
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function __resetMovementAnalytics(): void {
  dailyBuckets.clear();
}
