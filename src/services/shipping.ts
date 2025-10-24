import { get, post } from './api';

export type ShippingStatusCode =
  | 'label_created'
  | 'picked_up'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'exception';

export interface ShippingStatusDetail {
  code: ShippingStatusCode;
  label: string;
  description: string;
}

export interface ShippingRate {
  carrierId: string;
  carrierName: string;
  serviceCode: string;
  serviceName: string;
  currency: string;
  amount: number;
  estimatedTransitDays: {
    min: number;
    max: number;
  };
}

export interface FetchShippingRatesParams {
  weightKg: number;
  carrierId?: string;
}

export interface ShippingLabelAsset {
  data: string;
  contentType: string;
  filename: string;
}

export interface CreateShippingLabelRequest {
  orderId: number;
  carrierId: string;
  serviceCode: string;
  weightKg: number;
  shipTo: {
    name: string;
    phone?: string;
    address1: string;
    address2?: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
  };
  shipFrom?: {
    warehouseId?: number;
    warehouseName?: string;
  };
  reference?: string;
}

export interface CreateShippingLabelResponse {
  packageId: string;
  trackingNumber: string;
  amount: number;
  currency: string;
  status: ShippingStatusDetail;
  estimatedDelivery?: string;
  label?: ShippingLabelAsset;
}

export interface TrackingHistoryEntry {
  status: ShippingStatusDetail;
  description: string;
  occurredAt: string;
}

export interface ShippingTrackingResponse {
  trackingNumber: string;
  carrierId: string;
  carrierName: string;
  status: ShippingStatusDetail;
  estimatedDelivery?: string;
  lastUpdated: string;
  history: TrackingHistoryEntry[];
}

export interface ListPackagesParams {
  q?: string;
  status?: ShippingStatusCode | `${ShippingStatusCode},${string}`;
  warehouseId?: number;
  from?: string;
  to?: string;
}

export interface PackageSummary {
  id: string;
  orderId: number;
  carrierId: string;
  carrierName: string;
  serviceCode: string;
  serviceName: string;
  trackingNumber: string;
  status: ShippingStatusDetail;
  shippedAt: string;
  updatedAt: string;
  estimatedDelivery?: string;
  warehouseId?: number;
  warehouseName?: string;
}

export async function fetchShippingRates(params: FetchShippingRatesParams) {
  const search = new URLSearchParams();
  search.set('weightKg', params.weightKg.toString());
  if (params.carrierId) {
    search.set('carrierId', params.carrierId);
  }

  const path = `/api/shipping/rates?${search.toString()}`;
  const payload = await get<{ rates: ShippingRate[] }>(path);
  return payload.rates;
}

export function createShippingLabel(payload: CreateShippingLabelRequest) {
  return post<CreateShippingLabelResponse>('/api/shipping/labels', payload);
}

export function fetchTracking(trackingNumber: string) {
  return get<ShippingTrackingResponse>(`/api/shipping/track/${encodeURIComponent(trackingNumber)}`);
}

export async function fetchPackages(
  params?: ListPackagesParams,
  init?: { signal?: AbortSignal },
): Promise<{ data: PackageSummary[] }> {
  const search = new URLSearchParams();

  if (params?.q) {
    search.set('q', params.q);
  }
  if (params?.status) {
    search.set('status', params.status);
  }
  if (typeof params?.warehouseId === 'number' && Number.isFinite(params.warehouseId)) {
    search.set('warehouseId', String(params.warehouseId));
  }
  if (params?.from) {
    search.set('from', params.from);
  }
  if (params?.to) {
    search.set('to', params.to);
  }

  const query = search.toString();
  const path = query ? `/api/packages?${query}` : '/api/packages';
  return get<{ data: PackageSummary[] }>(path, init);
}
