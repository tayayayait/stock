export interface OrdersWarehouse {
  id: string;
  code: string;
  name?: string | null;
  address?: string | null;
  notes?: string | null;
  isActive?: boolean | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface OrdersLocation {
  id: string;
  code: string;
  name?: string | null;
  description?: string | null;
  type?: string | null;
  warehouseCode: string;
  warehouseId?: string | null;
  warehouseName?: string | null;
  isActive?: boolean | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface WarehouseLocationSelection {
  warehouseId: string;
  warehouseCode: string;
  locationId: string;
  locationCode: string;
}
