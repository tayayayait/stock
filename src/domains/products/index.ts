export type InventoryRisk = '정상' | '결품위험' | '과잉';

export interface ProductInventoryEntry {
  warehouseCode: string;
  locationCode: string;
  onHand: number;
  reserved: number;
}

export interface Product {
  productId: string;
  legacyProductId: number;
  sku: string;
  imageUrl?: string;
  name: string;
  category: string;
  subCategory: string;
  unit: string;
  packCase: string;
  pack: number;
  casePack: number;
  abcGrade: 'A' | 'B' | 'C';
  xyzGrade: 'X' | 'Y' | 'Z';
  bufferRatio: number;
  dailyAvg: number;
  dailyStd: number;
  totalInbound?: number;
  totalOutbound?: number;
  avgOutbound7d?: number;
  isActive: boolean;
  onHand: number;
  reserved: number;
  risk: InventoryRisk;
  brand?: string;
  expiryDays?: number;
  supplyPrice: number | null;
  salePrice: number | null;
  referencePrice: number | null;
  currency?: string | null;
  inventory?: ProductInventoryEntry[];
}

export const DEFAULT_UNIT = 'EA';
export const DEFAULT_UNIT_OPTIONS: readonly string[] = [
  'EA',
  'BOX',
  'PACK',
  'BAG',
  'KG',
  'G',
  'L',
  'ML',
];
export const DEFAULT_BUFFER_RATIO = 0.2;

export const createEmptyProduct = (): Product => ({
  productId: '',
  legacyProductId: 0,
  sku: '',
  imageUrl: '',
  name: '',
  category: '',
  subCategory: '',
  unit: DEFAULT_UNIT,
  packCase: '1/10',
  pack: 1,
  casePack: 10,
  abcGrade: 'B',
  xyzGrade: 'Y',
  bufferRatio: DEFAULT_BUFFER_RATIO,
  dailyAvg: 0,
  dailyStd: 0,
  totalInbound: 0,
  totalOutbound: 0,
  avgOutbound7d: 0,
  isActive: true,
  onHand: 0,
  reserved: 0,
  risk: '정상',
  supplyPrice: null,
  salePrice: null,
  referencePrice: null,
  currency: null,
  inventory: [],
});

const SKU_PREFIX = 'SKU';
const SKU_SEGMENT_LENGTH = 8;
const SKU_MAX_ATTEMPTS = 1000;

export const normalizeSku = (value: string): string => value.trim().toUpperCase();

const createSkuSegment = (): string => {
  const cryptoApi = globalThis?.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID().replace(/-/g, '').slice(0, SKU_SEGMENT_LENGTH).toUpperCase();
  }

  const randomValue = Math.floor(Math.random() * 36 ** SKU_SEGMENT_LENGTH);
  return randomValue.toString(36).toUpperCase().padStart(SKU_SEGMENT_LENGTH, '0');
};

export const generateSku = (existing: Iterable<string> = [], prefix: string = SKU_PREFIX): string => {
  const normalizedPrefix = prefix.trim().toUpperCase() || SKU_PREFIX;
  const occupied = new Set<string>();
  for (const value of existing ?? []) {
    const normalized = normalizeSku(value ?? '');
    if (normalized) {
      occupied.add(normalized);
    }
  }

  for (let attempt = 0; attempt < SKU_MAX_ATTEMPTS; attempt += 1) {
    const candidate = `${normalizedPrefix}-${createSkuSegment()}`;
    const normalizedCandidate = normalizeSku(candidate);
    if (!occupied.has(normalizedCandidate)) {
      return normalizedCandidate;
    }
  }

  throw new Error('고유한 SKU를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.');
};

const isFinitePositive = (value: number): boolean => Number.isFinite(value) && value > 0;

export const formatPackCase = (pack: number, casePack: number): string => {
  const safePack = isFinitePositive(pack) ? Math.floor(pack) : 1;
  const safeCase = isFinitePositive(casePack) ? Math.floor(casePack) : safePack;
  return `${safePack}/${safeCase}`;
};

