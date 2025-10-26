export interface InventoryInput {
  sku: string;
  warehouseCode: string;
  locationCode: string;
  onHand: number;
  reserved: number;
}

export interface InventoryRecord extends InventoryInput {}

export interface InventoryTotals {
  onHand: number;
  reserved: number;
}

const inventoryStore = new Map<string, InventoryRecord>();
const skuIndex = new Map<string, Set<string>>();
const warehouseIndex = new Map<string, Set<string>>();
const locationIndex = new Map<string, Set<string>>();

const totalsBySku = new Map<string, InventoryTotals>();
const totalsByWarehouse = new Map<string, InventoryTotals>();
const totalsByLocation = new Map<string, InventoryTotals>();
let overallTotals: InventoryTotals = { onHand: 0, reserved: 0 };

const keyFor = (sku: string, warehouseCode: string, locationCode: string): string =>
  `${sku}::${warehouseCode}::${locationCode}`;

const cloneRecord = (record: InventoryRecord): InventoryRecord => ({ ...record });

const ensureIndexSet = (index: Map<string, Set<string>>, targetKey: string): Set<string> => {
  const existing = index.get(targetKey);
  if (existing) {
    return existing;
  }

  const created = new Set<string>();
  index.set(targetKey, created);
  return created;
};

const addIndexEntry = (index: Map<string, Set<string>>, targetKey: string, recordKey: string) => {
  ensureIndexSet(index, targetKey).add(recordKey);
};

const removeIndexEntry = (index: Map<string, Set<string>>, targetKey: string, recordKey: string) => {
  const bucket = index.get(targetKey);
  if (!bucket) {
    return;
  }

  bucket.delete(recordKey);
  if (bucket.size === 0) {
    index.delete(targetKey);
  }
};

const applyTotalsDelta = (
  target: Map<string, InventoryTotals>,
  targetKey: string,
  deltaOnHand: number,
  deltaReserved: number,
) => {
  const current = target.get(targetKey) ?? { onHand: 0, reserved: 0 };
  const nextOnHand = current.onHand + deltaOnHand;
  const nextReserved = current.reserved + deltaReserved;

  if (nextOnHand === 0 && nextReserved === 0) {
    target.delete(targetKey);
    return;
  }

  target.set(targetKey, { onHand: nextOnHand, reserved: nextReserved });
};

const applyOverallDelta = (deltaOnHand: number, deltaReserved: number) => {
  overallTotals = {
    onHand: overallTotals.onHand + deltaOnHand,
    reserved: overallTotals.reserved + deltaReserved,
  };
};

const setRecord = (record: InventoryRecord): string => {
  const recordKey = keyFor(record.sku, record.warehouseCode, record.locationCode);
  const previous = inventoryStore.get(recordKey);

  inventoryStore.set(recordKey, cloneRecord(record));
  addIndexEntry(skuIndex, record.sku, recordKey);
  addIndexEntry(warehouseIndex, record.warehouseCode, recordKey);
  addIndexEntry(locationIndex, record.locationCode, recordKey);

  const deltaOnHand = record.onHand - (previous?.onHand ?? 0);
  const deltaReserved = record.reserved - (previous?.reserved ?? 0);
  if (deltaOnHand !== 0 || deltaReserved !== 0) {
    applyTotalsDelta(totalsBySku, record.sku, deltaOnHand, deltaReserved);
    applyTotalsDelta(totalsByWarehouse, record.warehouseCode, deltaOnHand, deltaReserved);
    applyTotalsDelta(totalsByLocation, record.locationCode, deltaOnHand, deltaReserved);
    applyOverallDelta(deltaOnHand, deltaReserved);
  }

  return recordKey;
};

const removeRecordByKey = (recordKey: string): void => {
  const existing = inventoryStore.get(recordKey);
  if (!existing) {
    return;
  }

  inventoryStore.delete(recordKey);
  removeIndexEntry(skuIndex, existing.sku, recordKey);
  removeIndexEntry(warehouseIndex, existing.warehouseCode, recordKey);
  removeIndexEntry(locationIndex, existing.locationCode, recordKey);
  applyTotalsDelta(totalsBySku, existing.sku, -existing.onHand, -existing.reserved);
  applyTotalsDelta(totalsByWarehouse, existing.warehouseCode, -existing.onHand, -existing.reserved);
  applyTotalsDelta(totalsByLocation, existing.locationCode, -existing.onHand, -existing.reserved);
  applyOverallDelta(-existing.onHand, -existing.reserved);
};

