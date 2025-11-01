import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

import {
  listInventoryForSku,
  replaceInventoryForSku,
  summarizeInventory,
  type InventoryRecord,
} from '../stores/inventoryStore.js';
import { findWarehouseByCode } from '../stores/warehousesStore.js';
import { findLocationByCode } from '../stores/locationsStore.js';
import {
  recordMovementForAnalytics,
  __resetMovementAnalytics,
} from '../stores/movementAnalyticsStore.js';
import { __adjustProductMovementTotals } from './products.js';

type MovementType = 'RECEIPT' | 'ISSUE' | 'ADJUST' | 'TRANSFER';

type MovementPayload = {
  type: MovementType;
  sku: string;
  qty: number;
  fromWarehouse?: string;
  fromLocation?: string;
  toWarehouse?: string;
  toLocation?: string;
  partnerId?: string;
  refNo?: string;
  memo?: string;
  occurredAt?: string;
  userId: string;
};

export type MovementRecord = MovementPayload & {
  id: string;
  createdAt: string;
  occurredAt: string;
};

type InventoryBalanceRecord = {
  sku: string;
  warehouse: string;
  location?: string;
  qty: number;
  updatedAt: string;
};

type MovementQuerystring = {
  type?: MovementType;
  sku?: string;
  warehouse?: string;
  location?: string;
  partnerId?: string;
  refNo?: string;
  userId?: string;
  from?: string;
  to?: string;
  limit?: string;
  offset?: string;
};

const ALLOWED_TYPES: MovementType[] = ['RECEIPT', 'ISSUE', 'ADJUST', 'TRANSFER'];

const movementStore: MovementRecord[] = [];
const inventoryBalances = new Map<string, InventoryBalanceRecord>();

class ValidationError extends Error {
  errors: string[];

  constructor(errors: string[]) {
    super('Movement validation failed');
    this.errors = errors;
  }
}

class InventoryConflictError extends Error {}

function buildBalanceKey(sku: string, warehouse: string, location?: string) {
  return `${sku}::${warehouse}::${location ?? ''}`;
}

function cloneBalance(balance: InventoryBalanceRecord): InventoryBalanceRecord {
  return { ...balance, location: balance.location };
}

function buildInventoryStoreKey(warehouse: string, location?: string) {
  return `${warehouse}::${location ?? ''}`;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function ensureValidDate(value: string | undefined, field: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError([`${field} 필드가 올바른 날짜 형식이 아닙니다.`]);
  }
  return date.toISOString();
}

