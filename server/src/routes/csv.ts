import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

import {
  validateProductPayload,
  __findProductBySku,
  __getProductRecords,
  __upsertProduct,
  type ProductPayload,
  type ProductRecord,
} from './products.js';

const CSV_TYPES = ['products', 'initial_stock', 'movements'] as const;
type CsvUploadType = (typeof CSV_TYPES)[number];

type CsvRowAction = 'create' | 'update' | 'error';

type ProductPreviewPayload = ProductPayload & { pack: number; casePack: number };
interface InitialStockPayload {
  sku: string;
  warehouse: string;
  location: string;
  onHand: number;
  reserved: number;
}

interface MovementPayload {
  sku: string;
  warehouse: string;
  location: string;
  partner: string;
  quantity: number;
  type: 'INBOUND' | 'OUTBOUND';
  reference?: string;
  occurredAt: string;
}

type ParsedPayload = ProductPreviewPayload | InitialStockPayload | MovementPayload;

interface ParsedRow {
  index: number; // zero-based index
  lineNumber: number; // actual CSV line (1-based)
  action: CsvRowAction;
  raw: Record<string, string>;
  messages?: string[];
  payload?: ParsedPayload;
}

interface PreviewSummary {
  total: number;
  newCount: number;
  updateCount: number;
  errorCount: number;
}

interface PreviewCacheEntry {
  id: string;
  type: CsvUploadType;
  columns: string[];
  rows: ParsedRow[];
  summary: PreviewSummary;
  createdAt: number;
}

interface CsvJob {
  id: string;
  type: CsvUploadType;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total: number;
  processed: number;
  summary: PreviewSummary;
  columns: string[];
  rows: ParsedRow[];
  errors: ParsedRow[];
  createdAt: number;
  updatedAt: number;
}

interface CsvTemplateConfig {
  headers: string[];
  rows: string[][];
}

type ProductResponse = ReturnType<typeof __getProductRecords>[number];

const CSV_HEADER_CONFIG: Record<CsvUploadType, { required: string[]; optional: string[] }> = {
  products: {
    required: ['sku', 'name', 'category', 'abcGrade', 'xyzGrade', 'dailyAvg', 'dailyStd'],
    optional: [
      'subCategory',
      'brand',
      'unit',
      'packCase',
      'bufferRatio',
      'isActive',
      'onHand',
      'reserved',
      'risk',
      'expiryDays',
    ],
  },
  initial_stock: {
    required: ['sku', 'warehouse', 'location', 'onHand'],
    optional: ['reserved'],
  },
  movements: {
    required: ['sku', 'warehouse', 'location', 'partner', 'type', 'quantity'],
    optional: ['reference', 'occurredAt'],
  },
};

const TEMPLATE_ROW_LIMIT = 5;

const sanitizeHeader = (value: string) => value.trim().toLowerCase().replace(/[\s_\-./]+/g, '');

const PRODUCT_HEADER_SYNONYMS: Record<string, string[]> = {
  sku: ['sku', '품목코드', '상품코드', 'itemcode', 'item_code', 'code'],
  name: ['name', 'productname', '상품명', '품목명', '제품명', 'description'],
  category: ['category', '카테고리', '분류', '대분류', '품목분류'],
  subCategory: ['subcategory', '하위카테고리', '중분류', '소분류'],
  brand: ['brand', '브랜드'],
  unit: ['unit', 'unitofmeasure', 'uom', '단위', '측정단위'],
  packCase: ['packcase', 'pack_case', 'pack/case', '포장단위', '묶음단위'],
  abcGrade: ['abcgrade', 'abc', 'abc등급', 'abc 등급'],
  xyzGrade: ['xyzgrade', 'xyz', 'xyz등급', 'xyz 등급'],
  bufferRatio: ['bufferratio', 'buffer_ratio', 'buffer ratio', '버퍼율', '안전율'],
  dailyAvg: [
    'dailyavg',
    'average_daily_demand',
    'avgdemand',
    '월평균출고',
    '평균일수요',
    '평균출고량',
  ],
  dailyStd: [
    'dailystd',
    'demandstddev',
    'stddev',
    'sigma',
    '수요표준편차',
    '표준편차',
  ],
  isActive: ['isactive', '활성화', '판매중', '사용여부'],
  onHand: ['onhand', 'currentstock', '현재고', '재고', '재고수량'],
  reserved: ['reserved', '할당', '예약', '예약재고'],
  risk: ['risk', 'riskindicator', '위험도', '리스크'],
  expiryDays: ['expirydays', 'shelflife', '유통기한', '유통일수'],
  pack: ['pack', '포장', 'packqty'],
  casePack: ['casepack', '케이스포장', 'case qty'],
  bufferDays: ['bufferdays', '안전기간'],
};

