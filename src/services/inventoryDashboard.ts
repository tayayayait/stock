import { request } from './http';

export interface InventoryDashboardSummary {
  skuCount: number;
  shortageSkuCount: number;
  shortageRate: number;
  totalOnHand: number;
  totalReserved: number;
  totalAvailable: number;
  avgDaysOfSupply: number;
  inventoryTurnover: number;
  serviceLevelPercent: number;
}

export interface InventoryDashboardRiskDistribution {
  risk: string;
  count: number;
  ratio: number;
}

export interface InventoryDashboardWarehouseTotal {
  warehouseCode: string;
  onHand: number;
  reserved: number;
  available: number;
}

export interface InventoryDashboardMovementPoint {
  date: string;
  inbound: number;
  outbound: number;
  adjustments: number;
}

export interface InventoryDashboardShortage {
  sku: string;
  name: string;
  category: string;
  onHand: number;
  reserved: number;
  available: number;
  safetyStock: number;
  shortageQty: number;
  overstockQty: number;
  overstockRate: number;
  risk: string;
  dailyAvg: number;
  totalInbound: number;
  totalOutbound: number;
  primaryLocation: string | null;
  daysOfCover: number;
  fillRate: number;
  trend: number[];
}

export interface InventoryDashboardOverstock {
  sku: string;
  name: string;
  category: string;
  available: number;
  safetyStock: number;
  overstockQty: number;
  overstockRate: number;
  risk: string;
}

export interface InventoryDashboardSampleLocation {
  sku: string;
  name: string;
  locations: Array<{
    warehouseCode: string;
    locationCode: string;
    onHand: number;
    reserved: number;
  }>;
}

export interface InventoryDashboardInsights {
  shortages: InventoryDashboardShortage[];
  overstock: InventoryDashboardOverstock[];
  sampleLocations: InventoryDashboardSampleLocation[];
}

export interface InventoryDashboardResponse {
  generatedAt: string;
  summary: InventoryDashboardSummary;
  riskDistribution: InventoryDashboardRiskDistribution[];
  warehouseTotals: InventoryDashboardWarehouseTotal[];
  movementHistory: InventoryDashboardMovementPoint[];
  insights: InventoryDashboardInsights;
}

export async function fetchInventoryDashboard(): Promise<InventoryDashboardResponse> {
  return request<InventoryDashboardResponse>('/inventory/dashboard', { method: 'GET' });
}

export interface InventoryAnalysisRange {
  from: string;
  to: string;
  dayCount: number;
  groupBy: 'week' | 'month';
}

export interface InventoryAnalysisTotals {
  inbound: number;
  outbound: number;
  adjustments: number;
  net: number;
  currentOnHand: number;
  currentReserved: number;
  currentAvailable: number;
  safetyStock: number;
  avgDailyOutbound: number;
  stockoutEtaDays: number | null;
  projectedStockoutDate: string | null;
}

export interface InventoryStockPoint {
  date: string;
  onHand: number;
  available: number;
  safetyStock: number;
}

export interface InventoryPeriodSummary {
  periodStart: string;
  periodEnd: string;
  label: string;
  inbound: number;
  outbound: number;
  adjustments: number;
  net: number;
  endingOnHand: number;
  endingAvailable: number;
  safetyStock: number;
}

export interface InventoryAnalysisResponse {
  generatedAt: string;
  range: InventoryAnalysisRange;
  scope: {
    warehouseCode: string | null;
    sku: string | null;
  };
  totals: InventoryAnalysisTotals;
  movementSeries: InventoryDashboardMovementPoint[];
  stockSeries: InventoryStockPoint[];
  periodSeries: InventoryPeriodSummary[];
}

export interface InventoryWarehouseItemTrendPoint {
  date: string;
  outbound: number;
}

export interface InventoryWarehouseItem {
  sku: string;
  name: string;
  category: string;
  onHand: number;
  reserved: number;
  available: number;
  inbound: number;
  outbound: number;
  safetyStock: number;
  avgDailyOutbound: number;
  avgDailyInbound: number;
  stockoutEtaDays: number | null;
  projectedStockoutDate: string | null;
  trend: InventoryWarehouseItemTrendPoint[];
}

export interface InventoryWarehouseItemsResponse {
  generatedAt: string;
  warehouseCode: string;
  range: {
    from: string;
    to: string;
    dayCount: number;
  };
  totals: {
    inbound: number;
    outbound: number;
    avgDailyOutbound: number;
    avgDailyInbound: number;
    onHand: number;
    reserved: number;
    available: number;
    safetyStock: number;
    stockoutEtaDays: number | null;
    projectedStockoutDate: string | null;
  };
  movementSeries: InventoryDashboardMovementPoint[];
  items: InventoryWarehouseItem[];
}

export async function fetchInventoryAnalysis(params: {
  from: string;
  to: string;
  warehouseCode?: string | null;
  sku?: string | null;
  groupBy?: 'week' | 'month';
}): Promise<InventoryAnalysisResponse> {
  const search = new URLSearchParams();
  search.set('from', params.from);
  search.set('to', params.to);
  if (params.warehouseCode) {
    search.set('warehouseCode', params.warehouseCode);
  }
  if (params.sku) {
    search.set('sku', params.sku);
  }
  if (params.groupBy) {
    search.set('groupBy', params.groupBy);
  }
  const query = search.toString();
  const path = query ? `/inventory/analysis?${query}` : '/inventory/analysis';
  return request<InventoryAnalysisResponse>(path, { method: 'GET' });
}

export async function fetchInventoryWarehouseItems(params: {
  from: string;
  to: string;
  warehouseCode: string;
}): Promise<InventoryWarehouseItemsResponse> {
  const search = new URLSearchParams();
  search.set('from', params.from);
  search.set('to', params.to);
  search.set('warehouseCode', params.warehouseCode);
  const query = search.toString();
  const path = `/inventory/warehouse-items?${query}`;
  return request<InventoryWarehouseItemsResponse>(path, { method: 'GET' });
}