function validatePayload(input: unknown): MovementPayload {
  if (!input || typeof input !== 'object') {
    throw new ValidationError(['요청 본문이 객체가 아닙니다.']);
  }

  const candidate = input as Record<string, unknown>;
  const errors: string[] = [];

  const type = candidate.type;
  if (typeof type !== 'string' || !ALLOWED_TYPES.includes(type as MovementType)) {
    errors.push('type 필드는 RECEIPT, ISSUE, ADJUST, TRANSFER 중 하나여야 합니다.');
  }

  const skuValue = candidate.sku;
  if (typeof skuValue !== 'string' || skuValue.trim().length === 0) {
    errors.push('sku 필드는 비어있을 수 없습니다.');
  }

  const qtyValue = candidate.qty;
  if (typeof qtyValue !== 'number' || !Number.isInteger(qtyValue)) {
    errors.push('qty 필드는 정수여야 합니다.');
  } else if ((candidate.type === 'ADJUST' && qtyValue < 0) || (candidate.type !== 'ADJUST' && qtyValue <= 0)) {
    errors.push('qty 필드가 허용 범위를 벗어났습니다.');
  }

  const userIdValue = candidate.userId;
  if (typeof userIdValue !== 'string' || userIdValue.trim().length === 0) {
    errors.push('userId 필드는 비어있을 수 없습니다.');
  }

  const fromWarehouse = normalizeOptionalString(candidate.fromWarehouse);
  const toWarehouse = normalizeOptionalString(candidate.toWarehouse);

  const fromLocation = normalizeOptionalString(candidate.fromLocation);
  const toLocation = normalizeOptionalString(candidate.toLocation);

  const partnerId = normalizeOptionalString(candidate.partnerId);
  const refNo = normalizeOptionalString(candidate.refNo);
  const memo = normalizeOptionalString(candidate.memo);

  const occurredAtRaw = normalizeOptionalString(candidate.occurredAt);

  if (!errors.length && typeof type === 'string') {
    if (type === 'RECEIPT' && !toWarehouse) {
      errors.push('RECEIPT 유형에서는 toWarehouse 필드가 필요합니다.');
    }

    if (type === 'ISSUE' && !fromWarehouse) {
      errors.push('ISSUE 유형에서는 fromWarehouse 필드가 필요합니다.');
    }

    if (type === 'TRANSFER') {
      if (!fromWarehouse) {
        errors.push('TRANSFER 유형에서는 fromWarehouse 필드가 필요합니다.');
      }
      if (!toWarehouse) {
        errors.push('TRANSFER 유형에서는 toWarehouse 필드가 필요합니다.');
      }
    }

    if (type === 'ADJUST' && !toWarehouse) {
      errors.push('ADJUST 유형에서는 toWarehouse 필드가 필요합니다.');
    }
  }

  if (!errors.length) {
    if (fromWarehouse && !findWarehouseByCode(fromWarehouse)) {
      errors.push(`존재하지 않는 출고 물류센터 코드입니다: ${fromWarehouse}`);
    }
    if (toWarehouse && !findWarehouseByCode(toWarehouse)) {
      errors.push(`존재하지 않는 입고 물류센터 코드입니다: ${toWarehouse}`);
    }

    if (fromLocation) {
      const location = findLocationByCode(fromLocation);
      if (!location) {
        errors.push(`알 수 없는 출고 로케이션 코드입니다: ${fromLocation}`);
      } else if (fromWarehouse && location.warehouseCode !== fromWarehouse) {
        errors.push('출고 로케이션이 지정된 물류센터에 속하지 않습니다.');
      }
    }

    if (toLocation) {
      const location = findLocationByCode(toLocation);
      if (!location) {
        errors.push(`알 수 없는 입고 로케이션 코드입니다: ${toLocation}`);
      } else if (toWarehouse && location.warehouseCode !== toWarehouse) {
        errors.push('입고 로케이션이 지정된 물류센터에 속하지 않습니다.');
      }
    }
  }

  if (errors.length) {
    throw new ValidationError(errors);
  }

  const occurredAt = ensureValidDate(occurredAtRaw, 'occurredAt');

  return {
    type: type as MovementType,
    sku: skuValue!.trim(),
    qty: qtyValue as number,
    fromWarehouse,
    fromLocation,
    toWarehouse,
    toLocation,
    partnerId,
    refNo,
    memo,
    occurredAt,
    userId: (userIdValue as string).trim(),
  };
}

function lookupBalance(sku: string, warehouse: string, location?: string) {
  const key = buildBalanceKey(sku, warehouse, location);
  const existing = inventoryBalances.get(key);
  if (existing) {
    return { key, balance: existing };
  }

  const snapshot = listInventoryForSku(sku).find((record) => {
    const recordLocation = record.locationCode?.trim() || undefined;
    const targetLocation = location?.trim() || undefined;
    return record.warehouseCode === warehouse && recordLocation === targetLocation;
  });

  const balance: InventoryBalanceRecord = {
    sku,
    warehouse,
    location,
    qty: snapshot?.onHand ?? 0,
    updatedAt: snapshot ? new Date().toISOString() : new Date(0).toISOString(),
  };
  inventoryBalances.set(key, balance);
  return { key, balance };
}

