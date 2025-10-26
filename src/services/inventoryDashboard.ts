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