const INITIAL_STOCK_HEADER_SYNONYMS: Record<string, string[]> = {
  sku: ['sku', '품목코드', '상품코드', 'itemcode'],
  warehouse: ['warehouse', '창고', '물류센터', 'warehousecode', 'wh'],
  location: ['location', '로케이션', 'bin', 'shelf', 'rack', '위치', 'locationcode'],
  onHand: ['onhand', 'currentstock', '재고', '재고수량', '현재고'],
  reserved: ['reserved', '예약', '할당', 'reserve'],
};

const MOVEMENT_HEADER_SYNONYMS: Record<string, string[]> = {
  sku: ['sku', '품목코드', '상품코드', 'itemcode'],
  warehouse: ['warehouse', '창고', '물류센터', 'warehousecode', 'wh', '출고창고', '입고창고'],
  location: ['location', '로케이션', 'bin', 'shelf', 'rack', '위치', 'locationcode'],
  partner: ['partner', '거래처', '거래처코드', 'partnerid', '벤더', 'customer'],
  quantity: ['quantity', 'qty', '수량', '수량ea', '입출고수량'],
  type: ['type', '거래유형', '입출고', 'direction', 'inout', '입출고구분'],
  reference: ['reference', 'refno', '참조번호', '문서번호', 'order', '주문번호'],
  occurredAt: ['occurredat', 'date', '거래일', '발생일', '처리일', 'timestamp'],
  memo: ['memo', '비고', '메모', '설명'],
};

type ColumnStatus = 'matched' | 'duplicate' | 'unknown';

interface ColumnResolution {
  original: string;
  normalized: string;
  canonical: string | null;
  status: ColumnStatus;
  duplicateOf?: string;
}

interface HeaderResolutionResult {
  type: CsvUploadType;
  columnMappings: ColumnResolution[];
  canonicalColumns: string[];
  missingRequired: string[];
  warnings: string[];
}

const SYNONYM_LOOKUPS: Record<CsvUploadType, Map<string, string>> = {
  products: buildSynonymLookup(PRODUCT_HEADER_SYNONYMS),
  initial_stock: buildSynonymLookup(INITIAL_STOCK_HEADER_SYNONYMS),
  movements: buildSynonymLookup(MOVEMENT_HEADER_SYNONYMS),
};

function buildSynonymLookup(source: Record<string, string[]>): Map<string, string> {
  const lookup = new Map<string, string>();
  Object.entries(source).forEach(([canonical, synonyms]) => {
    const entries = new Set([canonical, ...synonyms]);
    entries.forEach((entry) => {
      const key = sanitizeHeader(entry);
      if (!key) {
        return;
      }
      lookup.set(key, canonical);
    });
  });
  return lookup;
}

const DEFAULT_PRODUCT_TEMPLATE_SAMPLE: Record<string, string> = {
  sku: 'SAMPLE-SKU-001',
  name: 'Sample Product',
  category: 'Processed Food',
  subCategory: 'Instant Meal',
  brand: 'StockConsole',
  unit: 'EA',
  packCase: '4/12',
  abcGrade: 'B',
  xyzGrade: 'Y',
  bufferRatio: '0.20',
  dailyAvg: '24',
  dailyStd: '6',
  isActive: 'true',
  onHand: '480',
  reserved: '30',
  risk: '정상',
  expiryDays: '90',
};

const DEFAULT_INITIAL_STOCK_SAMPLE: Record<string, string> = {
  sku: 'SAMPLE-SKU-001',
  warehouse: 'ICN1',
  location: 'A-01',
  onHand: '480',
  reserved: '30',
};

const DEFAULT_MOVEMENT_TEMPLATE_SAMPLE: Record<string, string> = {
  sku: 'SAMPLE-SKU-001',
  warehouse: 'ICN1',
  location: 'A-01',
  partner: 'SUP-0001',
  type: 'INBOUND',
  quantity: '120',
  reference: 'ORDER-REF-2401',
  occurredAt: new Date().toISOString().slice(0, 10),
};