export const parsePackCase = (packCase: string): { pack: number; casePack: number } => {
  const [packRaw, caseRaw] = (packCase ?? '').split('/').map((part) => part.trim());
  const pack = Number.parseInt(packRaw ?? '', 10);
  const casePack = Number.parseInt(caseRaw ?? '', 10);
  const safePack = isFinitePositive(pack) ? pack : 1;
  const safeCase = isFinitePositive(casePack) ? casePack : safePack;
  return { pack: safePack, casePack: safeCase };
};

export const clampBufferRatio = (value: number): number => {
  if (!Number.isFinite(value)) {
    return DEFAULT_BUFFER_RATIO;
  }

  if (value < 0) {
    return 0;
  }

  if (value > 1.0) {
    return 1.0;
  }

  return value;
};

export const sanitizeDailyValue = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
};

export const sanitizeStockValue = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
};

const sanitizePriceValue = (value: number | null | undefined): number | null => {
  if (!Number.isFinite(value ?? NaN)) {
    return null;
  }

  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) {
    return null;
  }

  return Math.round(normalized * 100) / 100;
};

const normalizeInventoryEntries = (entries?: ProductInventoryEntry[]): ProductInventoryEntry[] => {
  if (!Array.isArray(entries) || entries.length === 0) {
    return [];
  }

  return entries
    .map((entry) => ({
      warehouseCode: entry?.warehouseCode?.trim() ?? '',
      locationCode: entry?.locationCode?.trim() ?? '',
      onHand: sanitizeStockValue(entry?.onHand ?? 0),
      reserved: sanitizeStockValue(entry?.reserved ?? 0),
    }))
    .filter((entry) => entry.warehouseCode || entry.locationCode);
};

export const normalizeProduct = (input: Product): Product => {
  const { pack, casePack } = parsePackCase(input.packCase);

  return {
    ...input,
    productId: typeof input.productId === 'string' ? input.productId : '',
    legacyProductId: Number.isFinite(input.legacyProductId) ? input.legacyProductId : 0,
    sku: input.sku.trim(),
    imageUrl: input.imageUrl?.trim() || undefined,
    name: input.name.trim(),
    category: input.category.trim(),
    subCategory: input.subCategory.trim(),
    brand: (() => {
      const normalized = input.brand?.trim();
      return normalized ? normalized : undefined;
    })(),
    unit: (() => {
      const normalizedUnit = input.unit?.trim().toUpperCase() ?? '';
      return DEFAULT_UNIT_OPTIONS.includes(normalizedUnit) ? normalizedUnit : DEFAULT_UNIT;
    })(),
    packCase: formatPackCase(pack, casePack),
    pack,
    casePack,
    bufferRatio: clampBufferRatio(input.bufferRatio),
    dailyAvg: sanitizeDailyValue(input.dailyAvg),
    dailyStd: sanitizeDailyValue(input.dailyStd),
    totalInbound: sanitizeStockValue(input.totalInbound ?? 0),
    totalOutbound: sanitizeStockValue(input.totalOutbound ?? 0),
    avgOutbound7d: sanitizeDailyValue(
      (input.avgOutbound7d ?? (input as { recentOutboundAvg7Days?: number }).recentOutboundAvg7Days) ?? 0,
    ),
    onHand: sanitizeStockValue(input.onHand),
    reserved: sanitizeStockValue(input.reserved),
    expiryDays: (() => {
      const value = input.expiryDays;
      if (!Number.isFinite(value as number)) {
        return undefined;
      }
      const normalized = Math.max(0, Math.round(value as number));
      return normalized;
    })(),
    supplyPrice: sanitizePriceValue(input.supplyPrice),
    salePrice: sanitizePriceValue(input.salePrice),
    referencePrice: sanitizePriceValue(input.referencePrice),
    currency: input.currency?.trim() ?? null,
    inventory: normalizeInventoryEntries(input.inventory),
  };
};
