import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

import {
  ensureWarehouseSeedData,
  findWarehouseByCode,
} from '../stores/warehousesStore.js';
import {
  ensureLocationSeedData,
  findLocationByCode,
} from '../stores/locationsStore.js';
import {
  deleteInventoryForSku,
  listInventoryForSku,
  replaceInventoryForSku,
  summarizeInventory,
  __resetInventoryStore,
} from '../stores/inventoryStore.js';

type InventoryRisk = '정상' | '결품위험' | '과잉';
type AbcGrade = 'A' | 'B' | 'C';
type XyzGrade = 'X' | 'Y' | 'Z';

interface InventoryRequestItem {
  warehouseCode: string;
  locationCode: string;
  onHand?: number;
  reserved?: number;
}

interface InventoryEntry {
  warehouseCode: string;
  locationCode: string;
  onHand: number;
  reserved: number;
}

export interface ProductPayload {
  productId?: string;
  legacyProductId?: number;
  sku: string;
  imageUrl?: string;
  name: string;
  category: string;
  subCategory?: string;
  brand?: string;
  unit?: string;
  packCase?: string | null;
  pack?: number;
  casePack?: number;
  abcGrade: AbcGrade;
  xyzGrade: XyzGrade;
  bufferRatio?: number;
  dailyAvg: number;
  dailyStd: number;
  totalInbound?: number;
  totalOutbound?: number;
  avgOutbound7d?: number;
  isActive?: boolean;
  onHand?: number;
  reserved?: number;
  risk?: InventoryRisk;
  expiryDays?: number;
  supplyPrice?: number;
  salePrice?: number;
  inventory?: InventoryRequestItem[];
}

interface ProductRecord {
  productId: string;
  legacyProductId: number;
  sku: string;
  imageUrl: string | null;
  name: string;
  category: string;
  subCategory: string;
  brand: string | null;
  unit: string;
  packCase: string;
  pack: number;
  casePack: number;
  abcGrade: AbcGrade;
  xyzGrade: XyzGrade;
  bufferRatio: number;
  dailyAvg: number;
  dailyStd: number;
  totalInbound: number;
  totalOutbound: number;
  avgOutbound7d: number;
  isActive: boolean;
  risk: InventoryRisk;
  expiryDays: number | null;
  supplyPrice: number | null;
  salePrice: number | null;
  createdAt: string;
  updatedAt: string;
}

type ProductResponse = ProductRecord & {
  onHand: number;
  reserved: number;
  inventory: InventoryEntry[];
};

type ValidatedProductPayload = ProductPayload & {
  pack: number;
  casePack: number;
  imageUrl?: string;
  totalInbound: number;
  totalOutbound: number;
  avgOutbound7d: number;
  supplyPrice: number | null;
  salePrice: number | null;
  inventory?: InventoryEntry[];
};

type ValidationResult =
  | { success: true; value: ValidatedProductPayload }
  | { success: false; errors: string[] };

const productStore = new Map<string, ProductRecord>();
let productSequence = 100;
let autoSeed = true;

const DEFAULT_UNIT = 'EA';
const DEFAULT_BUFFER_RATIO = 0.2;

const allowedRisk: InventoryRisk[] = ['정상', '결품위험', '과잉'];
const allowedAbc: AbcGrade[] = ['A', 'B', 'C'];
const allowedXyz: XyzGrade[] = ['X', 'Y', 'Z'];

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const sanitizePriceValue = (value: unknown): number | null => {
  if (!isFiniteNumber(value)) {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }

  return Math.round(numeric * 100) / 100;
};

const parsePackCase = (packCase: string): { pack: number; casePack: number } => {
  const [packRaw, caseRaw] = packCase.split('/').map((part) => part.trim());
  const pack = Number.parseInt(packRaw ?? '', 10);
  const casePack = Number.parseInt(caseRaw ?? '', 10);
  const safePack = Number.isFinite(pack) && pack > 0 ? pack : 1;
  const safeCase = Number.isFinite(casePack) && casePack > 0 ? casePack : safePack;
  return { pack: safePack, casePack: safeCase };
};

function normalizeString(value: unknown): string {
  if (!value || typeof value !== 'string') {
    return '';
  }

  return value.trim();
}