const previewCache = new Map<string, PreviewCacheEntry>();
const jobStore = new Map<string, CsvJob>();
const jobQueue: CsvJob[] = [];
let activeJob: CsvJob | null = null;

const warehouseCatalog: Record<string, { name: string; locations: string[] }> = {
  ICN1: { name: '인천 풀필먼트 센터', locations: ['A-01', 'A-02', 'B-01', 'B-02'] },
  PUS1: { name: '부산 허브', locations: ['P-01', 'P-02', 'P-03'] },
  DJN1: { name: '대전 물류센터', locations: ['D-01', 'D-02'] },
};

const partnerCatalog = new Set(['SUP-0001', 'SUP-0002', 'CUS-0001', 'CUS-0002']);

const initialStockStore = new Map<string, InitialStockPayload>();
const movementLog: MovementPayload[] = [];
let stockSeeded = false;

function seedInitialStock(records: ProductRecord[]) {
  if (stockSeeded) {
    return;
  }

  const baseSkus = records.slice(0, 3);
  baseSkus.forEach((record, index) => {
    const warehouses = Object.keys(warehouseCatalog);
    const warehouse = warehouses[index % warehouses.length];
    const location = warehouseCatalog[warehouse].locations[index % warehouseCatalog[warehouse].locations.length];
    const key = buildStockKey(record.sku, warehouse, location);
    initialStockStore.set(key, {
      sku: record.sku,
      warehouse,
      location,
      onHand: Math.max(record.onHand ?? 0, 0),
      reserved: Math.max(record.reserved ?? 0, 0),
    });
  });

  stockSeeded = true;
}

function buildStockKey(sku: string, warehouse: string, location: string): string {
  return `${sku}::${warehouse}::${location}`;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let current = '';
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (char === '"') {
      const nextChar = text[i + 1];
      if (inQuotes && nextChar === '"') {
        current += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      currentRow.push(current);
      current = '';
      continue;
    }

    if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && text[i + 1] === '\n') {
        i += 1;
      }
      currentRow.push(current);
      rows.push(currentRow);
      current = '';
      currentRow = [];
      continue;
    }

    current += char;
  }

  if (currentRow.length > 0 || current) {
    currentRow.push(current);
    rows.push(currentRow);
  }

  return rows
    .map((row) => row.map((cell) => cell.trim()))
    .filter((row) => row.length > 0 && row.some((cell) => cell.length > 0));
}

function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function stringifyCsv(headers: string[], rows: string[][]): string {
  const headerLine = headers.map((header) => escapeCsv(header)).join(',');
  const body = rows.map((row) => row.map((cell) => escapeCsv(cell ?? '')).join(',')).join('\n');
  const content = body ? `${headerLine}\n${body}` : headerLine;
  return `\uFEFF${content}`;
}

function resolveColumnsForType(
  headers: string[],
  type: CsvUploadType,
): { columnMappings: ColumnResolution[]; missingRequired: string[]; matchedCanonicals: Set<string> } {
  const lookup = SYNONYM_LOOKUPS[type];
  const usedCanonicals = new Set<string>();

  const columnMappings = headers.map<ColumnResolution>((original) => {
    const normalized = sanitizeHeader(original);
    const canonical = lookup.get(normalized);

    if (canonical && !usedCanonicals.has(canonical)) {
      usedCanonicals.add(canonical);
      return {
        original,
        normalized,
        canonical,
        status: 'matched',
      };
    }

    if (canonical) {
      return {
        original,
        normalized,
        canonical: null,
        status: 'duplicate',
        duplicateOf: canonical,
      };
    }

    return {
      original,
      normalized,
      canonical: null,
      status: 'unknown',
    };
  });

  const required = CSV_HEADER_CONFIG[type].required;
  const missingRequired = required.filter((field) => !usedCanonicals.has(field));

  return {
    columnMappings,
    missingRequired,
    matchedCanonicals: usedCanonicals,
  };
}

function buildCanonicalColumns(mappings: ColumnResolution[]): string[] {
  return mappings.map((mapping, index) => {
    if (mapping.status === 'matched' && mapping.canonical) {
      return mapping.canonical;
    }
    return `__extra_${index}`;
  });
}