function applyMovement(movement: MovementRecord, timestamp: string) {
  const affected: InventoryBalanceRecord[] = [];

  switch (movement.type) {
    case 'RECEIPT': {
      const warehouse = movement.toWarehouse!;
      const { key, balance } = lookupBalance(movement.sku, warehouse, movement.toLocation);
      const updated = { ...balance, qty: balance.qty + movement.qty, updatedAt: timestamp };
      inventoryBalances.set(key, updated);
      affected.push(cloneBalance(updated));
      break;
    }
    case 'ISSUE': {
      const warehouse = movement.fromWarehouse!;
      const { key, balance } = lookupBalance(movement.sku, warehouse, movement.fromLocation);
      if (balance.qty < movement.qty) {
        throw new InventoryConflictError('재고가 부족합니다.');
      }
      const updated = { ...balance, qty: balance.qty - movement.qty, updatedAt: timestamp };
      inventoryBalances.set(key, updated);
      affected.push(cloneBalance(updated));
      break;
    }
    case 'ADJUST': {
      const warehouse = movement.toWarehouse!;
      const { key } = lookupBalance(movement.sku, warehouse, movement.toLocation);
      const updated: InventoryBalanceRecord = {
        sku: movement.sku,
        warehouse,
        location: movement.toLocation,
        qty: movement.qty,
        updatedAt: timestamp,
      };
      inventoryBalances.set(key, updated);
      affected.push(cloneBalance(updated));
      break;
    }
    case 'TRANSFER': {
      const fromWarehouse = movement.fromWarehouse!;
      const toWarehouse = movement.toWarehouse!;
      const fromLookup = lookupBalance(movement.sku, fromWarehouse, movement.fromLocation);
      if (fromLookup.balance.qty < movement.qty) {
        throw new InventoryConflictError('출고 지점의 재고가 부족합니다.');
      }
      const updatedSource = {
        ...fromLookup.balance,
        qty: fromLookup.balance.qty - movement.qty,
        updatedAt: timestamp,
      } satisfies InventoryBalanceRecord;
      inventoryBalances.set(fromLookup.key, updatedSource);
      affected.push(cloneBalance(updatedSource));

      const toLookup = lookupBalance(movement.sku, toWarehouse, movement.toLocation);
      const updatedDest = {
        ...toLookup.balance,
        qty: toLookup.balance.qty + movement.qty,
        updatedAt: timestamp,
      } satisfies InventoryBalanceRecord;
      inventoryBalances.set(toLookup.key, updatedDest);
      affected.push(cloneBalance(updatedDest));
      break;
    }
    default:
      break;
  }

  return affected;
}

function syncInventoryStore(
  movement: MovementRecord,
  balances: InventoryBalanceRecord[],
) {
  const existing = listInventoryForSku(movement.sku);
  const recordsByKey = new Map<string, InventoryRecord>();

  existing.forEach((record) => {
    recordsByKey.set(buildInventoryStoreKey(record.warehouseCode, record.locationCode), { ...record });
  });

  balances.forEach((balance) => {
    const locationCode = balance.location ?? '';
    const key = buildInventoryStoreKey(balance.warehouse, locationCode);
    const current = recordsByKey.get(key);
    recordsByKey.set(key, {
      sku: movement.sku,
      warehouseCode: balance.warehouse,
      locationCode,
      onHand: Math.max(0, balance.qty),
      reserved: current?.reserved ?? 0,
    });
  });

  const nextRecords = Array.from(recordsByKey.values());
  replaceInventoryForSku(
    movement.sku,
    nextRecords.map((record) => ({ ...record })),
  );

  return summarizeInventory(movement.sku);
}

function getMovementTotalsDelta(movement: MovementRecord) {
  switch (movement.type) {
    case 'RECEIPT':
      return { inbound: movement.qty, outbound: 0 };
    case 'ISSUE':
      return { inbound: 0, outbound: movement.qty };
    case 'TRANSFER':
      return { inbound: movement.qty, outbound: movement.qty };
    default:
      return { inbound: 0, outbound: 0 };
  }
}

function compareMovements(a: MovementRecord, b: MovementRecord) {
  const aTime = Date.parse(a.occurredAt);
  const bTime = Date.parse(b.occurredAt);
  if (aTime !== bTime) {
    return bTime - aTime;
  }

  const aCreated = Date.parse(a.createdAt);
  const bCreated = Date.parse(b.createdAt);
  return bCreated - aCreated;
}