function formatPackCase(pack: number, casePack: number): string {
  const safePack = Number.isFinite(pack) && pack > 0 ? Math.floor(pack) : 1;
  const safeCase = Number.isFinite(casePack) && casePack > 0 ? Math.floor(casePack) : safePack;
  return `${safePack}/${safeCase}`;
}

export function validateProductPayload(input: unknown): ValidationResult {
  if (typeof input !== 'object' || input === null) {
    return { success: false, errors: ['요청 본문이 객체가 아닙니다.'] };
  }

  const candidate = input as Record<string, unknown>;
  const errors: string[] = [];

  ensureWarehouseSeedData();
  ensureLocationSeedData();

  const requiredStrings: Array<keyof ProductPayload> = ['sku', 'name', 'category'];
  requiredStrings.forEach((field) => {
    if (!isNonEmptyString(candidate[field])) {
      errors.push(`${String(field)} 필드는 비어있을 수 없습니다.`);
    }
  });

  if (candidate.brand !== undefined && typeof candidate.brand !== 'string') {
    errors.push('brand 필드는 문자열이어야 합니다.');
  }

  if (candidate.imageUrl !== undefined && typeof candidate.imageUrl !== 'string') {
    errors.push('imageUrl 필드는 문자열이어야 합니다.');
  }

  if (candidate.unit !== undefined && typeof candidate.unit !== 'string') {
    errors.push('unit 필드는 문자열이어야 합니다.');
  }

  if (candidate.packCase !== undefined && typeof candidate.packCase !== 'string') {
    errors.push('packCase 필드는 문자열이어야 합니다.');
  }

  if (candidate.isActive !== undefined && !isBoolean(candidate.isActive)) {
    errors.push('isActive 필드는 불리언이어야 합니다.');
  }

  if (candidate.bufferRatio !== undefined) {
    if (!isFiniteNumber(candidate.bufferRatio)) {
      errors.push('bufferRatio 필드는 숫자여야 합니다.');
    } else if ((candidate.bufferRatio as number) < 0 || (candidate.bufferRatio as number) > 1) {
      errors.push('bufferRatio 필드는 0 이상 1 이하이어야 합니다.');
    }
  }

  const numericFields: Array<keyof ProductPayload> = ['dailyAvg', 'dailyStd'];

  numericFields.forEach((field) => {
    if (!isFiniteNumber(candidate[field])) {
      errors.push(`${String(field)} 필드는 숫자여야 합니다.`);
      return;
    }

    if ((candidate[field] as number) < 0) {
      errors.push(`${String(field)} 필드는 0 이상이어야 합니다.`);
    }
  });

  const optionalNumeric: Array<keyof ProductPayload> = [
    'onHand',
    'reserved',
    'totalInbound',
    'totalOutbound',
    'avgOutbound7d',
    'expiryDays',
    'supplyPrice',
    'salePrice',
  ];
  optionalNumeric.forEach((field) => {
    if (candidate[field] === undefined) {
      return;
    }
    if (!isFiniteNumber(candidate[field])) {
      errors.push(`${String(field)} 필드는 숫자여야 합니다.`);
    } else if ((candidate[field] as number) < 0) {
      errors.push(`${String(field)} 필드는 0 이상이어야 합니다.`);
    }
  });

  const grades: Array<[keyof ProductPayload, readonly string[]]> = [
    ['abcGrade', allowedAbc],
    ['xyzGrade', allowedXyz],
  ];

  grades.forEach(([field, allowed]) => {
    if (!isNonEmptyString(candidate[field])) {
      errors.push(`${String(field)} 필드는 비어있을 수 없습니다.`);
      return;
    }

    if (!allowed.includes((candidate[field] as string).toUpperCase())) {
      errors.push(`${String(field)} 필드는 ${allowed.join(', ')} 중 하나여야 합니다.`);
    }
  });

  if (candidate.risk !== undefined) {
    if (!isNonEmptyString(candidate.risk)) {
      errors.push('risk 필드는 비어있을 수 없습니다.');
    } else if (!allowedRisk.includes(candidate.risk as InventoryRisk)) {
      errors.push(`risk 필드는 ${allowedRisk.join(', ')} 중 하나여야 합니다.`);
    }
  }

  const packCaseValue = normalizeString(candidate.packCase);
  const { pack, casePack } = parsePackCase(packCaseValue);

  let inventoryProvided = false;
  const inventoryEntries: InventoryEntry[] = [];
  if ('inventory' in candidate) {
    inventoryProvided = true;
    if (!Array.isArray(candidate.inventory)) {
      errors.push('inventory 필드는 배열이어야 합니다.');
    } else {
      const seen = new Set<string>();
      (candidate.inventory as unknown[]).forEach((item, index) => {
        if (typeof item !== 'object' || item === null) {
          errors.push(`inventory[${index}] 항목이 유효하지 않습니다.`);
          return;
        }

        const raw = item as Record<string, unknown>;
        const warehouseCode = normalizeString(raw.warehouseCode);
        const locationCode = normalizeString(raw.locationCode);
        const onHandValue = raw.onHand;
        const reservedValue = raw.reserved;

        if (!warehouseCode) {
          errors.push(`inventory[${index}].warehouseCode 필드는 비어있을 수 없습니다.`);
        }
        if (!locationCode) {
          errors.push(`inventory[${index}].locationCode 필드는 비어있을 수 없습니다.`);
        }

        if (warehouseCode && !findWarehouseByCode(warehouseCode)) {
          errors.push(`inventory[${index}].warehouseCode 에 해당하는 물류센터가 없습니다.`);
        }

        if (locationCode) {
          const location = findLocationByCode(locationCode);
          if (!location) {
            errors.push(`inventory[${index}].locationCode 에 해당하는 로케이션이 없습니다.`);
          } else if (warehouseCode && location.warehouseCode !== warehouseCode) {
            errors.push(
              `inventory[${index}] 로케이션의 물류센터 코드가 일치하지 않습니다. (${location.warehouseCode})`,
            );
          }
        }

        const key = `${warehouseCode}::${locationCode}`;
        if (warehouseCode && locationCode) {
          if (seen.has(key)) {
            errors.push(`inventory 항목에 중복된 로케이션(${warehouseCode}/${locationCode})이 있습니다.`);
          } else {
            seen.add(key);
          }
        }

        if (onHandValue !== undefined && !isFiniteNumber(onHandValue)) {
          errors.push(`inventory[${index}].onHand 필드는 숫자여야 합니다.`);
        }

        if (reservedValue !== undefined && !isFiniteNumber(reservedValue)) {
          errors.push(`inventory[${index}].reserved 필드는 숫자여야 합니다.`);
        }

        if (warehouseCode && locationCode) {
          const onHand = Math.max(0, Math.round((onHandValue as number) ?? 0));
          const reserved = Math.max(0, Math.round((reservedValue as number) ?? 0));
          inventoryEntries.push({ warehouseCode, locationCode, onHand, reserved });
        }
      });
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  const value: ValidatedProductPayload = {
    productId:
      typeof candidate.productId === 'string' && candidate.productId
        ? candidate.productId
        : undefined,
    legacyProductId: Number.isInteger(candidate.legacyProductId)
      ? (candidate.legacyProductId as number)
      : undefined,
    sku: normalizeString(candidate.sku),
    name: normalizeString(candidate.name),
    category: normalizeString(candidate.category),
    subCategory: normalizeString(candidate.subCategory),
    unit: normalizeString(candidate.unit) || DEFAULT_UNIT,
    packCase: packCaseValue ? formatPackCase(pack, casePack) : '',
    pack,
    casePack,
    abcGrade: (candidate.abcGrade as string).toUpperCase() as AbcGrade,
    xyzGrade: (candidate.xyzGrade as string).toUpperCase() as XyzGrade,
    bufferRatio: Math.min(1, Math.max(0, (candidate.bufferRatio as number) ?? DEFAULT_BUFFER_RATIO)),
    dailyAvg: Math.max(0, Math.round(candidate.dailyAvg as number)),
    dailyStd: Math.max(0, Math.round(candidate.dailyStd as number)),
    totalInbound: Math.max(0, Math.round((candidate.totalInbound as number) ?? 0)),
    totalOutbound: Math.max(0, Math.round((candidate.totalOutbound as number) ?? 0)),
    avgOutbound7d: Math.max(0, Math.round((candidate.avgOutbound7d as number) ?? 0)),
    isActive: typeof candidate.isActive === 'boolean' ? (candidate.isActive as boolean) : true,
    onHand: Math.max(0, Math.round((candidate.onHand as number) ?? 0)),
    reserved: Math.max(0, Math.round((candidate.reserved as number) ?? 0)),
    risk: (candidate.risk as InventoryRisk) ?? '정상',
    imageUrl: normalizeString(candidate.imageUrl) || undefined,
    supplyPrice: sanitizePriceValue(candidate.supplyPrice),
    salePrice: sanitizePriceValue(candidate.salePrice),
    inventory: inventoryProvided ? inventoryEntries : undefined,
  };

  if (Object.prototype.hasOwnProperty.call(candidate, 'brand')) {
    const brandValue = normalizeString(candidate.brand);
    value.brand = brandValue ? brandValue : undefined;
  }

  if (Object.prototype.hasOwnProperty.call(candidate, 'expiryDays') && isFiniteNumber(candidate.expiryDays)) {
    value.expiryDays = Math.max(0, Math.round(candidate.expiryDays as number));
  }

  return { success: true, value };
}

function toResponse(record: ProductRecord): ProductResponse {
  const summary = summarizeInventory(record.sku);
  const inventory = summary.items
    .slice()
    .sort((a, b) => {
      if (a.warehouseCode === b.warehouseCode) {
        return a.locationCode.localeCompare(b.locationCode);
      }
      return a.warehouseCode.localeCompare(b.warehouseCode);
    })
    .map(({ warehouseCode, locationCode, onHand, reserved }) => ({
      warehouseCode,
      locationCode,
      onHand,
      reserved,
    }));

  return {
    ...record,
    onHand: summary.totalOnHand,
    reserved: summary.totalReserved,
    inventory,
  };
}

function ensureSeedData() {
  if (!autoSeed) {
    return;
  }

  if (productStore.size > 0) {
    return;
  }

  ensureWarehouseSeedData();
  ensureLocationSeedData();

  const seedProducts: Array<Omit<ValidatedProductPayload, 'inventory'> & { inventory: InventoryEntry[] }> = [];

  seedProducts.forEach((sample) => {
    const now = new Date().toISOString();
    const { inventory, ...product } = sample;
    const record: ProductRecord = {
      ...product,
      productId: sample.productId ?? randomUUID(),
      legacyProductId: sample.legacyProductId ?? ++productSequence,
      packCase: sample.packCase ? formatPackCase(sample.pack, sample.casePack) : '',
      createdAt: now,
      updatedAt: now,
    };
    productStore.set(record.sku, record);

    replaceInventoryForSku(
      record.sku,
      inventory.map((entry) => ({
        sku: record.sku,
        warehouseCode: entry.warehouseCode,
        locationCode: entry.locationCode,
        onHand: entry.onHand,
        reserved: entry.reserved,
      })),
    );
  });
}

export default async function productsRoutes(server: FastifyInstance) {
  ensureSeedData();

  server.get('/', async (request, reply) => {
    const { q } = (request.query ?? {}) as { q?: string };
    const keyword = q?.trim().toLowerCase();
    const items = Array.from(productStore.values()).filter((item) => {
      if (!keyword) return true;
      return (
        item.sku.toLowerCase().includes(keyword) ||
        item.name.toLowerCase().includes(keyword) ||
        item.category.toLowerCase().includes(keyword) ||
        item.subCategory.toLowerCase().includes(keyword)
      );
    });

    return reply.send({ items: items.map((item) => toResponse(item)), count: items.length });
  });

  server.get('/:sku', async (request, reply) => {
    const { sku } = request.params as { sku: string };
    const record = productStore.get(sku);
    if (!record) {
      return reply.code(404).send({ error: '요청한 상품을 찾을 수 없습니다.' });
    }

    return reply.send({ item: toResponse(record) });
  });

  server.post('/', async (request, reply) => {
    const validation = validateProductPayload(request.body);
    if (!validation.success) {
      return reply.code(400).send({ error: '유효하지 않은 입력입니다.', details: validation.errors });
    }

    const { value } = validation;
    if (productStore.has(value.sku)) {
      return reply.code(409).send({ error: '이미 존재하는 SKU입니다.' });
    }

    const now = new Date().toISOString();
    const { inventory: inventoryPayload, onHand: _onHand, reserved: _reserved, ...productValue } = value;
    const record: ProductRecord = {
      ...productValue,
      productId: value.productId ?? randomUUID(),
      legacyProductId: value.legacyProductId && value.legacyProductId > 0 ? value.legacyProductId : ++productSequence,
      createdAt: now,
      updatedAt: now,
    };

    productStore.set(record.sku, record);
    const inventoryItems = (inventoryPayload ?? []).map((entry) => ({
      sku: record.sku,
      warehouseCode: entry.warehouseCode,
      locationCode: entry.locationCode,
      onHand: entry.onHand,
      reserved: entry.reserved,
    }));
    replaceInventoryForSku(record.sku, inventoryItems);
    return reply.code(201).send({ item: toResponse(record) });
  });

  server.put('/:sku', async (request, reply) => {
    const { sku } = request.params as { sku: string };
    if (!productStore.has(sku)) {
      return reply.code(404).send({ error: '요청한 상품을 찾을 수 없습니다.' });
    }

    const validation = validateProductPayload(request.body);
    if (!validation.success) {
      return reply.code(400).send({ error: '유효하지 않은 입력입니다.', details: validation.errors });
    }

    const { value } = validation;
    if (value.sku !== sku && productStore.has(value.sku)) {
      return reply.code(409).send({ error: '이미 존재하는 SKU입니다.' });
    }

    const existing = productStore.get(sku)!;
    const { inventory: inventoryPayload, onHand: _onHand, reserved: _reserved, ...productValue } = value;
    const updated: ProductRecord = {
      ...existing,
      ...productValue,
      productId: value.productId ?? existing.productId,
      legacyProductId: existing.legacyProductId,
      packCase: value.packCase ? formatPackCase(value.pack, value.casePack) : '',
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };

    const previousInventory = listInventoryForSku(sku);
    const targetSku = updated.sku;
    const skuChanged = targetSku !== sku;

    if (skuChanged) {
      productStore.delete(sku);
    }
    productStore.set(targetSku, updated);

    if (skuChanged) {
      deleteInventoryForSku(sku);
    }

    if (inventoryPayload !== undefined) {
      const inventoryItems = inventoryPayload.map((entry) => ({
        sku: targetSku,
        warehouseCode: entry.warehouseCode,
        locationCode: entry.locationCode,
        onHand: entry.onHand,
        reserved: entry.reserved,
      }));
      replaceInventoryForSku(targetSku, inventoryItems);
    } else if (skuChanged) {
      const moved = previousInventory.map((entry) => ({
        sku: targetSku,
        warehouseCode: entry.warehouseCode,
        locationCode: entry.locationCode,
        onHand: entry.onHand,
        reserved: entry.reserved,
      }));
      replaceInventoryForSku(targetSku, moved);
    }

    return reply.send({ item: toResponse(updated) });
  });

  server.delete('/:sku', async (request, reply) => {
    const { sku } = request.params as { sku: string };
    if (!productStore.has(sku)) {
      return reply.code(404).send({ error: '요청한 상품을 찾을 수 없습니다.' });
    }

    productStore.delete(sku);
    deleteInventoryForSku(sku);
    return reply.code(204).send();
  });
}

export function __resetProductStore(seed = true) {
  productStore.clear();
  productSequence = 100;
  autoSeed = seed;
  __resetInventoryStore();
}

export function __getProductRecords(): ProductResponse[] {
  ensureSeedData();
  return Array.from(productStore.values()).map((record) => toResponse(record));
}

export function __findProductBySku(sku: string): ProductResponse | undefined {
  ensureSeedData();
  const record = productStore.get(sku);
  return record ? toResponse(record) : undefined;
}

export function __adjustProductMovementTotals(
  sku: string,
  deltas: { inbound?: number; outbound?: number },
): void {
  const record = productStore.get(sku);
  if (!record) {
    return;
  }

  const inboundDelta = Number.isFinite(deltas.inbound) ? Math.max(0, Math.round(deltas.inbound!)) : 0;
  const outboundDelta = Number.isFinite(deltas.outbound) ? Math.max(0, Math.round(deltas.outbound!)) : 0;

  if (inboundDelta === 0 && outboundDelta === 0) {
    return;
  }

  const updated: ProductRecord = {
    ...record,
    totalInbound: Math.max(0, record.totalInbound + inboundDelta),
    totalOutbound: Math.max(0, record.totalOutbound + outboundDelta),
    updatedAt: new Date().toISOString(),
  };

  productStore.set(sku, updated);
}

export function __upsertProduct(
  value: ValidatedProductPayload,
  options?: { originalSku?: string },
): { status: 'created' | 'updated'; record: ProductRecord } {
  ensureSeedData();

  const originalSku = options?.originalSku ?? value.sku;
  const now = new Date().toISOString();
  const existing = productStore.get(originalSku);
  const {
    inventory: inventoryPayload,
    onHand: _onHand,
    reserved: _reserved,
    brand,
    expiryDays,
    ...productValue
  } = value;

  if (!existing) {
    if (productStore.has(value.sku)) {
      throw new Error('이미 존재하는 SKU입니다.');
    }

    const record: ProductRecord = {
      ...productValue,
      brand: brand ?? null,
      expiryDays: expiryDays ?? null,
      productId: value.productId ?? randomUUID(),
      legacyProductId:
        value.legacyProductId && value.legacyProductId > 0 ? value.legacyProductId : ++productSequence,
      packCase: value.packCase ? formatPackCase(value.pack, value.casePack) : '',
      imageUrl: value.imageUrl ?? null,
      supplyPrice: value.supplyPrice,
      salePrice: value.salePrice,
      createdAt: now,
      updatedAt: now,
    };

    productStore.set(record.sku, record);
    const inventoryItems = (inventoryPayload ?? []).map((entry) => ({
      sku: record.sku,
      warehouseCode: entry.warehouseCode,
      locationCode: entry.locationCode,
      onHand: entry.onHand,
      reserved: entry.reserved,
    }));
    replaceInventoryForSku(record.sku, inventoryItems);

    return { status: 'created', record };
  }

  const targetSku = value.sku;
  if (targetSku !== originalSku && productStore.has(targetSku)) {
    throw new Error('이미 존재하는 SKU입니다.');
  }

  const updated: ProductRecord = {
    ...existing,
    ...productValue,
    productId: value.productId ?? existing.productId,
    legacyProductId: existing.legacyProductId,
    packCase: value.packCase ? formatPackCase(value.pack, value.casePack) : '',
    imageUrl: value.imageUrl ?? null,
    supplyPrice: value.supplyPrice,
    salePrice: value.salePrice,
    createdAt: existing.createdAt,
    updatedAt: now,
  };

  updated.brand = brand !== undefined ? brand ?? null : existing.brand;
  updated.expiryDays = expiryDays !== undefined ? expiryDays ?? null : existing.expiryDays;

  const previousInventory = listInventoryForSku(originalSku);
  const skuChanged = targetSku !== originalSku;

  if (skuChanged) {
    productStore.delete(originalSku);
  }
  productStore.set(targetSku, updated);

  if (skuChanged) {
    deleteInventoryForSku(originalSku);
  }

  if (inventoryPayload !== undefined) {
    const inventoryItems = inventoryPayload.map((entry) => ({
      sku: targetSku,
      warehouseCode: entry.warehouseCode,
      locationCode: entry.locationCode,
      onHand: entry.onHand,
      reserved: entry.reserved,
    }));
    replaceInventoryForSku(targetSku, inventoryItems);
  } else if (skuChanged) {
    const moved = previousInventory.map((entry) => ({
      sku: targetSku,
      warehouseCode: entry.warehouseCode,
      locationCode: entry.locationCode,
      onHand: entry.onHand,
      reserved: entry.reserved,
    }));
    replaceInventoryForSku(targetSku, moved);
  }

  return { status: 'updated', record: updated };
}

export type { ProductRecord };