function buildHeaderWarnings(mappings: ColumnResolution[]): string[] {
  const warnings: string[] = [];
  mappings.forEach((mapping) => {
    if (mapping.status === 'duplicate' && mapping.duplicateOf) {
      warnings.push(`${mapping.original} 열이 ${mapping.duplicateOf}와(과) 중복되었습니다.`);
    }
    if (mapping.status === 'unknown') {
      warnings.push(`${mapping.original} 열은 지원하지 않는 필드입니다.`);
    }
  });
  return warnings;
}

function scoreHeaderResolution(
  type: CsvUploadType,
  mappings: ColumnResolution[],
  missingRequired: string[],
): number {
  const requiredTotal = CSV_HEADER_CONFIG[type].required.length;
  const optionalSet = new Set(CSV_HEADER_CONFIG[type].optional);
  const requiredMatches = requiredTotal - missingRequired.length;
  const optionalMatches = mappings.filter(
    (mapping) => mapping.status === 'matched' && mapping.canonical && optionalSet.has(mapping.canonical),
  ).length;
  return requiredMatches * 100 + optionalMatches;
}

function resolveCsvHeaders(headers: string[], requestedType?: CsvUploadType): HeaderResolutionResult {
  const trimmedHeaders = headers.map((header) => header.trim());

  if (requestedType) {
    const resolved = resolveColumnsForType(trimmedHeaders, requestedType);
    return {
      type: requestedType,
      columnMappings: resolved.columnMappings,
      canonicalColumns: buildCanonicalColumns(resolved.columnMappings),
      missingRequired: resolved.missingRequired,
      warnings: buildHeaderWarnings(resolved.columnMappings),
    };
  }

  let best: HeaderResolutionResult | null = null;
  let bestScore = -1;

  CSV_TYPES.forEach((candidateType) => {
    const resolved = resolveColumnsForType(trimmedHeaders, candidateType);
    if (resolved.missingRequired.length > 0) {
      return;
    }
    const score = scoreHeaderResolution(candidateType, resolved.columnMappings, resolved.missingRequired);
    if (score > bestScore) {
      bestScore = score;
      best = {
        type: candidateType,
        columnMappings: resolved.columnMappings,
        canonicalColumns: buildCanonicalColumns(resolved.columnMappings),
        missingRequired: [],
        warnings: buildHeaderWarnings(resolved.columnMappings),
      };
    }
  });

  if (!best) {
    const fallbackType: CsvUploadType = 'products';
    const resolved = resolveColumnsForType(trimmedHeaders, fallbackType);
    return {
      type: fallbackType,
      columnMappings: resolved.columnMappings,
      canonicalColumns: buildCanonicalColumns(resolved.columnMappings),
      missingRequired: resolved.missingRequired,
      warnings: buildHeaderWarnings(resolved.columnMappings),
    };
  }

  return best;
}

function requireCsvType(type: string | undefined): CsvUploadType {
  if (!type || !CSV_TYPES.includes(type as CsvUploadType)) {
    throw new Error('지원하지 않는 CSV 유형입니다. (products, initial_stock, movements)');
  }
  return type as CsvUploadType;
}

function normalizeKey(value: string | undefined): string {
  return (value ?? '').trim();
}

function parseNumber(value: string | undefined): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const parsed = Number(trimmed.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'y', 'yes', '활성', 'enable', 'enabled'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'n', 'no', '비활성', 'disable', 'disabled'].includes(normalized)) {
    return false;
  }
  return undefined;
}

function getCsvHeaders(type: CsvUploadType): string[] {
  const config = CSV_HEADER_CONFIG[type];
  return [...config.required, ...config.optional];
}

