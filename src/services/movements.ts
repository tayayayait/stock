import { buildQueryString, get, post } from './api';

export type MovementType = 'RECEIPT' | 'ISSUE' | 'ADJUST' | 'TRANSFER';

export interface MovementLocationSummary {
  warehouseCode?: string;
  locationCode?: string;
}

export interface MovementSummary {
  id: string;
  occurredAt: string;
  type: MovementType;
  qty: number;
  partnerId?: string;
  from?: MovementLocationSummary | null;
  to?: MovementLocationSummary | null;
}

export interface ListMovementsParams {
  sku: string;
  limit?: number;
  offset?: number;
  signal?: AbortSignal;
}

interface ApiMovement {
  id?: string | number;
  occurredAt?: string;
  createdAt?: string;
  type?: string;
  qty?: number;
  partnerId?: string | null;
  fromWarehouse?: string | null;
  fromLocation?: string | null;
  toWarehouse?: string | null;
  toLocation?: string | null;
}

interface ApiMovementListResponse {
  total?: number;
  count?: number;
  offset?: number;
  limit?: number;
  items?: ApiMovement[];
}

export interface MovementListResult {
  total: number;
  count: number;
  offset: number;
  limit: number;
  items: MovementSummary[];
}

const MOVEMENT_TYPES: readonly MovementType[] = ['RECEIPT', 'ISSUE', 'ADJUST', 'TRANSFER'] as const;

const normalizeMovementType = (value?: string): MovementType => {
  if (value && MOVEMENT_TYPES.includes(value as MovementType)) {
    return value as MovementType;
  }
  return 'ADJUST';
};

const normalizeLocation = (
  warehouse?: string | null,
  location?: string | null,
): MovementLocationSummary | null => {
  const normalizedWarehouse = typeof warehouse === 'string' && warehouse.trim() ? warehouse.trim() : undefined;
  const normalizedLocation = typeof location === 'string' && location.trim() ? location.trim() : undefined;

  if (!normalizedWarehouse && !normalizedLocation) {
    return null;
  }

  return {
    warehouseCode: normalizedWarehouse,
    locationCode: normalizedLocation,
  };
};

const normalizeId = (value: ApiMovement['id'], fallback: string): string => {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (typeof value === 'number') {
    return String(value);
  }

  return fallback;
};

const normalizePartner = (partnerId: ApiMovement['partnerId']): string | undefined => {
  if (typeof partnerId !== 'string') {
    return undefined;
  }

  const trimmed = partnerId.trim();
  return trimmed ? trimmed : undefined;
};

const normalizeOccurredAt = (value?: string): string => {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  return new Date(0).toISOString();
};

const normalizeQty = (qty?: number): number => {
  if (typeof qty === 'number' && Number.isFinite(qty)) {
    return qty;
  }
  return 0;
};

const normalizeMovements = (items: ApiMovement[] = []): MovementSummary[] =>
  items.map((item, index) => {
    const occurredAt = normalizeOccurredAt(item.occurredAt ?? item.createdAt);
    return {
      id: normalizeId(item.id, `movement-${index}-${occurredAt}`),
      occurredAt,
      type: normalizeMovementType(item.type),
      qty: normalizeQty(item.qty),
      partnerId: normalizePartner(item.partnerId),
      from: normalizeLocation(item.fromWarehouse, item.fromLocation),
      to: normalizeLocation(item.toWarehouse, item.toLocation),
    } satisfies MovementSummary;
  });

export async function listMovements(params: ListMovementsParams): Promise<MovementListResult> {
  const { sku, limit, offset, signal } = params;
  const normalizedSku = sku.trim();
  if (!normalizedSku) {
    throw new Error('SKU is required to request movements.');
  }

  const query = buildQueryString({ sku: normalizedSku, limit, offset });
  const path = `/api/movements${query}`;

  const response = await get<ApiMovementListResponse>(path, { signal });
  const items = normalizeMovements(response.items);

  return {
    total: typeof response.total === 'number' ? response.total : items.length,
    count: typeof response.count === 'number' ? response.count : items.length,
    offset: typeof response.offset === 'number' ? response.offset : offset ?? 0,
    limit: typeof response.limit === 'number' ? response.limit : limit ?? items.length,
    items,
  } satisfies MovementListResult;
}

export interface CreateMovementPayload {
  type: MovementType;
  sku: string;
  qty: number;
  userId: string;
  occurredAt?: string;
  partnerId?: string;
  refNo?: string;
  memo?: string;
  fromWarehouse?: string;
  fromLocation?: string;
  toWarehouse?: string;
  toLocation?: string;
}

export interface CreateMovementResult {
  movement?: {
    id: string;
  };
}

export async function submitMovement(payload: CreateMovementPayload): Promise<CreateMovementResult> {
  return post<CreateMovementResult>('/api/movements', payload);
}
