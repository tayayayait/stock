import { emitInventoryRefreshEvent, type InventoryMovementLike } from '../app/utils/inventoryEvents';
import type { ProductRecordMock } from '../mocks/products';
import { productCatalog } from '../mocks/products';

export type PartnerType = 'SUPPLIER' | 'CUSTOMER';

export interface Partner {
  id: string;
  type: PartnerType;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  isSample?: boolean;
  isActive: boolean;
}

export interface ListPartnersOptions {
  type?: PartnerType;
  includeSample?: boolean;
}

export interface CreatePartnerInput {
  type: PartnerType;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export interface UpdatePartnerInput {
  id: string;
  type?: PartnerType;
  name?: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

export type OrderStatus = 'DRAFT' | 'OPEN' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';

export interface OrderStatusChangeEvent {
  id: string;
  orderId: string;
  kind: 'STATUS';
  from: OrderStatus;
  to: OrderStatus;
  occurredAt: string;
  note?: string;
}

export interface OrderFulfillmentLineEvent {
  sku: string;
  quantity: number;
  warehouseCode: string;
  locationCode: string;
}

export interface OrderFulfillmentEvent {
  id: string;
  orderId: string;
  kind: 'RECEIVE' | 'SHIP';
  occurredAt: string;
  note?: string;
  lines: OrderFulfillmentLineEvent[];
}

export type OrderEvent = OrderStatusChangeEvent | OrderFulfillmentEvent;

interface BaseOrder {
  id: string;
  partnerId: string;
  status: OrderStatus;
  createdAt: string;
  scheduledAt: string;
  memo?: string;
  events: OrderEvent[];
  warehouseId?: string;
  warehouseCode?: string;
  detailedLocationId?: string;
  detailedLocationCode?: string;
}

export interface PurchaseOrderItem {
  orderId: string;
  sku: string;
  qty: number;
  unit: string;
  receivedQty: number;
  warehouseCode?: string;
  locationCode?: string;
}

export interface PurchaseOrder extends BaseOrder {
  type: 'PURCHASE';
  items: PurchaseOrderItem[];
}

export interface SalesOrderItem {
  orderId: string;
  sku: string;
  qty: number;
  unit: string;
  shippedQty: number;
  warehouseCode?: string;
  locationCode?: string;
}

export interface SalesOrder extends BaseOrder {
  type: 'SALES';
  items: SalesOrderItem[];
}

export interface PurchaseOrderSummary {
  id: string;
  partnerId: string;
  partnerName: string;
  status: OrderStatus;
  createdAt: string;
  scheduledAt: string;
  totalQty: number;
  receivedQty: number;
  warehouseId?: string;
  warehouseCode?: string;
  detailedLocationId?: string;
  detailedLocationCode?: string;
}

export interface SalesOrderSummary {
  id: string;
  partnerId: string;
  partnerName: string;
  status: OrderStatus;
  createdAt: string;
  scheduledAt: string;
  totalQty: number;
  shippedQty: number;
  warehouseId?: string;
  warehouseCode?: string;
  detailedLocationId?: string;
  detailedLocationCode?: string;
}

export interface CreatePurchaseOrderInput {
  partnerId: string;
  items: Array<{ sku: string; qty: number; unit: string }>;
  memo?: string;
  status?: OrderStatus;
  warehouseId: string;
  warehouseCode: string;
  detailedLocationId: string;
  detailedLocationCode: string;
  scheduledAt: string;
}

export interface CreateSalesOrderInput {
  partnerId: string;
  items: Array<{ sku: string; qty: number; unit: string }>;
  memo?: string;
  status?: OrderStatus;
  warehouseId: string;
  warehouseCode: string;
  detailedLocationId: string;
  detailedLocationCode: string;
  scheduledAt: string;
}

export interface FulfillmentInput {
  note?: string;
  lines: Array<{ sku: string; quantity: number; warehouseCode: string; locationCode: string }>;
}

const clone = <T>(value: T): T => {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
};

const generateId = (prefix: string): string => {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${random}`;
};

const findProductRecord = (sku: string): ProductRecordMock | undefined =>
  productCatalog.items.find((item) => item.sku === sku);

const applyReceiptToProductInventory = (
  lines: OrderFulfillmentLineEvent[],
): InventoryMovementLike[] => {
  const movements: InventoryMovementLike[] = [];

  lines.forEach(({ sku, quantity, warehouseCode, locationCode }) => {
    if (quantity <= 0) {
      return;
    }

    const product = findProductRecord(sku);
    if (!product) {
      return;
    }

    const normalizedWarehouse = warehouseCode?.trim() ?? '';
    const normalizedLocation = locationCode?.trim() ?? '';
    const productInventory = product.inventory ? [...product.inventory] : [];

    if (normalizedWarehouse || normalizedLocation) {
      let entry = productInventory.find(
        (item) =>
          item.warehouseCode === normalizedWarehouse && item.locationCode === normalizedLocation,
      );
      if (!entry) {
        entry = {
          warehouseCode: normalizedWarehouse,
          locationCode: normalizedLocation,
          onHand: 0,
          reserved: 0,
        };
        productInventory.push(entry);
      }
      entry.onHand += quantity;
    }

    product.inventory = productInventory;
    const totalOnHand = productInventory.reduce((sum, item) => sum + item.onHand, 0);
    if (productInventory.length > 0) {
      product.onHand = totalOnHand;
    } else {
      product.onHand = (product.onHand ?? 0) + quantity;
    }
    product.totalInbound = (product.totalInbound ?? 0) + quantity;

    movements.push({
      change: quantity,
      occurredAt: new Date().toISOString(),
      reason: 'purchase-receipt',
      productId: Number.isFinite(product.legacyProductId) ? product.legacyProductId : undefined,
      product: {
        id: Number.isFinite(product.legacyProductId) ? product.legacyProductId : undefined,
        sku: product.sku,
        name: product.name,
      },
      toLocation: {
        code: normalizedLocation || undefined,
        warehouse: normalizedWarehouse
          ? {
              code: normalizedWarehouse,
            }
          : undefined,
      },
    });
  });

  return movements;
};

const applyShipmentToProductInventory = (
  lines: OrderFulfillmentLineEvent[],
): InventoryMovementLike[] => {
  const movements: InventoryMovementLike[] = [];

  lines.forEach(({ sku, quantity, warehouseCode, locationCode }) => {
    if (quantity <= 0) {
      return;
    }

    const product = findProductRecord(sku);
    if (!product) {
      return;
    }

    const normalizedWarehouse = warehouseCode?.trim() ?? '';
    const normalizedLocation = locationCode?.trim() ?? '';
    const productInventory = product.inventory ? [...product.inventory] : [];

    if (normalizedWarehouse || normalizedLocation) {
      let entry = productInventory.find(
        (item) =>
          item.warehouseCode === normalizedWarehouse && item.locationCode === normalizedLocation,
      );
      if (!entry) {
        entry = {
          warehouseCode: normalizedWarehouse,
          locationCode: normalizedLocation,
          onHand: 0,
          reserved: 0,
        };
        productInventory.push(entry);
      }
      entry.onHand = Math.max(0, entry.onHand - quantity);
    }

    product.inventory = productInventory;
    if (productInventory.length > 0) {
      const totalOnHand = productInventory.reduce((sum, item) => sum + item.onHand, 0);
      product.onHand = Math.max(0, totalOnHand);
    } else {
      const currentOnHand =
        typeof product.onHand === 'number' && Number.isFinite(product.onHand) ? product.onHand : 0;
      product.onHand = Math.max(0, currentOnHand - quantity);
    }

    product.totalOutbound = (product.totalOutbound ?? 0) + quantity;

    const productId = Number.isFinite(product.legacyProductId) ? product.legacyProductId : undefined;
    movements.push({
      change: -quantity,
      occurredAt: new Date().toISOString(),
      reason: 'sales-shipment',
      productId,
      product: {
        id: productId,
        sku: product.sku,
        name: product.name,
      },
      fromLocation:
        normalizedWarehouse || normalizedLocation
          ? {
              code: normalizedLocation || undefined,
              warehouse: normalizedWarehouse
                ? {
                    code: normalizedWarehouse,
                  }
                : undefined,
            }
          : undefined,
    });
  });

  return movements;
};

const partners: Partner[] = [
  {
    id: 'partner-s-1',
    type: 'SUPPLIER',
    name: '한빛식품',
    phone: '02-1234-5678',
    email: 'sales@hanbitfood.co.kr',
    address: '서울특별시 성동구 성수이로 77',
    isActive: true,
  },
  {
    id: 'partner-s-2',
    type: 'SUPPLIER',
    name: '코리아패키징',
    phone: '031-987-6543',
    email: 'order@korpack.kr',
    address: '경기도 안산시 단원구 고잔로 22',
    isActive: true,
  },
  {
    id: 'partner-c-1',
    type: 'CUSTOMER',
    name: '스타마켓 강남점',
    phone: '02-333-0001',
    email: 'stock@starmarket.kr',
    address: '서울특별시 강남구 테헤란로 320',
    isSample: true,
    isActive: true,
  },
  {
    id: 'partner-c-2',
    type: 'CUSTOMER',
    name: '프레시몰 온라인',
    phone: '02-444-0020',
    email: 'ops@freshmall.co.kr',
    address: '서울특별시 송파구 위례성대로 55',
    isSample: true,
    isActive: true,
  },
];

const purchaseOrders: PurchaseOrder[] = [
  {
    id: 'po-20250101-001',
    type: 'PURCHASE',
    partnerId: 'partner-s-1',
    status: 'OPEN',
    createdAt: '2025-01-04T02:00:00.000Z',
    scheduledAt: '2025-01-06T00:00:00.000Z',
    memo: '냉장창고 보충용',
    warehouseId: "wh-1",
    warehouseCode: 'WHS-SEOUL',
    detailedLocationId: "loc-101",
    detailedLocationCode: 'LOC-COLD-01',
    items: [
      {
        orderId: 'po-20250101-001',
        sku: 'ING-APPLE-10KG',
        qty: 120,
        unit: 'BOX',
        receivedQty: 60,
        warehouseCode: 'WHS-SEOUL',
        locationCode: 'LOC-COLD-01',
      },
      {
        orderId: 'po-20250101-001',
        sku: 'ING-BANANA-05KG',
        qty: 80,
        unit: 'BOX',
        receivedQty: 20,
        warehouseCode: 'WHS-SEOUL',
        locationCode: 'LOC-COLD-02',
      },
    ],
    events: [
      {
        id: 'po-20250101-001-status-open',
        orderId: 'po-20250101-001',
        kind: 'STATUS',
        from: 'DRAFT',
        to: 'OPEN',
        occurredAt: '2025-01-04T02:00:00.000Z',
      },
      {
        id: 'po-20250101-001-receive-1',
        orderId: 'po-20250101-001',
        kind: 'RECEIVE',
        occurredAt: '2025-01-06T01:30:00.000Z',
        lines: [
          {
            sku: 'ING-APPLE-10KG',
            quantity: 60,
            warehouseCode: 'WHS-SEOUL',
            locationCode: 'LOC-COLD-01',
          },
          {
            sku: 'ING-BANANA-05KG',
            quantity: 20,
            warehouseCode: 'WHS-SEOUL',
            locationCode: 'LOC-COLD-02',
          },
        ],
        note: '부분 입고 완료',
      },
    ],
  },
  {
    id: 'po-20250105-002',
    type: 'PURCHASE',
    partnerId: 'partner-s-2',
    status: 'DRAFT',
    createdAt: '2025-01-05T05:20:00.000Z',
    scheduledAt: '2025-01-08T00:00:00.000Z',
    memo: '패키지 자재 신규 발주',
    warehouseId: "wh-2",
    warehouseCode: 'WHS-ICN',
    detailedLocationId: "loc-202",
    detailedLocationCode: 'LOC-PACK-01',
    items: [
      {
        orderId: 'po-20250105-002',
        sku: 'PACK-BOX-20',
        qty: 200,
        unit: 'EA',
        receivedQty: 0,
        warehouseCode: 'WHS-ICN',
        locationCode: 'LOC-PACK-01',
      },
      {
        orderId: 'po-20250105-002',
        sku: 'PACK-TAPE-48',
        qty: 300,
        unit: 'EA',
        receivedQty: 0,
        warehouseCode: 'WHS-ICN',
        locationCode: 'LOC-PACK-01',
      },
    ],
    events: [
      {
        id: 'po-20250105-002-status-draft',
        orderId: 'po-20250105-002',
        kind: 'STATUS',
        from: 'DRAFT',
        to: 'DRAFT',
        occurredAt: '2025-01-05T05:20:00.000Z',
      },
    ],
  },
];

const salesOrders: SalesOrder[] = [
  {
    id: 'so-20250103-001',
    type: 'SALES',
    partnerId: 'partner-c-1',
    status: 'PARTIAL',
    createdAt: '2025-01-03T03:10:00.000Z',
    scheduledAt: '2025-01-05T00:00:00.000Z',
    memo: '매장 프로모션 물량',
    warehouseId: "wh-5",
    warehouseCode: 'WHS-GANGSEO',
    detailedLocationId: "loc-305",
    detailedLocationCode: 'LOC-OUT-01',
    items: [
      {
        orderId: 'so-20250103-001',
        sku: 'SKU-JUICE-ORANGE',
        qty: 150,
        unit: 'EA',
        shippedQty: 100,
        warehouseCode: 'WHS-GANGSEO',
        locationCode: 'LOC-OUT-01',
      },
      {
        orderId: 'so-20250103-001',
        sku: 'SKU-JUICE-APPLE',
        qty: 120,
        unit: 'EA',
        shippedQty: 90,
        warehouseCode: 'WHS-GANGSEO',
        locationCode: 'LOC-OUT-02',
      },
    ],
    events: [
      {
        id: 'so-20250103-001-status-open',
        orderId: 'so-20250103-001',
        kind: 'STATUS',
        from: 'DRAFT',
        to: 'OPEN',
        occurredAt: '2025-01-03T03:10:00.000Z',
      },
      {
        id: 'so-20250103-001-ship-1',
        orderId: 'so-20250103-001',
        kind: 'SHIP',
        occurredAt: '2025-01-04T02:00:00.000Z',
        note: '1차 출고',
        lines: [
          {
            sku: 'SKU-JUICE-ORANGE',
            quantity: 100,
            warehouseCode: 'WHS-GANGSEO',
            locationCode: 'LOC-OUT-01',
          },
          {
            sku: 'SKU-JUICE-APPLE',
            quantity: 90,
            warehouseCode: 'WHS-GANGSEO',
            locationCode: 'LOC-OUT-02',
          },
        ],
      },
    ],
  },
  {
    id: 'so-20250107-002',
    type: 'SALES',
    partnerId: 'partner-c-2',
    status: 'OPEN',
    createdAt: '2025-01-07T07:45:00.000Z',
    scheduledAt: '2025-01-10T00:00:00.000Z',
    memo: '온라인몰 신규 런칭',
    warehouseId: "wh-6",
    warehouseCode: 'WHS-ONLINE',
    detailedLocationId: "loc-402",
    detailedLocationCode: 'LOC-SHIP-01',
    items: [
      {
        orderId: 'so-20250107-002',
        sku: 'SKU-SNACK-SEAWEED',
        qty: 300,
        unit: 'BOX',
        shippedQty: 0,
        warehouseCode: 'WHS-ONLINE',
        locationCode: 'LOC-SHIP-01',
      },
      {
        orderId: 'so-20250107-002',
        sku: 'SKU-SNACK-ALMOND',
        qty: 240,
        unit: 'BOX',
        shippedQty: 0,
        warehouseCode: 'WHS-ONLINE',
        locationCode: 'LOC-SHIP-01',
      },
    ],
    events: [
      {
        id: 'so-20250107-002-status-open',
        orderId: 'so-20250107-002',
        kind: 'STATUS',
        from: 'DRAFT',
        to: 'OPEN',
        occurredAt: '2025-01-07T07:45:00.000Z',
      },
    ],
  },
];

const findPartner = (partnerId: string) => partners.find((partner) => partner.id === partnerId);

export async function listPartners(options: ListPartnersOptions = {}) {
  const { type, includeSample = false } = options;

  const filtered = partners.filter((partner) => {
    if (!includeSample && partner.isSample) {
      return false;
    }
    if (type && partner.type !== type) {
      return false;
    }
    return true;
  });

  return clone(filtered);
}

export async function createPartner(input: CreatePartnerInput) {
  const type = input.type;
  if (type !== 'SUPPLIER' && type !== 'CUSTOMER') {
    throw new Error('거래처 유형을 선택하세요.');
  }

  const name = input.name?.trim();
  if (!name) {
    throw new Error('거래처명을 입력하세요.');
  }

  const idPrefix = type === 'SUPPLIER' ? 'partner-s' : 'partner-c';
  const partner: Partner = {
    id: generateId(idPrefix),
    type,
    name,
    phone: input.phone?.trim() || undefined,
    email: input.email?.trim() || undefined,
    address: input.address?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    isSample: false,
    isActive: true,
  };

  partners.push(partner);
  return clone(partner);
}

export async function updatePartner(input: UpdatePartnerInput) {
  const target = findPartner(input.id);
  if (!target) {
    throw new Error('해당 거래처를 찾을 수 없습니다.');
  }

  const nextType = input.type ?? target.type;
  if (nextType !== 'SUPPLIER' && nextType !== 'CUSTOMER') {
    throw new Error('거래처 유형을 선택하세요.');
  }

  const nextName = input.name?.trim() ?? target.name;
  if (!nextName) {
    throw new Error('거래처명을 입력하세요.');
  }

  const normalizeOptional = (value: string | null | undefined, current: string | undefined) => {
    if (value === undefined) {
      return current;
    }
    const trimmed = (value ?? '').trim();
    return trimmed ? trimmed : undefined;
  };

  target.type = nextType;
  target.name = nextName;
  target.phone = normalizeOptional(input.phone, target.phone);
  target.email = normalizeOptional(input.email, target.email);
  target.address = normalizeOptional(input.address, target.address);
  target.notes = normalizeOptional(input.notes, target.notes);
  if (typeof input.isActive === 'boolean') {
    target.isActive = input.isActive;
  }

  return clone(target);
}

export async function deletePartner(partnerId: string) {
  const index = partners.findIndex((partner) => partner.id === partnerId);
  if (index === -1) {
    throw new Error('해당 거래처를 찾을 수 없습니다.');
  }

  const [removed] = partners.splice(index, 1);
  return clone(removed);
}

const computePurchaseSummary = (order: PurchaseOrder): PurchaseOrderSummary => {
  const partner = findPartner(order.partnerId);
  const totalQty = order.items.reduce((sum, item) => sum + item.qty, 0);
  const receivedQty = order.items.reduce((sum, item) => sum + item.receivedQty, 0);
  return {
    id: order.id,
    partnerId: order.partnerId,
    partnerName: partner?.name ?? '—',
    status: order.status,
    createdAt: order.createdAt,
    scheduledAt: order.scheduledAt,
    totalQty,
    receivedQty,
    warehouseId: order.warehouseId,
    warehouseCode: order.warehouseCode,
    detailedLocationId: order.detailedLocationId,
    detailedLocationCode: order.detailedLocationCode,
  };
};

const computeSalesSummary = (order: SalesOrder): SalesOrderSummary => {
  const partner = findPartner(order.partnerId);
  const totalQty = order.items.reduce((sum, item) => sum + item.qty, 0);
  const shippedQty = order.items.reduce((sum, item) => sum + item.shippedQty, 0);
  return {
    id: order.id,
    partnerId: order.partnerId,
    partnerName: partner?.name ?? '—',
    status: order.status,
    createdAt: order.createdAt,
    scheduledAt: order.scheduledAt,
    totalQty,
    shippedQty,
    warehouseId: order.warehouseId,
    warehouseCode: order.warehouseCode,
    detailedLocationId: order.detailedLocationId,
    detailedLocationCode: order.detailedLocationCode,
  };
};

const resolvePurchaseStatus = (order: PurchaseOrder) => {
  const total = order.items.reduce((sum, item) => sum + item.qty, 0);
  const received = order.items.reduce((sum, item) => sum + item.receivedQty, 0);
  if (received === 0) {
    return order.status === 'CANCELLED' ? 'CANCELLED' : 'OPEN';
  }
  if (received >= total) {
    return 'RECEIVED';
  }
  return 'PARTIAL';
};

const resolveSalesStatus = (order: SalesOrder) => {
  const total = order.items.reduce((sum, item) => sum + item.qty, 0);
  const shipped = order.items.reduce((sum, item) => sum + item.shippedQty, 0);
  if (shipped === 0) {
    return order.status === 'CANCELLED' ? 'CANCELLED' : 'OPEN';
  }
  if (shipped >= total) {
    return 'RECEIVED';
  }
  return 'PARTIAL';
};

export async function listPurchaseOrders(): Promise<PurchaseOrderSummary[]> {
  return purchaseOrders.map((order) => computePurchaseSummary(order));
}

export async function listSalesOrders(): Promise<SalesOrderSummary[]> {
  return salesOrders.map((order) => computeSalesSummary(order));
}

export async function getPurchaseOrder(orderId: string): Promise<PurchaseOrder | undefined> {
  const order = purchaseOrders.find((entry) => entry.id === orderId);
  return order ? clone(order) : undefined;
}

export async function getSalesOrder(orderId: string): Promise<SalesOrder | undefined> {
  const order = salesOrders.find((entry) => entry.id === orderId);
  return order ? clone(order) : undefined;
}

const pushStatusEvent = (
  order: PurchaseOrder | SalesOrder,
  to: OrderStatus,
  note?: string,
) => {
  const lastStatus = order.status;
  if (lastStatus === to) {
    return;
  }
  const event: OrderStatusChangeEvent = {
    id: `${order.id}-status-${Date.now()}`,
    orderId: order.id,
    kind: 'STATUS',
    from: lastStatus,
    to,
    occurredAt: new Date().toISOString(),
    note,
  };
  order.events.push(event);
  order.status = to;
};

export async function updatePurchaseOrderStatus(orderId: string, status: OrderStatus, note?: string) {
  const order = purchaseOrders.find((entry) => entry.id === orderId);
  if (!order) {
    throw new Error(`Purchase order ${orderId} not found`);
  }
  pushStatusEvent(order, status, note);
  return clone(order);
}

export async function updateSalesOrderStatus(orderId: string, status: OrderStatus, note?: string) {
  const order = salesOrders.find((entry) => entry.id === orderId);
  if (!order) {
    throw new Error(`Sales order ${orderId} not found`);
  }
  pushStatusEvent(order, status, note);
  return clone(order);
}

const sanitizeLines = (lines: FulfillmentInput['lines']) =>
  lines.filter((line) => line.quantity > 0);

export async function recordPurchaseReceipt(orderId: string, input: FulfillmentInput) {
  const order = purchaseOrders.find((entry) => entry.id === orderId);
  if (!order) {
    throw new Error(`Purchase order ${orderId} not found`);
  }

  const updates = sanitizeLines(input.lines);
  if (!updates.length) {
    return clone(order);
  }

  const appliedLines: OrderFulfillmentLineEvent[] = [];

  updates.forEach(({ sku, quantity, warehouseCode, locationCode }) => {
    const item = order.items.find((entry) => entry.sku === sku);
    if (!item) {
      return;
    }
    const previous = item.receivedQty;
    const next = Math.min(item.qty, previous + quantity);
    const appliedQuantity = Math.max(0, next - previous);
    if (appliedQuantity <= 0) {
      return;
    }

    item.receivedQty = next;

    appliedLines.push({
      sku: item.sku,
      quantity: appliedQuantity,
      warehouseCode: warehouseCode?.trim() || item.warehouseCode || order.warehouseCode || '',
      locationCode:
        locationCode?.trim() || item.locationCode || order.detailedLocationCode || '',
    });
  });

  if (appliedLines.length === 0) {
    return clone(order);
  }

  const event: OrderFulfillmentEvent = {
    id: `${orderId}-receive-${Date.now()}`,
    orderId,
    kind: 'RECEIVE',
    occurredAt: new Date().toISOString(),
    note: input.note,
    lines: appliedLines,
  };

  order.events.push(event);
  const nextStatus = resolvePurchaseStatus(order);
  pushStatusEvent(order, nextStatus);

  const movements = applyReceiptToProductInventory(appliedLines);
  if (movements.length > 0) {
    emitInventoryRefreshEvent({ source: 'purchases', movements });
  }

  return clone(order);
}

export async function recordSalesShipment(orderId: string, input: FulfillmentInput) {
  const order = salesOrders.find((entry) => entry.id === orderId);
  if (!order) {
    throw new Error(`Sales order ${orderId} not found`);
  }

  const updates = sanitizeLines(input.lines);
  if (!updates.length) {
    return clone(order);
  }

  const appliedLines: OrderFulfillmentLineEvent[] = [];

  updates.forEach(({ sku, quantity, warehouseCode, locationCode }) => {
    const item = order.items.find((entry) => entry.sku === sku);
    if (!item) {
      return;
    }
    const previous = item.shippedQty;
    const next = Math.min(item.qty, previous + quantity);
    const appliedQuantity = Math.max(0, next - previous);
    if (appliedQuantity <= 0) {
      return;
    }

    item.shippedQty = next;

    appliedLines.push({
      sku: item.sku,
      quantity: appliedQuantity,
      warehouseCode: warehouseCode?.trim() || item.warehouseCode || order.warehouseCode || '',
      locationCode:
        locationCode?.trim() || item.locationCode || order.detailedLocationCode || '',
    });
  });

  if (appliedLines.length === 0) {
    return clone(order);
  }

  const event: OrderFulfillmentEvent = {
    id: `${orderId}-ship-${Date.now()}`,
    orderId,
    kind: 'SHIP',
    occurredAt: new Date().toISOString(),
    note: input.note,
    lines: appliedLines,
  };

  order.events.push(event);
  const nextStatus = resolveSalesStatus(order);
  pushStatusEvent(order, nextStatus);

  const movements = applyShipmentToProductInventory(appliedLines);
  if (movements.length > 0) {
    emitInventoryRefreshEvent({ source: 'sales', movements });
  }

  return clone(order);
}

export async function createPurchaseOrder(input: CreatePurchaseOrderInput) {
  const partner = findPartner(input.partnerId);
  if (!partner || partner.type !== 'SUPPLIER' || partner.isActive === false) {
    throw new Error('유효한 공급업체를 선택하세요.');
  }
  const orderId = generateId('po');
  const now = new Date().toISOString();
  const status = input.status ?? 'DRAFT';
  const order: PurchaseOrder = {
    id: orderId,
    type: 'PURCHASE',
    partnerId: input.partnerId,
    status,
    createdAt: now,
    scheduledAt: input.scheduledAt,
    memo: input.memo,
    warehouseId: input.warehouseId,
    warehouseCode: input.warehouseCode,
    detailedLocationId: input.detailedLocationId,
    detailedLocationCode: input.detailedLocationCode,
    items: input.items.map((item) => ({
      orderId,
      sku: item.sku,
      qty: item.qty,
      unit: item.unit,
      receivedQty: status === 'RECEIVED' ? item.qty : 0,
      warehouseCode: input.warehouseCode,
      locationCode: input.detailedLocationCode,
    })),
    events: [
      {
        id: `${orderId}-status-${status.toLowerCase()}`,
        orderId,
        kind: 'STATUS',
        from: 'DRAFT',
        to: status,
        occurredAt: now,
      },
    ],
  };

  purchaseOrders.unshift(order);

  if (status === 'RECEIVED') {
    const initialReceiptLines = order.items
      .filter((item) => item.receivedQty > 0)
      .map<OrderFulfillmentLineEvent>((item) => ({
        sku: item.sku,
        quantity: item.receivedQty,
        warehouseCode: item.warehouseCode || input.warehouseCode || '',
        locationCode: item.locationCode || input.detailedLocationCode || '',
      }));

    if (initialReceiptLines.length > 0) {
      order.events.push({
        id: `${orderId}-receive-initial`,
        orderId,
        kind: 'RECEIVE',
        occurredAt: now,
        lines: initialReceiptLines,
      });

      const movements = applyReceiptToProductInventory(initialReceiptLines);
      if (movements.length > 0) {
        emitInventoryRefreshEvent({ source: 'purchases', movements });
      }
    }
  }

  return clone(order);
}

export async function createSalesOrder(input: CreateSalesOrderInput) {
  const partner = findPartner(input.partnerId);
  if (!partner || partner.isActive === false) {
    throw new Error('유효한 거래처를 선택해주세요.');
  }
  const orderId = generateId('so');
  const now = new Date().toISOString();
  const status = input.status ?? 'DRAFT';
  const order: SalesOrder = {
    id: orderId,
    type: 'SALES',
    partnerId: input.partnerId,
    status,
    createdAt: now,
    scheduledAt: input.scheduledAt,
    memo: input.memo,
    warehouseId: input.warehouseId,
    warehouseCode: input.warehouseCode,
    detailedLocationId: input.detailedLocationId,
    detailedLocationCode: input.detailedLocationCode,
    items: input.items.map((item) => ({
      orderId,
      sku: item.sku,
      qty: item.qty,
      unit: item.unit,
      shippedQty: 0,
      warehouseCode: input.warehouseCode,
      locationCode: input.detailedLocationCode,
    })),
    events: [
      {
        id: `${orderId}-status-${status.toLowerCase()}`,
        orderId,
        kind: 'STATUS',
        from: 'DRAFT',
        to: status,
        occurredAt: now,
      },
    ],
  };

  salesOrders.unshift(order);
  return clone(order);
}
