import { normalizeProduct, type InventoryRisk, type Product } from '../domains/products';
export type { Product } from '../domains/products';
import { request } from './http';

interface ProductRecord {
  productId: string;
  legacyProductId: number;
  sku: string;
  imageUrl: string | null;
  name: string;
  category: string;
  subCategory: string;
  brand?: string | null;
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
  expiryDays?: number | null;
  supplyPrice: number | null;
  salePrice: number | null;
  referencePrice: number | null;
  currency: string | null;
  createdAt: string;
  updatedAt: string;
  inventory?: Array<{
    warehouseCode: string;
    locationCode: string;
    onHand: number;
    reserved: number;
  }>;
}

interface ProductListResponse {
  items: ProductRecord[];
  count: number;
}

interface ProductItemResponse {
  item: ProductRecord;
}

interface UploadProductImageResponse {
  url: string;
}

const toProduct = (record: ProductRecord): Product =>
  normalizeProduct({
    ...record,
    imageUrl: record.imageUrl ?? undefined,
    brand: record.brand ?? undefined,
    expiryDays: record.expiryDays ?? undefined,
    supplyPrice: record.supplyPrice,
    salePrice: record.salePrice,
    inventory: record.inventory ?? [],
    avgOutbound7d: record.avgOutbound7d,
    referencePrice: record.referencePrice,
    currency: record.currency,
  });

interface ProductPayloadRequest {
  productId?: string;
  legacyProductId?: number;
  sku: string;
  imageUrl?: string;
  name: string;
  category: string;
  subCategory: string;
  brand?: string;
  unit: string;
  packCase: string;
  pack: number;
  casePack: number;
  abcGrade: 'A' | 'B' | 'C';
  xyzGrade: 'X' | 'Y' | 'Z';
  bufferRatio: number;
  dailyAvg: number;
  dailyStd: number;
  totalInbound: number;
  totalOutbound: number;
  avgOutbound7d: number;
  isActive: boolean;
  onHand: number;
  reserved: number;
  risk: InventoryRisk;
  expiryDays?: number;
  supplyPrice: number | null;
  salePrice: number | null;
  currency: string | null;
  inventory?: NonNullable<Product['inventory']>;
}

const buildPayload = (input: Product): ProductPayloadRequest => {
  const normalized = normalizeProduct(input);

  const payload: ProductPayloadRequest = {
    productId: normalized.productId || undefined,
    legacyProductId: normalized.legacyProductId || undefined,
    sku: normalized.sku,
    name: normalized.name,
    category: normalized.category,
    subCategory: normalized.subCategory,
    brand: normalized.brand,
    unit: normalized.unit,
    packCase: normalized.packCase,
    pack: normalized.pack,
    casePack: normalized.casePack,
    abcGrade: normalized.abcGrade,
    xyzGrade: normalized.xyzGrade,
    bufferRatio: normalized.bufferRatio,
    dailyAvg: normalized.dailyAvg,
    dailyStd: normalized.dailyStd,
    totalInbound: normalized.totalInbound ?? 0,
    totalOutbound: normalized.totalOutbound ?? 0,
    avgOutbound7d: normalized.avgOutbound7d ?? 0,
    isActive: normalized.isActive,
    onHand: normalized.onHand,
    reserved: normalized.reserved,
    risk: normalized.risk,
    expiryDays: normalized.expiryDays,
    supplyPrice: normalized.supplyPrice,
    salePrice: normalized.salePrice,
    currency: normalized.currency ?? null,
    inventory: normalized.inventory && normalized.inventory.length > 0 ? normalized.inventory : undefined,
  };

  if (normalized.imageUrl) {
    payload.imageUrl = normalized.imageUrl;
  }

  return payload;
};

export async function fetchProducts(query?: string): Promise<Product[]> {
  const searchParams = new URLSearchParams();
  if (query && query.trim()) {
    searchParams.set('q', query.trim());
  }

  const path = searchParams.toString() ? `/products?${searchParams.toString()}` : '/products';
  const response = await request<ProductListResponse>(path, { method: 'GET' });
  return response.items.map((item) => toProduct(item));
}

export async function createProduct(input: Product): Promise<Product> {
  const response = await request<ProductItemResponse>('/products', {
    method: 'POST',
    body: buildPayload(input),
  });
  return toProduct(response.item);
}

export async function updateProduct(sku: string, input: Product): Promise<Product> {
  const response = await request<ProductItemResponse>(`/products/${encodeURIComponent(sku)}`, {
    method: 'PUT',
    body: buildPayload(input),
  });
  return toProduct(response.item);
}

export async function deleteProduct(sku: string): Promise<void> {
  await request<void>(`/products/${encodeURIComponent(sku)}`, { method: 'DELETE' });
}

export async function uploadProductImage(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await request<UploadProductImageResponse>('/product-images', {
    method: 'POST',
    body: formData,
  });

  if (!response?.url || typeof response.url !== 'string') {
    throw new Error('이미지 업로드에 실패했습니다. 다시 시도해 주세요.');
  }

  return response.url;
}