function parseProductRow(raw: Record<string, string>, lineNumber: number): ParsedRow {
  const candidate: Record<string, unknown> = {
    sku: normalizeKey(raw.sku),
    name: normalizeKey(raw.name),
    category: normalizeKey(raw.category),
    subCategory: normalizeKey(raw.subCategory),
    brand: normalizeKey(raw.brand),
    unit: normalizeKey(raw.unit),
    packCase: normalizeKey(raw.packCase),
    abcGrade: normalizeKey(raw.abcGrade),
    xyzGrade: normalizeKey(raw.xyzGrade),
    bufferRatio: parseNumber(raw.bufferRatio),
    dailyAvg: parseNumber(raw.dailyAvg),
    dailyStd: parseNumber(raw.dailyStd),
    isActive: parseBoolean(raw.isActive),
    onHand: parseNumber(raw.onHand),
    reserved: parseNumber(raw.reserved),
    risk: normalizeKey(raw.risk),
    expiryDays: parseNumber(raw.expiryDays),
  };

  if (Number.isNaN(candidate.bufferRatio as number)) {
    candidate.bufferRatio = undefined;
  }
  if (Number.isNaN(candidate.dailyAvg as number)) {
    candidate.dailyAvg = Number.NaN;
  }
  if (Number.isNaN(candidate.dailyStd as number)) {
    candidate.dailyStd = Number.NaN;
  }
  if (Number.isNaN(candidate.onHand as number)) {
    candidate.onHand = Number.NaN;
  }
  if (Number.isNaN(candidate.reserved as number)) {
    candidate.reserved = Number.NaN;
  }
  if (Number.isNaN(candidate.expiryDays as number)) {
    candidate.expiryDays = Number.NaN;
  }

  const validation = validateProductPayload(candidate);
  if (!validation.success) {
    return {
      index: lineNumber - 1,
      lineNumber,
      action: 'error',
      raw,
      messages: validation.errors,
    };
  }

  const { value } = validation;
  const existing = __findProductBySku(value.sku);
  return {
    index: lineNumber - 1,
    lineNumber,
    action: existing ? 'update' : 'create',
    raw,
    payload: value,
  };
}

function parseInitialStockRow(raw: Record<string, string>, lineNumber: number): ParsedRow {
  const errors: string[] = [];
  const sku = normalizeKey(raw.sku);
  if (!sku) {
    errors.push('sku 필드는 필수입니다.');
  }
  const product = sku ? __findProductBySku(sku) : undefined;
  if (sku && !product) {
    errors.push('존재하지 않는 SKU입니다.');
  }

  const warehouse = normalizeKey(raw.warehouse).toUpperCase();
  if (!warehouse) {
    errors.push('warehouse 필드는 필수입니다.');
  } else if (!warehouseCatalog[warehouse]) {
    errors.push('등록되지 않은 창고 코드입니다.');
  }

  const location = normalizeKey(raw.location).toUpperCase();
  if (!location) {
    errors.push('location 필드는 필수입니다.');
  } else if (warehouse && warehouseCatalog[warehouse] && !warehouseCatalog[warehouse].locations.includes(location)) {
    errors.push('창고에 존재하지 않는 보관위치입니다.');
  }

  const onHandValue = parseNumber(raw.onHand);
  const reservedValue = parseNumber(raw.reserved);

  if (onHandValue === undefined || Number.isNaN(onHandValue)) {
    errors.push('onHand 필드는 숫자여야 합니다.');
  }
  if (reservedValue !== undefined && Number.isNaN(reservedValue)) {
    errors.push('reserved 필드는 숫자여야 합니다.');
  }

  if (errors.length > 0) {
    return {
      index: lineNumber - 1,
      lineNumber,
      action: 'error',
      raw,
      messages: errors,
    };
  }

  const payload: InitialStockPayload = {
    sku,
    warehouse,
    location,
    onHand: Math.max(Math.round(onHandValue ?? 0), 0),
    reserved: Math.max(Math.round(reservedValue ?? 0), 0),
  };

  const key = buildStockKey(sku, warehouse, location);
  const existing = initialStockStore.get(key);

  return {
    index: lineNumber - 1,
    lineNumber,
    action: existing ? 'update' : 'create',
    raw,
    payload,
  };
}