function parseQueryDates(query: MovementQuerystring) {
  let from: number | undefined;
  let to: number | undefined;

  if (query.from) {
    const parsed = Date.parse(query.from);
    if (Number.isNaN(parsed)) {
      throw new ValidationError(['from 파라미터가 올바른 날짜 형식이 아닙니다.']);
    }
    from = parsed;
  }

  if (query.to) {
    const parsed = Date.parse(query.to);
    if (Number.isNaN(parsed)) {
      throw new ValidationError(['to 파라미터가 올바른 날짜 형식이 아닙니다.']);
    }
    to = parsed;
  }

  return { from, to };
}

export default async function movementRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: unknown }>('/', async (request, reply) => {
    let payload: MovementPayload;
    try {
      payload = validatePayload(request.body);
    } catch (error) {
      if (error instanceof ValidationError) {
        return reply.status(400).send({ errors: error.errors });
      }
      throw error;
    }

    const createdAt = new Date().toISOString();
    const occurredAt = payload.occurredAt ?? createdAt;

    const movement: MovementRecord = {
      ...payload,
      id: randomUUID(),
      createdAt,
      occurredAt,
    };

    let affectedBalances: InventoryBalanceRecord[];
    try {
      affectedBalances = applyMovement(movement, createdAt);
    } catch (error) {
      if (error instanceof InventoryConflictError) {
        return reply.status(409).send({ message: error.message });
      }
      throw error;
    }

    movementStore.push(movement);
    recordMovementForAnalytics(movement);

    const inventory = syncInventoryStore(movement, affectedBalances);
    const { inbound, outbound } = getMovementTotalsDelta(movement);
    if (inbound > 0 || outbound > 0) {
      __adjustProductMovementTotals(movement.sku, { inbound, outbound });
    }

    return reply.status(201).send({ movement, balances: affectedBalances, inventory });
  });

  fastify.get<{ Querystring: MovementQuerystring }>('/', async (request, reply) => {
    let parsedDates: { from?: number; to?: number };
    try {
      parsedDates = parseQueryDates(request.query);
    } catch (error) {
      if (error instanceof ValidationError) {
        return reply.status(400).send({ errors: error.errors });
      }
      throw error;
    }

    const limit = request.query.limit ? Number.parseInt(request.query.limit, 10) : 100;
    const offset = request.query.offset ? Number.parseInt(request.query.offset, 10) : 0;
    const safeLimit = Number.isFinite(limit) && limit > 0 ? Math.min(limit, 500) : 100;
    const safeOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0;

    const filtered = movementStore.filter((movement) => {
      if (request.query.type && movement.type !== request.query.type) return false;
      if (request.query.sku && movement.sku !== request.query.sku) return false;
      if (request.query.partnerId && movement.partnerId !== request.query.partnerId) return false;
      if (request.query.refNo && movement.refNo !== request.query.refNo) return false;
      if (request.query.userId && movement.userId !== request.query.userId) return false;

      if (request.query.warehouse) {
        const matchWarehouse =
          movement.fromWarehouse === request.query.warehouse || movement.toWarehouse === request.query.warehouse;
        if (!matchWarehouse) return false;
      }

      if (request.query.location) {
        const matchLocation =
          movement.fromLocation === request.query.location || movement.toLocation === request.query.location;
        if (!matchLocation) return false;
      }

      if (parsedDates.from !== undefined && Date.parse(movement.occurredAt) < parsedDates.from) {
        return false;
      }

      if (parsedDates.to !== undefined && Date.parse(movement.occurredAt) > parsedDates.to) {
        return false;
      }

      return true;
    });

    const sorted = [...filtered].sort(compareMovements);
    const total = sorted.length;
    const paginated = sorted.slice(safeOffset, safeOffset + safeLimit);

    return reply.send({
      total,
      count: paginated.length,
      offset: safeOffset,
      limit: safeLimit,
      items: paginated.map((item) => ({ ...item })),
      balances: Array.from(inventoryBalances.values()).map((balance) => cloneBalance(balance)),
    });
  });
}

export function __resetMovementStore() {
  movementStore.splice(0, movementStore.length);
  inventoryBalances.clear();
  __resetMovementAnalytics();
}
