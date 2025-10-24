// 생산/재고 도메인 타입 전체 예시 (merge-resolved)

export type ProductionStage = 'raw' | 'wip' | 'finished';

export type StockChangeReason =
  | '최초 재고'
  | '수동 업데이트'
  | '판매'
  | '입고'
  | '제품 정보 편집에 따른 재고 조정';

export type ProductClassification = 'RAW_MATERIAL' | 'WIP' | 'FINISHED_GOOD';

// <<<<<<< RESOLVED: keep addition from codex branch
export type SupplyRiskIndicator = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
// >>>>>>> RESOLVED

export type ManufacturingEventType =
  | 'INVENTORY_CHANGE'
  | 'INBOUND_DELAY'
  | 'SAFETY_STOCK_BREACH';

export type ManufacturingEventSeverity = 'INFO' | 'WARNING' | 'CRITICAL';

export interface ManufacturingEvent {
  id: string;
  type: ManufacturingEventType;
  severity: ManufacturingEventSeverity;
  occurredAt: string; // ISO string
  source: string;
  message: string;
  product: {
    id: string;
    name: string;
    sku: string;
  };
  metrics?: {
    currentStock?: number;
    changeAmount?: number;
    safetyStock?: number;
    reorderPoint?: number;
    leadTimeDays?: number;
    daysSinceLastInbound?: number;
  };
  context?: Record<string, unknown>;
}

export interface BillOfMaterialReference {
  componentId: string;
  quantity: number;
}

export interface WarehouseLocationDetail {
  site?: string;
  warehouse?: string;
  zone?: string;
  aisle?: string;
  rack?: string;
  shelf?: string;
  bin?: string;
}

export interface Product {
  id: string;
  ownerId: string;
  serverId?: number;
  productName: string;
  isDeleted: boolean;
  classification: ProductClassification;
  sku: string;
  unitOfMeasure: string;
  warehouseLocation: string;
  storageHierarchy?: WarehouseLocationDetail;
  supplier: string;
  supplierCode?: string;
  costPerUnit: number;
  leadTimeDays: number;
  contractLeadTimeDays?: number;
  minimumOrderQuantity?: number;
  isMultiSourced?: boolean;
  riskIndicator?: SupplyRiskIndicator; // uses the resolved type
  reorderPoint: number;
  currentStock: number;
  safetyStock: number;
  notes?: string;
  billOfMaterials?: BillOfMaterialReference[];
  createdAt: Date;
  stage?: ProductionStage;
  averageDailyDemand?: number;
  targetLeadTimeDays?: number;
  openWorkOrders?: number;
  supplierRiskScore?: number;
  supplierName?: string;
  inboundUnits?: number;
  supplierDeliverySlaDays?: number;
  supplierSlaBreachRate?: number;
  supplierPriceVolatility?: number;
  hasAlternateSupplier?: boolean;
  procurementOwner?: string;
  procurementDueDate?: Date;
  recommendedOrderQty?: number;
  projectedStockoutDate?: Date | null;
}

export type ProductDraft = Omit<Product, 'id' | 'ownerId' | 'createdAt' | 'isDeleted'>;

export interface StockHistory {
  id: string;
  productId: string;
  userId: string;
  change: number;
  newStockLevel: number;
  reason: StockChangeReason;
  lotBatch?: string;
  workOrder?: string;
  inspectionResult?: string;
  timestamp: Date;
}

export enum ModalType {
  NONE,
  ADD_PRODUCT,
  EDIT_PRODUCT,
  VIEW_HISTORY,
}

export const deriveStageFromProduct = (product: Product): ProductionStage => {
  if (product.stage) {
    return product.stage;
  }
  const normalizedNotes = product.notes?.toLowerCase() ?? '';

  if (/원자재|자재|raw/.test(normalizedNotes)) return 'raw';
  if (/wip|공정|반제품|semi/.test(normalizedNotes)) return 'wip';
  if (/완제품|finished|출고/.test(normalizedNotes)) return 'finished';

  if (product.safetyStock === 0) return 'raw';

  const coverage = product.safetyStock > 0
    ? product.currentStock / product.safetyStock
    : 1;

  if (coverage < 0.6) return 'raw';
  if (coverage < 1.2) return 'wip';
  return 'finished';
};
