import { get } from './api';
import {
  listSalesOrders,
  type ListSalesOrdersParams,
  type SalesOrderStatus,
  type StockMovement,
  type StockMovementLocation,
  type StockMovementProduct,
} from './sales';

export interface DashboardKeyPerformanceIndicators {
  todaysShipmentCount: number;
  lowStockSkuCount: number;
  openSalesOrderCount: number;
}

export type DashboardMovementSource = 'shipment' | 'transfer' | 'return' | 'adjustment' | 'unknown';

export interface DashboardMovement
  extends Pick<StockMovement, 'id' | 'productId' | 'change' | 'reason' | 'occurredAt' | 'createdAt'> {
  source: DashboardMovementSource;
  reference?: string;
  product?: StockMovementProduct;
  fromLocation?: StockMovementLocation;
  toLocation?: StockMovementLocation;
}

export interface DashboardSummary {
  kpis: DashboardKeyPerformanceIndicators;
  movements: DashboardMovement[];
}

interface MovementListResponse {
  items: StockMovement[];
}

function startOfToday(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function endOfToday(): Date {
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  return now;
}

function inferMovementSource(reason?: string): DashboardMovementSource {
  if (!reason) {
    return 'unknown';
  }

  const normalized = reason.toUpperCase();
  if (normalized.includes('SHIP')) {
    return 'shipment';
  }
  if (normalized.includes('TRANSFER')) {
    return 'transfer';
  }
  if (normalized.includes('RETURN')) {
    return 'return';
  }
  if (normalized.includes('ADJUST')) {
    return 'adjustment';
  }

  return 'unknown';
}

type SalesOrderCountParams = Partial<Omit<ListSalesOrdersParams, 'status'>>;

async function fetchSalesOrderCount(
  status: SalesOrderStatus,
  extra?: SalesOrderCountParams,
): Promise<number> {
  const params: ListSalesOrdersParams = {
    status,
    page: 1,
    pageSize: 1,
    ...(extra ?? {}),
  };

  const response = await listSalesOrders(params);
  return response.total;
}

async function fetchRecentMovements(limit = 10): Promise<DashboardMovement[]> {
  const search = new URLSearchParams();
  search.set('limit', String(Math.max(1, limit)));
  const path = `/api/reports/movements?${search.toString()}`;
  const payload = await get<MovementListResponse>(path);
  const items = Array.isArray(payload.items) ? payload.items : [];

  return items.slice(0, limit).map((movement) => ({
    id: movement.id,
    productId: movement.productId,
    change: movement.change,
    occurredAt: movement.occurredAt,
    createdAt: movement.createdAt,
    reason: movement.reason,
    product: movement.product,
    fromLocation: movement.fromLocation,
    toLocation: movement.toLocation,
    reference: movement.workOrder ?? movement.idempotencyKey,
    source: inferMovementSource(movement.reason),
  }));
}

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const [todaysShipments, pickingOrders, packedOrders, draftOrders, movements] = await Promise.all([
    fetchSalesOrderCount('shipped', {
      from: startOfToday().toISOString(),
      to: endOfToday().toISOString(),
    }),
    fetchSalesOrderCount('picking'),
    fetchSalesOrderCount('packed'),
    fetchSalesOrderCount('draft'),
    fetchRecentMovements(10),
  ]);

  return {
    kpis: {
      todaysShipmentCount: todaysShipments,
      openSalesOrderCount: pickingOrders + packedOrders + draftOrders,
      lowStockSkuCount: 0,
    },
    movements,
  };
}