function parseMovementRow(raw: Record<string, string>, lineNumber: number): ParsedRow {
  const errors: string[] = [];
  const sku = normalizeKey(raw.sku);
  if (!sku) {
    errors.push('sku 필드는 필수입니다.');
  }
  const product = sku ? __findProductBySku(sku) : undefined;
  if (sku && !product) {
    errors.push('존재하지 않는 SKU입니다.');
  }

  const warehouse = normalizeKey(raw.warehouse).toUpperCase();
  if (!warehouse) {
    errors.push('warehouse 필드는 필수입니다.');
  } else if (!warehouseCatalog[warehouse]) {
    errors.push('등록되지 않은 창고 코드입니다.');
  }

  const location = normalizeKey(raw.location).toUpperCase();
  if (!location) {
    errors.push('location 필드는 필수입니다.');
  } else if (warehouse && warehouseCatalog[warehouse] && !warehouseCatalog[warehouse].locations.includes(location)) {
    errors.push('창고에 존재하지 않는 보관위치입니다.');
  }

  const partner = normalizeKey(raw.partner).toUpperCase();
  if (!partner) {
    errors.push('partner 필드는 필수입니다.');
  } else if (!partnerCatalog.has(partner)) {
    errors.push('등록되지 않은 거래처 코드입니다.');
  }

  const quantityValue = parseNumber(raw.quantity);
  if (quantityValue === undefined || Number.isNaN(quantityValue)) {
    errors.push('quantity 필드는 숫자여야 합니다.');
  } else if (Math.round(quantityValue) === 0) {
    errors.push('quantity 필드는 0이 될 수 없습니다.');
  }

  const type = normalizeKey(raw.type).toUpperCase();
  let normalizedType: MovementPayload['type'] | undefined;
  if (!type) {
    errors.push('type 필드는 필수입니다.');
  } else if (['IN', 'INBOUND', '입고'].includes(type)) {
    normalizedType = 'INBOUND';
  } else if (['OUT', 'OUTBOUND', '출고'].includes(type)) {
    normalizedType = 'OUTBOUND';
  } else {
    errors.push('type 필드는 INBOUND 또는 OUTBOUND 이어야 합니다.');
  }

  const reference = normalizeKey(raw.reference);
  const occurredAtRaw = normalizeKey(raw.occurredAt);
  let occurredAt: string | undefined;
  if (occurredAtRaw) {
    const parsed = new Date(occurredAtRaw);
    if (Number.isNaN(parsed.getTime())) {
      errors.push('occurredAt 필드가 날짜 형식이 아닙니다.');
    } else {
      occurredAt = parsed.toISOString();
    }
  }

  if (errors.length > 0 || !normalizedType) {
    return {
      index: lineNumber - 1,
      lineNumber,
      action: 'error',
      raw,
      messages: errors,
    };
  }

  const payload: MovementPayload = {
    sku,
    warehouse,
    location,
    partner,
    quantity: Math.round(quantityValue ?? 0),
    type: normalizedType,
    reference: reference || undefined,
    occurredAt: occurredAt ?? new Date().toISOString(),
  };

  return {
    index: lineNumber - 1,
    lineNumber,
    action: 'create',
    raw,
    payload,
  };
}

function analyzeRows(type: CsvUploadType, columns: string[], table: string[][]): ParsedRow[] {
  return table.map((cells, index) => {
    const row: Record<string, string> = {};
    columns.forEach((column, columnIndex) => {
      row[column] = cells[columnIndex] ?? '';
    });
    const lineNumber = index + 2; // header is line 1
    switch (type) {
      case 'products':
        return parseProductRow(row, lineNumber);
      case 'initial_stock':
        return parseInitialStockRow(row, lineNumber);
      case 'movements':
        return parseMovementRow(row, lineNumber);
      default:
        return {
          index,
          lineNumber,
          action: 'error',
          raw: row,
          messages: ['알 수 없는 CSV 유형입니다.'],
        };
    }
  });
}

function summarizeRows(rows: ParsedRow[]): PreviewSummary {
  return rows.reduce(
    (acc, row) => {
      if (row.action === 'error') {
        acc.errorCount += 1;
        return acc;
      }
      if (row.action === 'create') {
        acc.newCount += 1;
      } else {
        acc.updateCount += 1;
      }
      return acc;
    },
    { total: rows.length, newCount: 0, updateCount: 0, errorCount: 0 },
  );
}

function queueJob(job: CsvJob) {
  jobQueue.push(job);
  jobStore.set(job.id, job);
  processQueue();
}

function processQueue() {
  if (activeJob) {
    return;
  }

  const job = jobQueue.shift();
  if (!job) {
    return;
  }

  activeJob = job;
  job.status = 'processing';
  job.updatedAt = Date.now();

  const processNext = (index: number) => {
    if (!activeJob || activeJob.id !== job.id) {
      return;
    }

    if (index >= job.rows.length) {
      job.status = 'completed';
      job.updatedAt = Date.now();
      activeJob = null;
      setTimeout(() => processQueue(), 0);
      return;
    }

    const row = job.rows[index];
    if (row.action !== 'error' && row.payload) {
      try {
        applyRow(job.type, row);
      } catch (error) {
        const message = error instanceof Error ? error.message : '처리 중 알 수 없는 오류가 발생했습니다.';
        job.errors.push({ ...row, action: 'error', messages: [message] });
      }
    }

    job.processed = index + 1;
    job.updatedAt = Date.now();

    setTimeout(() => processNext(index + 1), 15);
  };

  setTimeout(() => processNext(0), 10);
}

