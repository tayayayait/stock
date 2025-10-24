export const INVENTORY_REFRESH_EVENT = 'stockwise:inventory-refresh';

export interface InventoryMovementLike {
  id?: number | string;
  productId?: number;
  change?: number;
  occurredAt?: string;
  createdAt?: string;
  reason?: string | null;
  fromLocationId?: number | null;
  toLocationId?: number | null;
  product?: {
    id?: number;
    sku?: string | null;
    name?: string | null;
  } | null;
  fromLocation?: {
    id?: number;
    code?: string | null;
    name?: string | null;
    warehouse?: {
      id?: number;
      code?: string | null;
      name?: string | null;
    } | null;
  } | null;
  toLocation?: {
    id?: number;
    code?: string | null;
    name?: string | null;
    warehouse?: {
      id?: number;
      code?: string | null;
      name?: string | null;
    } | null;
  } | null;
}

export interface InventoryRefreshEventDetail {
  source?: 'sales' | 'returns' | 'transfers' | string;
  movements?: InventoryMovementLike[];
}

export type InventoryRefreshEvent = CustomEvent<InventoryRefreshEventDetail>;

export const emitInventoryRefreshEvent = (detail?: InventoryRefreshEventDetail) => {
  if (typeof window === 'undefined') {
    return;
  }

  const event = new CustomEvent<InventoryRefreshEventDetail>(INVENTORY_REFRESH_EVENT, {
    detail,
  });

  window.dispatchEvent(event);
};

export const subscribeInventoryRefresh = (
  listener: (event: InventoryRefreshEvent) => void,
): (() => void) => {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handler = (event: Event) => {
    listener(event as InventoryRefreshEvent);
  };

  window.addEventListener(INVENTORY_REFRESH_EVENT, handler);
  return () => window.removeEventListener(INVENTORY_REFRESH_EVENT, handler);
};
