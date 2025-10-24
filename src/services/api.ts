import { emitInventoryRefreshEvent, type InventoryMovementLike } from '../app/utils/inventoryEvents';
import { request as httpRequest, type HttpError, type RequestOptions } from './http';

const FALLBACK_RELATIVE_BASE = '/api';

const trimTrailingSlashes = (value: string) => value.replace(/\/+$/, '');

const readViteEnv = () => {
  try {
    const meta = import.meta as ImportMeta & { env?: Record<string, string | undefined> };
    if (meta && typeof meta === 'object' && 'env' in meta) {
      return meta.env ?? {};
    }
  } catch {
    // `import.meta` is unavailable in some Node.js test environments.
  }

  return {} as Record<string, string | undefined>;
};

const resolveBaseURL = () => {
  const envUrl = (readViteEnv().VITE_API_URL ?? '').trim();
  if (envUrl) {
    return trimTrailingSlashes(envUrl);
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = trimTrailingSlashes(window.location.origin);
    const fallbackBase = trimTrailingSlashes(
      FALLBACK_RELATIVE_BASE.startsWith('/') ? FALLBACK_RELATIVE_BASE : `/${FALLBACK_RELATIVE_BASE}`,
    );
    return `${origin}${fallbackBase}`;
  }

  return FALLBACK_RELATIVE_BASE;
};

const baseURL = resolveBaseURL();

const isAbsoluteUrl = (value: string) => /^[a-z]+:\/\//i.test(value);

const buildRequestUrl = (path: string, base = baseURL) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;

  if (!base) {
    return normalizedPath;
  }

  if (isAbsoluteUrl(base)) {
    const trimmedBase = trimTrailingSlashes(base);

    try {
      const url = new URL(trimmedBase);
      const basePath = url.pathname.replace(/\/+$/, '');

      let pathToJoin = normalizedPath;
      if (basePath.endsWith('/api') && normalizedPath.startsWith('/api/')) {
        pathToJoin = normalizedPath.replace(/^\/api/, '') || '/';
      }

      const ensureLeadingSlash = (value: string) => (value.startsWith('/') ? value : `/${value}`);
      const joinedPath = `${basePath}${ensureLeadingSlash(pathToJoin)}` || '/';

      return `${url.origin}${joinedPath}`;
    } catch {
      return `${trimmedBase}${normalizedPath}`;
    }
  }

  const normalizedBase = trimTrailingSlashes(base);
  if (!normalizedBase) {
    return normalizedPath;
  }

  if (normalizedPath.startsWith(`${normalizedBase}/`)) {
    return normalizedPath;
  }

  return `${normalizedBase}${normalizedPath}`;
};

export function buildQueryString(params?: Record<string, unknown>): string {
  if (!params) {
    return '';
  }

  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (entry === undefined || entry === null) {
          return;
        }
        search.append(key, String(entry));
      });
      return;
    }

    const normalized = typeof value === 'string' ? value.trim() : value;
    if (normalized === '') {
      return;
    }

    search.set(key, String(normalized));
  });

  const query = search.toString();
  return query ? `?${query}` : '';
}