function applyRow(type: CsvUploadType, row: ParsedRow) {
  if (!row.payload || row.action === 'error') {
    return;
  }

  switch (type) {
    case 'products':
      __upsertProduct(row.payload as ProductPreviewPayload);
      break;
    case 'initial_stock': {
      const payload = row.payload as InitialStockPayload;
      const key = buildStockKey(payload.sku, payload.warehouse, payload.location);
      initialStockStore.set(key, payload);
      break;
    }
    case 'movements':
      movementLog.push(row.payload as MovementPayload);
      break;
    default:
      break;
  }
}

function formatProductTemplateValue(record: ProductResponse, column: string): string {
  switch (column) {
    case 'sku':
      return record.sku;
    case 'name':
      return record.name;
    case 'category':
      return record.category;
    case 'subCategory':
      return record.subCategory ?? '';
    case 'brand':
      return record.brand ?? '';
    case 'unit':
      return record.unit;
    case 'packCase':
      return record.packCase;
    case 'abcGrade':
      return record.abcGrade;
    case 'xyzGrade':
      return record.xyzGrade;
    case 'bufferRatio':
      return Number.isFinite(record.bufferRatio) ? record.bufferRatio.toString() : '';
    case 'dailyAvg':
      return Number.isFinite(record.dailyAvg) ? record.dailyAvg.toString() : '';
    case 'dailyStd':
      return Number.isFinite(record.dailyStd) ? record.dailyStd.toString() : '';
    case 'isActive':
      return record.isActive ? 'true' : 'false';
    case 'onHand':
      return Number.isFinite(record.onHand) ? record.onHand.toString() : '';
    case 'reserved':
      return Number.isFinite(record.reserved) ? record.reserved.toString() : '';
    case 'risk':
      return record.risk;
    case 'expiryDays': {
      const { expiryDays } = record;
      return expiryDays === null || expiryDays === undefined ? '' : expiryDays.toString();
    }
    default:
      return '';
  }
}

function buildProductTemplate(): CsvTemplateConfig {
  const headers = getCsvHeaders('products');
  const products = __getProductRecords().slice(0, TEMPLATE_ROW_LIMIT);
  const rows: string[][] =
    products.length > 0
      ? products.map((record) => headers.map((column) => formatProductTemplateValue(record, column)))
      : [headers.map((column) => DEFAULT_PRODUCT_TEMPLATE_SAMPLE[column] ?? '')];

  rows.push(headers.map(() => ''));
  return { headers, rows };
}

function buildTemplate(type: CsvUploadType): CsvTemplateConfig {
  switch (type) {
    case 'products':
      return buildProductTemplate();
    case 'initial_stock': {
      const headers = getCsvHeaders('initial_stock');
      const row = headers.map((column) => DEFAULT_INITIAL_STOCK_SAMPLE[column] ?? '');
      return { headers, rows: [row] };
    }
    case 'movements': {
      const headers = getCsvHeaders('movements');
      const row = headers.map((column) => DEFAULT_MOVEMENT_TEMPLATE_SAMPLE[column] ?? '');
      return { headers, rows: [row] };
    }
    default:
      return { headers: [], rows: [] };
  }
}

function buildErrorCsv(job: CsvJob): string {
  const headers = ['rowNumber', 'messages', ...job.columns];
  const rows = job.errors.map((row) => {
    const message = (row.messages ?? []).join('; ');
    return [String(row.lineNumber), message, ...job.columns.map((column) => row.raw[column] ?? '')];
  });
  return stringifyCsv(headers, rows);
}

