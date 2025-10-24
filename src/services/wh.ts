import { emitInventoryRefreshEvent } from '../app/utils/inventoryEvents';
import { get, post } from './http';
import {
  buildPaginationParams,
  createIdempotencyHeaders,
  IdempotentRequestOptions,
  PaginationRequest,
  PaginationResult,
} from './common';

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  address?: string;
  notes?: string;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ListWarehousesParams extends PaginationRequest {
  [key: string]: unknown;
  q?: string;
}

export interface CreateWarehouseRequest {
  code: string;
  name: string;
  address?: string;
  notes?: string;
  isActive?: boolean;
}

export interface WarehouseListResponse extends PaginationResult<Warehouse> {}

export function listWarehouses(params?: ListWarehousesParams) {
  const search = buildPaginationParams(params);
  const query = search.toString();
  const path = query ? `/api/warehouses?${query}` : '/api/warehouses';

  return get<WarehouseListResponse>(path);
}

export function createWarehouse(payload: CreateWarehouseRequest) {
  return post<Warehouse>('/api/warehouses', payload);
}

export interface LocationWarehouseSummary {
  id: string;
  code: string;
  name: string;
}

export interface Location {
  id: string;
  code: string;
  name?: string;
  description?: string;
  type?: string;
  warehouseCode: string;
  warehouse?: LocationWarehouseSummary;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ListLocationsParams extends PaginationRequest {
  [key: string]: unknown;
  q?: string;
}

export interface CreateLocationRequest {
  code: string;
  name?: string;
  description?: string;
  type?: string;
  isActive?: boolean;
}

export interface LocationListResponse extends PaginationResult<Location> {}

export function listLocations(warehouseCode: string, params?: ListLocationsParams) {
  const search = buildPaginationParams({ ...params, warehouseCode });
  if (warehouseCode && !search.has('warehouseCode')) {
    search.set('warehouseCode', warehouseCode);
  }
  const query = search.toString();
  const path = query ? `/api/locations?${query}` : '/api/locations';

  return get<LocationListResponse>(path);
}

export function createLocation(warehouseCode: string, payload: CreateLocationRequest) {
  const description = payload.description ?? payload.name ?? payload.code;
  return post<Location>('/api/locations', {
    code: payload.code,
    warehouseCode,
    description,
  });
}

export type TransferOrderStatus = 'draft' | 'approved' | 'completed';

export interface TransferOrderWarehouseSummary {
  id: number;
  code: string;
  name: string;
}

export interface TransferOrderLocationSummary {
  id: number;
  code: string;
  name: string;
  type?: string;
  warehouseId: number;
  warehouse?: TransferOrderWarehouseSummary;
}

export interface TransferOrderLineProductSummary {
  id: number;
  sku: string;
  name: string;
}

export interface TransferOrderLine {
  id: number;
  transferOrderId: number;
  productId: number;
  quantity: number;
  status: TransferOrderStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  product?: TransferOrderLineProductSummary;
}

export interface TransferOrder {
  id: number;
  fromLocationId: number;
  toLocationId: number;
  status: TransferOrderStatus;
  notes?: string;
  workOrder?: string;
  completionKey?: string;
  approvedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  fromLocation?: TransferOrderLocationSummary;
  toLocation?: TransferOrderLocationSummary;
  lines: TransferOrderLine[];
}

export interface TransferOrderStockLevel {
  productId: number;
  locationId: number;
  quantity: number;
  location?: TransferOrderLocationSummary;
}

export interface TransferOrderMovement {
  id: number;
  productId: number;
  fromLocationId?: number;
  toLocationId?: number;
  change: number;
  reason?: string;
  workOrder?: string;
  idempotencyKey?: string;
  transferOrderId?: number;
  transferOrderLineId?: number;
  occurredAt: string;
  createdAt: string;
  product?: TransferOrderLineProductSummary;
  fromLocation?: TransferOrderLocationSummary;
  toLocation?: TransferOrderLocationSummary;
}

export interface CreateTransferOrderLineRequest {
  productId: number;
  quantity: number;
  notes?: string;
}

export interface CreateTransferOrderRequest {
  fromLocationId: number;
  toLocationId: number;
  notes?: string;
  lines: CreateTransferOrderLineRequest[];
}

export interface TransferOrderResponse {
  order: TransferOrder;
  stock: TransferOrderStockLevel[];
}

export interface CreateTransferOrderResponse extends TransferOrderResponse {}

export interface ApproveTransferOrderResponse extends TransferOrderResponse {}

export interface CompleteTransferOrderResponse extends TransferOrderResponse {
  idempotent: boolean;
  movements: TransferOrderMovement[];
}

export function createTO(payload: CreateTransferOrderRequest) {
  return post<CreateTransferOrderResponse>('/api/transfer-orders', payload);
}

export function approveTO(transferId: number) {
  return post<ApproveTransferOrderResponse>(`/api/transfer-orders/${transferId}/approve`);
}

export function completeTO(
  transferId: number,
  options?: IdempotentRequestOptions,
) {
  return post<CompleteTransferOrderResponse>(`/api/transfer-orders/${transferId}/complete`, undefined, {
    headers: createIdempotencyHeaders(options?.idempotencyKey),
  }).then((response) => {
    if (response?.movements?.length) {
      emitInventoryRefreshEvent({ source: 'transfers', movements: response.movements });
    }
    return response;
  });
}
