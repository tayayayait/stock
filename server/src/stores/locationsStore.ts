import { randomUUID } from 'node:crypto';

import { ensureWarehouseSeedData, findWarehouseByCode } from './warehousesStore.js';
import { deleteInventoryByLocation, renameInventoryLocation } from './inventoryStore.js';

export interface LocationPayload {
  code: string;
  warehouseCode: string;
  description: string;
}

export interface LocationRecord extends LocationPayload {
  id: string;
  createdAt: string;
  updatedAt: string;
}

const locationStore = new Map<string, LocationRecord>();
let autoSeed = true;

const defaultLocations: LocationPayload[] = [
  {
    code: 'SEOUL-A1',
    warehouseCode: 'WH-SEOUL',
    description: '상온 A1 랙 존',
  },
  {
    code: 'SEOUL-C1',
    warehouseCode: 'WH-SEOUL',
    description: '냉장 C1 존',
  },
  {
    code: 'BUSAN-A1',
    warehouseCode: 'WH-BUSAN',
    description: '상온 A1 존',
  },
  {
    code: 'DAEJEON-B2',
    warehouseCode: 'WH-DAEJEON',
    description: '저온 B2 존',
  },
];

function toRecord(payload: LocationPayload): LocationRecord {
  const now = new Date().toISOString();
  return {
    ...payload,
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
}

export function ensureLocationSeedData(): void {
  ensureWarehouseSeedData();

  if (!autoSeed) {
    return;
  }

  autoSeed = false;

  if (locationStore.size > 0) {
    return;
  }

  defaultLocations.forEach((payload) => {
    if (findWarehouseByCode(payload.warehouseCode) && !locationStore.has(payload.code)) {
      locationStore.set(payload.code, toRecord(payload));
    }
  });
}


export function listLocations(): LocationRecord[] {
  ensureLocationSeedData();
  return Array.from(locationStore.values()).sort((a, b) => a.code.localeCompare(b.code));
}

export function findLocationByCode(code: string): LocationRecord | undefined {
  ensureLocationSeedData();
  return locationStore.get(code);
}

export function createLocation(payload: LocationPayload): LocationRecord {
  ensureLocationSeedData();
  if (!findWarehouseByCode(payload.warehouseCode)) {
    throw new Error('연결된 물류센터를 찾을 수 없습니다.');
  }

  if (locationStore.has(payload.code)) {
    throw new Error('이미 존재하는 로케이션 코드입니다.');
  }

  const record = toRecord(payload);
  locationStore.set(record.code, record);
  return record;
}

export function updateLocation(
  code: string,
  changes: Pick<LocationPayload, 'warehouseCode' | 'description'>,
): LocationRecord {
  ensureLocationSeedData();
  const existing = locationStore.get(code);
  if (!existing) {
    throw new Error('요청한 로케이션을 찾을 수 없습니다.');
  }

  if (changes.warehouseCode !== existing.warehouseCode) {
    if (!findWarehouseByCode(changes.warehouseCode)) {
      throw new Error('연결된 물류센터를 찾을 수 없습니다.');
    }
  }

  const updated: LocationRecord = {
    ...existing,
    ...changes,
    updatedAt: new Date().toISOString(),
  };
  locationStore.set(code, updated);
  return updated;
}

export function renameLocation(oldCode: string, payload: LocationPayload): LocationRecord {
  ensureLocationSeedData();
  const existing = locationStore.get(oldCode);
  if (!existing) {
    throw new Error('요청한 로케이션을 찾을 수 없습니다.');
  }

  if (!findWarehouseByCode(payload.warehouseCode)) {
    throw new Error('연결된 물류센터를 찾을 수 없습니다.');
  }

  if (payload.code !== oldCode && locationStore.has(payload.code)) {
    throw new Error('이미 존재하는 로케이션 코드입니다.');
  }

  const updated: LocationRecord = {
    ...existing,
    ...payload,
    updatedAt: new Date().toISOString(),
  };

  if (payload.code !== oldCode) {
    locationStore.delete(oldCode);
  }
  locationStore.set(payload.code, updated);

  if (payload.code !== oldCode || existing.warehouseCode !== payload.warehouseCode) {
    renameInventoryLocation(oldCode, payload.code, payload.warehouseCode);
  }

  return updated;
}

export function deleteLocation(code: string): LocationRecord | undefined {
  ensureLocationSeedData();
  const existing = locationStore.get(code);
  if (!existing) {
    return undefined;
  }

  locationStore.delete(code);
  deleteInventoryByLocation(code);
  return existing;
}

export function deleteLocationsByWarehouse(warehouseCode: string): LocationRecord[] {
  ensureLocationSeedData();
  const removed: LocationRecord[] = [];
  Array.from(locationStore.values())
    .filter((location) => location.warehouseCode === warehouseCode)
    .forEach((location) => {
      locationStore.delete(location.code);
      deleteInventoryByLocation(location.code);
      removed.push(location);
    });
  return removed;
}

export function __resetLocationStore(seed = true): void {
  locationStore.clear();
  autoSeed = seed;
}

export function __getLocationRecords(): LocationRecord[] {
  return listLocations();
}