export class ApiError extends Error {
  constructor(message: string, public readonly status?: number, public readonly details?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

type ApiRequestInit = RequestOptions;

function isHttpError(error: unknown): error is HttpError {
  return Boolean(error) && typeof error === 'object' && 'status' in (error as Record<string, unknown>);
}

async function request<T>(path: string, init: ApiRequestInit = {}): Promise<T> {
  const { method = 'GET', headers, ...rest } = init;
  const baseHeaders = new Headers(headers);
  if (!baseHeaders.has('accept')) {
    baseHeaders.set('accept', 'application/json, text/plain, */*');
  }

  try {
    return await httpRequest<T>(buildRequestUrl(path), {
      ...rest,
      method,
      headers: baseHeaders,
    });
  } catch (error) {
    if (isHttpError(error)) {
      throw new ApiError(error.message, error.status, error.payload);
    }

    const fallbackMessage =
      'API 서버에 연결하지 못했습니다. 서버 실행 상태와 VITE_API_URL 설정을 확인해주세요.';

    if (error instanceof Error) {
      const normalized = error.message.trim().toLowerCase();
      if (normalized === 'request failed' || normalized === 'failed to fetch' || normalized === 'fetch failed') {
        throw new ApiError(fallbackMessage);
      }

      throw new ApiError(error.message);
    }

    throw new ApiError(fallbackMessage);
  }
}

export async function get<T>(path: string, init?: ApiRequestInit): Promise<T> {
  return request<T>(path, { ...init, method: 'GET' });
}

export async function post<T>(path: string, body?: unknown, init?: ApiRequestInit): Promise<T> {
  return request<T>(path, {
    ...init,
    method: init?.method ?? 'POST',
    body: body === undefined ? init?.body : body,
  });
}

export async function patch<T>(path: string, body?: unknown, init?: ApiRequestInit): Promise<T> {
  return post<T>(path, body, { ...init, method: 'PATCH' });
}

export async function del<T>(path: string, init?: ApiRequestInit): Promise<T> {
  return request<T>(path, { ...init, method: 'DELETE' });
}

export async function getRaw(path: string, init?: ApiRequestInit): Promise<Response> {
  const { method = 'GET', headers, body, ...rest } = init ?? {};
  const finalHeaders = new Headers(headers);
  if (!finalHeaders.has('accept')) {
    finalHeaders.set('accept', 'application/json, text/plain, */*');
  }

  const response = await fetch(buildRequestUrl(path), {
    ...rest,
    method,
    headers: finalHeaders,
    body: body as BodyInit | undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    const trimmed = text.trim();
    const looksLikeHtml = trimmed.startsWith('<');
    const statusLabel = response.statusText?.trim()
      ? `${response.status} ${response.statusText}`
      : `${response.status}`;
    const fallbackMessage = `API 요청이 실패했습니다. (HTTP ${statusLabel})`;
    const message = trimmed && !looksLikeHtml ? trimmed : fallbackMessage;
    throw new ApiError(message, response.status);
  }

  return response;
}

export interface ApiWarehouse {
  id: number;
  code: string;
  name: string;
  address?: string | null;
  notes?: string | null;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ApiLocation {
  id: string;
  code: string;
  description: string;
  warehouseCode: string;
  warehouse?: ApiWarehouse | null;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface WarehouseListResponse {
  items: ApiWarehouse[];
  count: number;
}

export interface LocationListResponse {
  items: ApiLocation[];
  count?: number;
}

export interface ListWarehousesParams {
  [key: string]: string | number | undefined;
  q?: string;
  page?: number;
  pageSize?: number;
}

export interface ListLocationsParams {
  [key: string]: string | number | undefined;
  q?: string;
  warehouseCode?: string;
}

export interface CreateLocationPayload {
  code: string;
  warehouseCode: string;
  description?: string | null;
}

const normalizeLocationPayload = (payload: CreateLocationPayload): CreateLocationPayload => {
  const normalized: CreateLocationPayload = {
    code: payload.code.trim(),
    warehouseCode: payload.warehouseCode.trim(),
  };

  if (payload.description !== undefined) {
    if (payload.description === null) {
      normalized.description = null;
    } else {
      normalized.description = payload.description.trim();
    }
  }

  return normalized;
};

const buildSearchParams = (params?: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams();

  if (!params) {
    return search;
  }

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }

    search.set(key, String(value));
  });

  return search;
};

export interface NormalizedWarehouseListResponse {
  items: ApiWarehouse[];
  count: number;
}

const normalizeWarehouseListResponse = (response: WarehouseListResponse): NormalizedWarehouseListResponse => {
  const items = Array.isArray(response.items) ? response.items : [];
  const count = typeof response.count === 'number' ? response.count : items.length;

  return { items, count };
};

export async function fetchWarehouses(params?: ListWarehousesParams): Promise<NormalizedWarehouseListResponse> {
  const search = buildSearchParams(params);
  const query = search.toString();
  const path = query ? `/api/warehouses?${query}` : '/api/warehouses';

  const response = await get<WarehouseListResponse>(path);
  return normalizeWarehouseListResponse(response);
}

type WarehousePayloadBase = {
  code: string;
  name: string;
  address?: string | null;
  notes?: string | null;
};

export interface CreateWarehousePayload extends WarehousePayloadBase {}

const normalizeWarehousePayload = <T extends WarehousePayloadBase>(
  payload: T,
): Omit<T, keyof WarehousePayloadBase> & WarehousePayloadBase => {
  const { code, name, address, notes, ...rest } = payload;

  const normalized: Omit<T, keyof WarehousePayloadBase> & WarehousePayloadBase = {
    ...(rest as Omit<T, keyof WarehousePayloadBase>),
    code: code.trim(),
    name: name.trim(),
  };

  if (address !== undefined) {
    normalized.address = address === null ? null : address.trim();
  }

  if (notes !== undefined) {
    normalized.notes = notes === null ? null : notes.trim();
  }

  return normalized;
};

type ApiItemEnvelope<T> = { item: T };

const unwrapItemEnvelope = <T>(value: ApiItemEnvelope<T> | T | null | undefined): T => {
  if (value && typeof value === 'object' && 'item' in value) {
    const { item } = value as ApiItemEnvelope<T>;
    if (item !== undefined) {
      return item;
    }
  }

  return value as T;
};

export async function createWarehouse(payload: CreateWarehousePayload) {
  const response = await post<ApiItemEnvelope<ApiWarehouse> | ApiWarehouse>(
    '/api/warehouses',
    normalizeWarehousePayload(payload),
  );

  return unwrapItemEnvelope<ApiWarehouse>(response);
}

export interface UpdateWarehousePayload {
  name: string;
  address?: string | null;
  notes?: string | null;
}

export async function updateWarehouse(code: string, payload: UpdateWarehousePayload) {
  const normalized = normalizeWarehousePayload({ code, ...payload });
  return post<ApiWarehouse>(`/api/warehouses/${encodeURIComponent(normalized.code)}`, normalized, { method: 'PUT' });
}

export async function deleteWarehouse(code: string) {
  return del<void>(`/api/warehouses/${encodeURIComponent(code)}`);
}

export async function fetchLocations(warehouseCode: string, params?: ListLocationsParams) {
  const search = buildSearchParams({ warehouseCode, ...params });
  if (warehouseCode && !search.has('warehouseCode')) {
    search.set('warehouseCode', warehouseCode);
  }

  const query = search.toString();
  const path = query ? `/api/locations?${query}` : '/api/locations';
  return get<LocationListResponse>(path);
}

export async function createLocation(payload: CreateLocationPayload) {
  const response = await post<ApiItemEnvelope<ApiLocation> | ApiLocation>(
    '/api/locations',
    normalizeLocationPayload(payload),
  );

  return unwrapItemEnvelope<ApiLocation>(response);
}

export interface UpdateLocationPayload {
  code: string;
  warehouseCode: string;
  description: string;
}

export async function updateLocation(locationCode: string, payload: UpdateLocationPayload) {
  return post<ApiLocation>(`/api/locations/${encodeURIComponent(locationCode)}`, payload, { method: 'PUT' });
}

export async function deleteLocation(locationCode: string) {
  return del<void>(`/api/locations/${encodeURIComponent(locationCode)}`);
}

export interface ApiStockLevel {
  locationId: number;
  quantity: number;
  location?: ApiLocation | null;
}

export interface ApiStockLevelItem {
  productId: number;
  product: {
    id: number;
    sku: string;
    name: string;
  };
  locationId: number;
  quantity: number;
  location?: ApiLocation | null;
}

export interface StockLevelListResponse {
  total: number;
  count: number;
  items: ApiStockLevelItem[];
}

export interface MovementPayload {
  productId: number;
  fromLocationId?: number;
  toLocationId?: number;
  change: number;
  reason?: string;
  lot?: string;
  workOrder?: string;
  userId?: string;
}

export interface MovementResponse {
  idempotent: boolean;
  movement: {
    id: number;
    productId: number;
    fromLocationId?: number;
    toLocationId?: number;
    change: number;
    reason?: string;
    lot?: string;
    workOrder?: string;
    userId?: string;
    idempotencyKey?: string;
    occurredAt: string;
    createdAt: string;
  };
  levels: ApiStockLevelItem[];
}

const toInventoryRefreshMovement = (response: MovementResponse): InventoryMovementLike => {
  const { movement } = response;
  const matchedLevel = response.levels.find((level) => level.productId === movement.productId);
  const productRecord = matchedLevel ?? response.levels[0];

  const detail: InventoryMovementLike = {
    id: movement.id,
    productId: movement.productId,
    change: movement.change,
    reason: movement.reason,
    occurredAt: movement.occurredAt,
    createdAt: movement.createdAt,
  };

  if (productRecord?.product) {
    detail.product = {
      id: productRecord.product.id,
      sku: productRecord.product.sku,
      name: productRecord.product.name,
    };
  } else {
    detail.product = {
      id: movement.productId,
    };
  }

  return detail;
};

export interface ImportCsvResponse {
  processed: number;
  summary: Array<{
    sku: string;
    productId: number;
    productName: string;
    warehouseCode: string;
    locationCode: string;
    previousQuantity: number;
    newQuantity: number;
    delta: number;
  }>;
}

export type ForecastPhase = 'history' | 'forecast';

export interface ForecastTimelinePoint {
  date: string;
  actual: number | null;
  forecast: number;
  lower: number;
  upper: number;
  phase: ForecastPhase;
  promo?: boolean;
}

export interface ForecastExplanation {
  summary: string;
  drivers: string[];
  details: string;
  model: {
    name: string;
    seasonalPeriod: number;
    trainingWindow: string;
    generatedAt: string;
    mape: number | null;
  };
}

export interface ForecastResponse {
  product: {
    id: number;
    sku: string;
    name: string;
    safetyStock: number;
    leadTimeDays: number;
    configuredReorderPoint: number;
    onHand: number;
    reserved: number;
    availableStock: number;
  };
  metrics: {
    windowStart: string;
    windowEnd: string;
    outboundTotal: number;
    outboundReasons: Record<string, number>;
    avgDailyDemand: number;
    currentTotalStock: number;
    reorderPoint: number;
    recommendedOrderQty: number;
    projectedStockoutDate: string | null;
  };
  sampleCalculation: {
    reorderPoint: string;
    recommendedOrderQty: string;
  };
  timeline: ForecastTimelinePoint[];
  explanation: ForecastExplanation;
}

export function fetchStockLevels(params?: { productId?: number; warehouseId?: number }) {
  const search = new URLSearchParams();
  if (params?.productId) search.set('productId', String(params.productId));
  if (params?.warehouseId) search.set('warehouseId', String(params.warehouseId));
  const query = search.toString();
  const path = query ? `/api/levels?${query}` : '/api/levels';
  return get<StockLevelListResponse>(path);
}

export function createMovement(payload: MovementPayload, idempotencyKey?: string) {
  return post<MovementResponse>('/api/movements', payload, {
    idempotencyKey,
  }).then((response) => {
    if (response?.movement) {
      emitInventoryRefreshEvent({
        source: 'adjustment',
        movements: [toInventoryRefreshMovement(response)],
      });
    }
    return response;
  });
}

export function importCsv(payload: { csvText: string }) {
  return post<ImportCsvResponse>('/api/import/csv', payload);
}

export function fetchHistoryCsv(params: { productId: number; from?: string; to?: string }) {
  const search = new URLSearchParams();
  search.set('productId', String(params.productId));
  if (params.from) search.set('from', params.from);
  if (params.to) search.set('to', params.to);
  return getRaw(`/api/reports/history?${search.toString()}`, {
    headers: { accept: 'text/csv' },
  });
}

export function fetchForecast(productId: number) {
  return get<ForecastResponse>(`/api/forecast/${productId}`);
}

export const __test__ = {
  FALLBACK_RELATIVE_BASE,
  trimTrailingSlashes,
  buildRequestUrl: (path: string, base?: string) => buildRequestUrl(path, base),
  isAbsoluteUrl,
};
