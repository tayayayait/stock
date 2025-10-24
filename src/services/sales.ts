import { emitInventoryRefreshEvent } from '../app/utils/inventoryEvents';
import { buildQueryString, get, post } from './api';
import {
  buildPaginationParams,
  createIdempotencyHeaders,
  IdempotentRequestOptions,
  PaginationRequest,
  PaginationResult,
} from './common';

export type SalesOrderStatus = 'draft' | 'picking' | 'packed' | 'shipped';

export interface SalesOrderCustomer {
  id: number;
  name: string;
  email?: string;
  phone?: string;
}

export interface SalesOrderWarehouse {
  id: number;
  code: string;
  name: string;
}

export interface SalesOrderLineProduct {
  id: number;
  sku: string;
  name: string;
}

export interface SalesOrderLine {
  id: number;
  salesOrderId: number;
  productId: number;
  quantityOrdered: number;
  quantityFulfilled: number;
  rate: string;
  discountPercent?: string;
  taxPercent?: string;
  lineAmount: string;
  notes?: string;
  product?: SalesOrderLineProduct;
}

export interface SalesOrder {
  id: number;
  orderNumber: string;
  customerId: number;
  warehouseId?: number;
  orderDate?: string;
  shipmentDate?: string;
  status: SalesOrderStatus;
  totalAmount: string;
  currency?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  customer?: SalesOrderCustomer;
  warehouse?: SalesOrderWarehouse;
  lines: SalesOrderLine[];
}

export interface ListSalesOrdersParams extends PaginationRequest {
  [key: string]: unknown;
  status?: SalesOrderStatus;
  customerId?: number;
  warehouseId?: number;
  search?: string;
  from?: string;
  to?: string;
}

export function listSalesOrders(params?: ListSalesOrdersParams) {
  const search = buildPaginationParams(params);
  const query = search.toString();
  const path = query ? `/api/sales/orders?${query}` : '/api/sales/orders';

  return get<PaginationResult<SalesOrder>>(path);
}

export interface SalesOrderListRecord {
  id: number;
  orderNumber: string;
  status: SalesOrderStatus;
  orderDate?: string;
  shipmentDate?: string | null;
  customerName?: string;
  totalAmount: string;
  currency?: string;
  warehouseName?: string;
}

export interface SalesOrderListPage extends PaginationResult<SalesOrderListRecord> {
  page: number;
  pageSize: number;
  hasNextPage: boolean;
}

export async function fetchSalesOrderList(
  params: ListSalesOrdersParams = {},
): Promise<SalesOrderListPage> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;
  const query = buildQueryString({
    page,
    pageSize,
    status: params.status,
    customerId: params.customerId,
    warehouseId: params.warehouseId,
    q: params.search?.trim() || undefined,
    from: params.from,
    to: params.to,
    sort: params.sort,
  });

  const payload = await get<PaginationResult<SalesOrder>>(`/api/sales-orders${query}`);

  const items = (payload.items ?? []).map((order) => ({
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    orderDate: order.orderDate,
    shipmentDate: order.shipmentDate ?? null,
    customerName: order.customer?.name,
    totalAmount: order.totalAmount,
    currency: order.currency,
    warehouseName: order.warehouse?.name,
  }));

  return {
    total: payload.total ?? items.length,
    count: payload.count ?? items.length,
    items,
    page,
    pageSize,
    hasNextPage: page * pageSize < payload.total,
  };
}

export function getSO(orderId: number) {
  return get<SalesOrder>(`/api/sales/orders/${orderId}`);
}

export interface SalesOrderLineInput {
  productId: number;
  quantityOrdered: number;
  rate: string;
  discountPercent?: string;
  taxPercent?: string;
  lineAmount: string;
  notes?: string;
}

export interface CreateSalesOrderRequest {
  orderNumber: string;
  customerId: number;
  warehouseId?: number;
  orderDate?: string;
  shipmentDate?: string;
  currency?: string;
  totalAmount: string;
  notes?: string;
  lines: SalesOrderLineInput[];
}

export function createSO(payload: CreateSalesOrderRequest) {
  return post<SalesOrder>('/api/sales/orders', payload);
}

export function confirmSO(orderId: number) {
  return post<SalesOrder>(`/api/sales/orders/${orderId}/confirm`);
}

export function packSO(orderId: number) {
  return post<SalesOrder>(`/api/sales/orders/${orderId}/pack`);
}

