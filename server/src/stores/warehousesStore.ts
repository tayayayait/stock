import { randomUUID } from 'node:crypto';

export interface WarehousePayload {
  code: string;
  name: string;
  address?: string;
  notes?: string;
}

export interface WarehouseRecord extends WarehousePayload {
  id: string;
  createdAt: string;
  updatedAt: string;
}

const warehouseStore = new Map<string, WarehouseRecord>();
let autoSeed = true;

const defaultWarehouses: WarehousePayload[] = [
  {
    code: 'WH-SEOUL',
    name: '서울 풀필먼트 센터',
    address: '서울특별시 송파구 물류로 123',
  },
  {
    code: 'WH-BUSAN',
    name: '부산 항만 물류센터',
    address: '부산광역시 해운대구 국제물류로 89',
  },
  {
    code: 'WH-DAEJEON',
    name: '대전 허브센터',
    address: '대전광역시 유성구 과학물류길 56',
  },
];

function toRecord(payload: WarehousePayload): WarehouseRecord {
  const now = new Date().toISOString();
  return {
    ...payload,
    id: randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
}

export function ensureWarehouseSeedData(): void {
  if (!autoSeed || warehouseStore.size > 0) {
    return;
  }

  defaultWarehouses.forEach((payload) => {
    if (!warehouseStore.has(payload.code)) {
      warehouseStore.set(payload.code, toRecord(payload));
    }
  });
}

export function listWarehouses(): WarehouseRecord[] {
  ensureWarehouseSeedData();
  return Array.from(warehouseStore.values()).sort((a, b) => a.code.localeCompare(b.code));
}

export function findWarehouseByCode(code: string): WarehouseRecord | undefined {
  ensureWarehouseSeedData();
  return warehouseStore.get(code);
}

export function createWarehouse(payload: WarehousePayload): WarehouseRecord {
  ensureWarehouseSeedData();
  if (warehouseStore.has(payload.code)) {
    throw new Error('이미 존재하는 물류센터 코드입니다.');
  }

  const record = toRecord(payload);
  warehouseStore.set(record.code, record);
  return record;
}

type WarehouseUpdate = {
  name: string;
} & Partial<Pick<WarehousePayload, 'address' | 'notes'>>;

export function updateWarehouse(code: string, changes: WarehouseUpdate): WarehouseRecord {
  ensureWarehouseSeedData();
  const existing = warehouseStore.get(code);
  if (!existing) {
    throw new Error('요청한 물류센터를 찾을 수 없습니다.');
  }

  const updated: WarehouseRecord = {
    ...existing,
    ...changes,
    updatedAt: new Date().toISOString(),
  };
  warehouseStore.set(code, updated);
  return updated;
}

export function deleteWarehouse(code: string): WarehouseRecord | undefined {
  ensureWarehouseSeedData();
  const existing = warehouseStore.get(code);
  if (!existing) {
    return undefined;
  }

  warehouseStore.delete(code);
  return existing;
}

export function __resetWarehouseStore(seed = true): void {
  warehouseStore.clear();
  autoSeed = seed;
}

export function __getWarehouseRecords(): WarehouseRecord[] {
  return listWarehouses();
}
