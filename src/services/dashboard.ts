import { get } from './api';

export type DashboardRangePreset = 'today' | '7d' | '30d' | '90d' | 'custom';

export interface DashboardMetricsRequest {
  range?: Exclude<DashboardRangePreset, 'custom'>;
  from?: string;
  to?: string;
  warehouseIds?: number[];
  categoryId?: string;
}

export interface DashboardStatusItem {
  key: string;
  label: string;
  status: string;
  value: number;
  color?: string;
}

export interface DashboardSalesPoint {
  key: string;
  label: string;
  value: number;
  previous?: number;
  date?: string;
}

export interface DashboardProductDetails {
  lowStock: number;
  groupCount: number;
  totalProducts: number;
  activeRatio: number;
}

export interface DashboardTopSellingItem {
  id: string | number;
  name: string;
  sku?: string;
  quantity: number;
  amount: number;
  currency?: string;
}

export interface DashboardRecentRecord {
  id: string | number;
  reference: string;
  name: string;
  status?: string;
  occurredAt: string;
  amount?: number;
  currency?: string;
}

export interface DashboardRecentLists {
  purchases: DashboardRecentRecord[];
  sales: DashboardRecentRecord[];
  packages: DashboardRecentRecord[];
}

export interface DashboardMetricsResponse {
  poStatus: DashboardStatusItem[];
  soStatus: DashboardStatusItem[];
  salesSummary: DashboardSalesPoint[];
  productDetails: DashboardProductDetails;
  topSelling: DashboardTopSellingItem[];
  recents: DashboardRecentLists;
}

export interface DashboardWarehouseOption {
  id: number;
  name: string;
  code?: string;
}

export interface DashboardCategoryOption {
  id: string;
  name: string;
}

export interface DashboardLookupsResponse {
  warehouses: DashboardWarehouseOption[];
  categories: DashboardCategoryOption[];
}

interface DashboardRequestOptions {
  signal?: AbortSignal;
}

const buildSearchParams = (filters: DashboardMetricsRequest) => {
  const params = new URLSearchParams();

  if (filters.range) {
    params.set('range', filters.range);
  }

  if (filters.from) {
    params.set('from', filters.from);
  }

  if (filters.to) {
    params.set('to', filters.to);
  }

  filters.warehouseIds
    ?.filter((value) => Number.isFinite(value))
    .forEach((value) => params.append('warehouseId', String(value)));

  if (filters.categoryId) {
    params.set('categoryId', filters.categoryId);
  }

  return params;
};

export function getDashboardMetrics(filters: DashboardMetricsRequest, options?: DashboardRequestOptions) {
  const params = buildSearchParams(filters);
  const query = params.toString();
  const path = query ? `/api/dashboard/metrics?${query}` : '/api/dashboard/metrics';

  return get<DashboardMetricsResponse>(path, { signal: options?.signal });
}

export function getDashboardLookups(options?: DashboardRequestOptions) {
  return get<DashboardLookupsResponse>('/api/dashboard/lookups', { signal: options?.signal });
}