export interface ShipSalesOrderLineInput {
  lineId: number;
  quantity: number;
  locationId?: number;
}

export interface ShipSalesOrderRequest {
  shipmentDate?: string | null;
  occurredAt?: string;
  userId?: string;
  lines: ShipSalesOrderLineInput[];
}

export interface StockMovementLocationWarehouse {
  id: number;
  code: string;
  name: string;
}

export interface StockMovementLocation {
  id: number;
  code: string;
  name: string;
  type?: string;
  warehouseId: number;
  warehouse?: StockMovementLocationWarehouse;
}

export interface StockMovementProduct {
  id: number;
  sku: string;
  name: string;
}

export interface StockMovement {
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
  product?: StockMovementProduct;
  fromLocation?: StockMovementLocation;
  toLocation?: StockMovementLocation;
}

export interface StockLevelLocation {
  id: number;
  code: string;
  name: string;
  type?: string;
  warehouseId: number;
  warehouse?: StockMovementLocationWarehouse;
}

export interface StockLevelSnapshot {
  productId: number;
  locationId: number;
  quantity: number;
  location?: StockLevelLocation;
}

export interface ShipSalesOrderResponse {
  idempotent: boolean;
  order: SalesOrder;
  movements: StockMovement[];
  levels: StockLevelSnapshot[];
}

export function shipSO(
  orderId: number,
  payload: ShipSalesOrderRequest,
  options?: IdempotentRequestOptions,
) {
  return post<ShipSalesOrderResponse>(
    `/api/sales/orders/${orderId}/ship`,
    payload,
    {
      headers: createIdempotencyHeaders(options?.idempotencyKey),
    },
  ).then((response) => {
    if (response?.movements?.length) {
      emitInventoryRefreshEvent({ source: 'sales', movements: response.movements });
    }
    return response;
  });
}

export interface InvoiceLineSummary {
  id: number;
  invoiceId: number;
  productId: number;
  description?: string;
  quantity: string;
  rate: string;
  discountPercent?: string;
  taxPercent?: string;
  lineAmount: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  product?: StockMovementProduct;
}

export interface InvoiceCustomerSummary {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  billingAddress?: string;
  shippingAddress?: string;
}

export interface InvoiceSalesOrderSummary {
  id: number;
  orderNumber: string;
  status: SalesOrderStatus;
  totalAmount: string;
  currency?: string;
}

export interface Invoice {
  id: number;
  invoiceNumber: string;
  salesOrderId?: number;
  customerId: number;
  issueDate?: string;
  dueDate?: string;
  status?: string;
  totalAmount: string;
  amountPaid: string;
  currency?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  customer?: InvoiceCustomerSummary;
  salesOrder?: InvoiceSalesOrderSummary;
  lines: InvoiceLineSummary[];
}

export interface CreateInvoiceLineRequest {
  productId: number;
  description?: string;
  quantity: string;
  rate: string;
  discountPercent?: string;
  taxPercent?: string;
  lineAmount: string;
  notes?: string;
}

export interface CreateInvoiceRequest {
  invoiceNumber: string;
  salesOrderId?: number;
  customerId: number;
  issueDate?: string;
  dueDate?: string;
  status?: string;
  totalAmount: string;
  amountPaid?: string;
  currency?: string;
  notes?: string;
  lines: CreateInvoiceLineRequest[];
}

export function createInvoice(payload: CreateInvoiceRequest) {
  return post<Invoice>('/api/invoices', payload);
}

export interface CreateSalesReturnLineRequest {
  lineId: number;
  quantity: number;
  locationId: number;
}

export interface CreateSalesReturnRequest {
  salesOrderId: number;
  reason?: string;
  lines: CreateSalesReturnLineRequest[];
}

export interface CreateSalesReturnResponse {
  idempotent: boolean;
  movements: StockMovement[];
  levels: StockLevelSnapshot[];
}

export function createReturn(
  payload: CreateSalesReturnRequest,
  options?: IdempotentRequestOptions,
) {
  return post<CreateSalesReturnResponse>('/api/returns', payload, {
    headers: createIdempotencyHeaders(options?.idempotencyKey),
  }).then((response) => {
    if (response?.movements?.length) {
      emitInventoryRefreshEvent({ source: 'returns', movements: response.movements });
    }
    return response;
  });
}