export function listInventoryForSku(sku: string): InventoryRecord[] {
  const keys = skuIndex.get(sku);
  if (!keys || keys.size === 0) {
    return [];
  }

  return Array.from(keys)
    .map((recordKey) => inventoryStore.get(recordKey))
    .filter((record): record is InventoryRecord => Boolean(record))
    .map(cloneRecord);
}

export function replaceInventoryForSku(sku: string, records: InventoryInput[]): void {
  const existingKeys = new Set(skuIndex.get(sku) ?? []);
  const nextKeys = new Set<string>();

  records.forEach((input) => {
    const normalized: InventoryRecord = { ...input };
    const recordKey = setRecord(normalized);
    nextKeys.add(recordKey);
    existingKeys.delete(recordKey);
  });

  existingKeys.forEach((recordKey) => {
    if (!nextKeys.has(recordKey)) {
      removeRecordByKey(recordKey);
    }
  });
}

export function deleteInventoryForSku(sku: string): void {
  const keys = skuIndex.get(sku);
  if (!keys) {
    return;
  }

  Array.from(keys).forEach((recordKey) => {
    removeRecordByKey(recordKey);
  });
}

export function deleteInventoryByWarehouse(warehouseCode: string): void {
  const keys = warehouseIndex.get(warehouseCode);
  if (!keys) {
    return;
  }

  Array.from(keys).forEach((recordKey) => {
    removeRecordByKey(recordKey);
  });
}

export function deleteInventoryByLocation(locationCode: string): void {
  const keys = locationIndex.get(locationCode);
  if (!keys) {
    return;
  }

  Array.from(keys).forEach((recordKey) => {
    removeRecordByKey(recordKey);
  });
}

export function updateInventoryWarehouseForLocation(
  locationCode: string,
  newWarehouseCode: string,
): void {
  const keys = new Set(locationIndex.get(locationCode) ?? []);
  keys.forEach((recordKey) => {
    const existing = inventoryStore.get(recordKey);
    if (!existing) {
      return;
    }

    removeRecordByKey(recordKey);
    setRecord({
      ...existing,
      warehouseCode: newWarehouseCode,
    });
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

  const keys = new Set(locationIndex.get(oldLocationCode) ?? []);
  keys.forEach((recordKey) => {
    const existing = inventoryStore.get(recordKey);
    if (!existing) {
      return;
    }

    removeRecordByKey(recordKey);
    setRecord({
      ...existing,
      warehouseCode: newWarehouseCode,
      locationCode: newLocationCode,
    });
  });
}

export function summarizeInventory(
  sku: string,
): { totalOnHand: number; totalReserved: number; items: InventoryRecord[] } {
  const items = listInventoryForSku(sku);
  const totals = totalsBySku.get(sku) ?? { onHand: 0, reserved: 0 };
  return { totalOnHand: totals.onHand, totalReserved: totals.reserved, items };
}

export function seedInventory(records: InventoryInput[]): void {
  records.forEach((record) => {
    setRecord({ ...record });
  });
}

export function getInventoryTotals(): InventoryTotals {
  return { ...overallTotals };
}

export function getWarehouseTotals(): Array<InventoryTotals & { warehouseCode: string }> {
  return Array.from(totalsByWarehouse.entries()).map(([warehouseCode, totals]) => ({
    warehouseCode,
    onHand: totals.onHand,
    reserved: totals.reserved,
  }));
}

export function getLocationTotals(): Array<InventoryTotals & { locationCode: string }> {
  return Array.from(totalsByLocation.entries()).map(([locationCode, totals]) => ({
    locationCode,
    onHand: totals.onHand,
    reserved: totals.reserved,
  }));
}

export function __resetInventoryStore(): void {
  inventoryStore.clear();
  skuIndex.clear();
  warehouseIndex.clear();
  locationIndex.clear();
  totalsBySku.clear();
  totalsByWarehouse.clear();
  totalsByLocation.clear();
  overallTotals = { onHand: 0, reserved: 0 };
}
