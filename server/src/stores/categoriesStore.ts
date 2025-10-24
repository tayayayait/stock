import { randomUUID } from 'node:crypto';

export interface CategoryPayload {
  name: string;
  description: string | null;
}

export interface CategoryRecord extends CategoryPayload {
  id: string;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}

type CategorySeed = CategoryPayload & { productCount?: number };

const categoryStore = new Map<string, CategoryRecord>();
let autoSeed = true;

const defaultCategories: CategorySeed[] = [
  {
    name: '유제품',
    description: '냉장 및 상온 유제품 전반',
    productCount: 42,
  },
  {
    name: '가공식품',
    description: '간편식, 통조림 등 장기 보관 식품',
    productCount: 31,
  },
  {
    name: '신선식품',
    description: '야채, 과일, 육류 등 신선 상품',
    productCount: 27,
  },
];

const normalizeName = (value: string): string => value.trim();

function toRecord(payload: CategorySeed, overrides?: { id?: string; createdAt?: string; updatedAt?: string }) {
  const now = new Date().toISOString();
  const createdAt = overrides?.createdAt ?? now;
  const updatedAt = overrides?.updatedAt ?? now;

  return {
    id: overrides?.id ?? randomUUID(),
    name: payload.name.trim(),
    description: payload.description?.trim() ?? null,
    productCount: payload.productCount ?? 0,
    createdAt,
    updatedAt,
  } satisfies CategoryRecord;
}

export function ensureCategorySeedData(): void {
  if (!autoSeed || categoryStore.size > 0) {
    return;
  }

  defaultCategories.forEach((payload) => {
    const record = toRecord(payload);
    categoryStore.set(record.id, record);
  });
}

export function listCategories(): CategoryRecord[] {
  ensureCategorySeedData();
  return Array.from(categoryStore.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function searchCategories(query: string): CategoryRecord[] {
  ensureCategorySeedData();
  const key = query.trim().toLowerCase();
  if (!key) {
    return listCategories();
  }

  return listCategories().filter((category) =>
    category.name.toLowerCase().includes(key) || (category.description ?? '').toLowerCase().includes(key),
  );
}

export function findCategoryById(id: string): CategoryRecord | undefined {
  ensureCategorySeedData();
  return categoryStore.get(id);
}

export function createCategory(payload: CategoryPayload): CategoryRecord {
  ensureCategorySeedData();
  const normalizedName = normalizeName(payload.name);
  if (!normalizedName) {
    throw new Error('카테고리 이름은 비어 있을 수 없습니다.');
  }

  const record = toRecord(payload);
  categoryStore.set(record.id, record);
  return record;
}

export function updateCategory(id: string, payload: CategoryPayload): CategoryRecord {
  ensureCategorySeedData();
  const existing = categoryStore.get(id);
  if (!existing) {
    throw new Error('요청한 카테고리를 찾을 수 없습니다.');
  }

  const normalizedName = normalizeName(payload.name);
  if (!normalizedName) {
    throw new Error('카테고리 이름은 비어 있을 수 없습니다.');
  }

  const updated: CategoryRecord = {
    ...existing,
    name: normalizedName,
    description: payload.description?.trim() ?? null,
    updatedAt: new Date().toISOString(),
  };

  categoryStore.set(id, updated);
  return updated;
}

export function deleteCategory(id: string): CategoryRecord | undefined {
  ensureCategorySeedData();
  const existing = categoryStore.get(id);
  if (!existing) {
    return undefined;
  }

  categoryStore.delete(id);
  return existing;
}

export function __resetCategoryStore(seed = true): void {
  categoryStore.clear();
  autoSeed = seed;
}

export function __getCategoryRecords(): CategoryRecord[] {
  return listCategories();
}