export default async function csvRoutes(server: FastifyInstance) {
  server.post('/upload', async (request, reply) => {
    const { type: typeQuery } = request.query as { type?: string };
    const rawType = typeof typeQuery === 'string' ? typeQuery.trim() : '';
    let requestedType: CsvUploadType | undefined;
    const autoDetect = !rawType || sanitizeHeader(rawType) === 'auto';
    if (!autoDetect) {
      requestedType = requireCsvType(rawType);
    }

    const body = (request.body ?? {}) as { stage?: string; content?: string; previewId?: string };

    if (body.stage === 'commit') {
      const { previewId } = body;
      if (!previewId || !previewCache.has(previewId)) {
        return reply.code(400).send({ error: '유효하지 않은 previewId 입니다.' });
      }

      const entry = previewCache.get(previewId)!;
      previewCache.delete(previewId);

      if (requestedType && entry.type !== requestedType) {
        return reply.code(400).send({ error: '요청한 type과 미리보기 유형이 일치하지 않습니다.' });
      }

      const jobId = randomUUID();
      const errorRows = entry.rows.filter((row) => row.action === 'error');
      const job: CsvJob = {
        id: jobId,
        type: entry.type,
        status: 'pending',
        total: entry.rows.length,
        processed: 0,
        summary: entry.summary,
        columns: entry.columns,
        rows: entry.rows,
        errors: [...errorRows],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      queueJob(job);

      return reply.send({
        job: {
          id: job.id,
          status: job.status,
          total: job.total,
          processed: job.processed,
          summary: job.summary,
          errorCount: job.errors.length,
          createdAt: job.createdAt,
        },
      });
    }

    const csvText = typeof body.content === 'string' ? body.content : '';
    if (!csvText.trim()) {
      return reply.code(400).send({ error: '업로드할 CSV 내용이 비어있습니다.' });
    }

    const table = parseCsv(csvText);
    if (table.length === 0) {
      return reply.code(400).send({ error: '유효한 CSV 데이터를 찾을 수 없습니다.' });
    }

    const [headerRow, ...dataRows] = table;
    const headerResolution = resolveCsvHeaders(headerRow, autoDetect ? undefined : requestedType);
    if (headerResolution.missingRequired.length > 0) {
      return reply.code(400).send({
        error: 'CSV 헤더가 누락되었습니다.',
        details: headerResolution.missingRequired.map((column) => `${column} 필드는 필수입니다.`),
      });
    }

    const type = headerResolution.type;
    const columns = headerResolution.canonicalColumns;
    if (type === 'products') {
      seedInitialStock(__getProductRecords());
    }

    const parsedRows = analyzeRows(type, columns, dataRows);
    const summary = summarizeRows(parsedRows);
    const previewId = randomUUID();

    const entry: PreviewCacheEntry = {
      id: previewId,
      type,
      columns,
      originalColumns: headerRow,
      columnMappings: headerResolution.columnMappings,
      warnings: headerResolution.warnings,
      rows: parsedRows,
      summary,
      createdAt: Date.now(),
    };

    previewCache.set(previewId, entry);

    return reply.send({
      previewId,
      type,
      columns,
      summary,
      errors: parsedRows
        .filter((row) => row.action === 'error')
        .slice(0, 20)
        .map((row) => ({
          rowNumber: row.lineNumber,
          messages: row.messages ?? [],
        })),
    });
  });

  server.get('/jobs/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = jobStore.get(id);
    if (!job) {
      return reply.code(404).send({ error: '요청한 작업을 찾을 수 없습니다.' });
    }

    return reply.send({
      job: {
        id: job.id,
        status: job.status,
        total: job.total,
        processed: job.processed,
        summary: job.summary,
        errorCount: job.errors.length,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      },
    });
  });

  server.get('/jobs/:id/errors', async (request, reply) => {
    const { id } = request.params as { id: string };
    const job = jobStore.get(id);
    if (!job) {
      return reply.code(404).send({ error: '요청한 작업을 찾을 수 없습니다.' });
    }

    if (job.errors.length === 0) {
      return reply.code(204).send();
    }

    const csv = buildErrorCsv(job);
    reply.header('content-type', 'text/csv; charset=utf-8');
    reply.header('content-disposition', `attachment; filename="${job.type}-errors-${job.id}.csv"`);
    return reply.send(csv);
  });

  server.get('/template', async (request, reply) => {
    const { type: typeQuery } = request.query as { type?: string };
    const type = requireCsvType(typeQuery);
    const template = buildTemplate(type);
    const csv = stringifyCsv(template.headers, template.rows);
    reply.header('content-type', 'text/csv; charset=utf-8');
    reply.header('content-disposition', `attachment; filename="${type}-template.csv"`);
    return reply.send(csv);
  });
}
