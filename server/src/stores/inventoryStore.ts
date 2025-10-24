export interface InventoryInput {
  sku: string;
  warehouseCode: string;
  locationCode: string;
  onHand: number;
  reserved: number;
}

export interface InventoryRecord extends InventoryInput {}

const inventoryStore = new Map<string, InventoryRecord>();

const keyFor = (sku: string, warehouseCode: string, locationCode: string): string =>
  `${sku}::${warehouseCode}::${locationCode}`;

export function listInventoryForSku(sku: string): InventoryRecord[] {
  return Array.from(inventoryStore.values()).filter((item) => item.sku === sku);
}

export function replaceInventoryForSku(sku: string, records: InventoryInput[]): void {
  const existingKeys = new Set(
    Array.from(inventoryStore.keys()).filter((key) => key.startsWith(`${sku}::`)),
  );

  records.forEach((record) => {
    const key = keyFor(record.sku, record.warehouseCode, record.locationCode);
    inventoryStore.set(key, { ...record });
    existingKeys.delete(key);
  });

  existingKeys.forEach((key) => {
    inventoryStore.delete(key);
  });
}

export function deleteInventoryForSku(sku: string): void {
  Array.from(inventoryStore.keys())
    .filter((key) => key.startsWith(`${sku}::`))
    .forEach((key) => inventoryStore.delete(key));
}

export function deleteInventoryByWarehouse(warehouseCode: string): void {
  Array.from(inventoryStore.keys())
    .filter((key) => key.includes(`::${warehouseCode}::`))
    .forEach((key) => inventoryStore.delete(key));
}

export function deleteInventoryByLocation(locationCode: string): void {
  Array.from(inventoryStore.keys())
    .filter((key) => key.endsWith(`::${locationCode}`))
    .forEach((key) => inventoryStore.delete(key));
}

export function updateInventoryWarehouseForLocation(
  locationCode: string,
  newWarehouseCode: string,
): void {
  const updates: InventoryRecord[] = [];
  Array.from(inventoryStore.values())
    .filter((record) => record.locationCode === locationCode)
    .forEach((record) => {
      updates.push({
        ...record,
        warehouseCode: newWarehouseCode,
      });
      inventoryStore.delete(keyFor(record.sku, record.warehouseCode, record.locationCode));
    });

  updates.forEach((record) => {
    const key = keyFor(record.sku, record.warehouseCode, record.locationCode);
    inventoryStore.set(key, record);
  });
}

export function renameInventoryLocation(
  oldLocationCode: string,
  newLocationCode: string,
  newWarehouseCode: string,
): void {
  if (oldLocationCode === newLocationCode) {
    updateInventoryWarehouseForLocation(oldLocationCode, newWarehouseCode);
    return;
  }

  const updates: InventoryRecord[] = [];
  Array.from(inventoryStore.values())
    .filter((record) => record.locationCode === oldLocationCode)
    .forEach((record) => {
      updates.push({
        ...record,
        warehouseCode: newWarehouseCode,
        locationCode: newLocationCode,
      });
      inventoryStore.delete(keyFor(record.sku, record.warehouseCode, record.locationCode));
    });

  updates.forEach((record) => {
    const key = keyFor(record.sku, record.warehouseCode, record.locationCode);
    inventoryStore.set(key, record);
  });
}

export function summarizeInventory(
  sku: string,
): { totalOnHand: number; totalReserved: number; items: InventoryRecord[] } {
  const items = listInventoryForSku(sku);
  const totalOnHand = items.reduce((sum, item) => sum + item.onHand, 0);
  const totalReserved = items.reduce((sum, item) => sum + item.reserved, 0);
  return { totalOnHand, totalReserved, items };
}

export function seedInventory(records: InventoryInput[]): void {
  records.forEach((record) => {
    const key = keyFor(record.sku, record.warehouseCode, record.locationCode);
    inventoryStore.set(key, { ...record });
  });
}

export function __resetInventoryStore(): void {
  inventoryStore.clear();
}
