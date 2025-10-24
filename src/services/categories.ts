import { request } from './http';

export interface CategoryRecord {
  id: string;
  name: string;
  description?: string | null;
  productCount?: number | null;
  parentId?: string | null;
  children?: CategoryRecord[] | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface Category {
  id: string;
  name: string;
  description: string;
  productCount: number;
  parentId: string | null;
  children: Category[];
  createdAt?: string;
  updatedAt?: string;
}

interface CategoryListResponse {
  items: CategoryRecord[];
  count: number;
}

interface CategoryItemResponse {
  item: CategoryRecord;
}

export interface CategoryPayload {
  name: string;
  description?: string;
  parentId?: string | null;
}

interface CategoryPayloadRequest {
  name: string;
  description: string | null;
  parentId: string | null;
}

const normalizeCategoryRecord = (
  record: CategoryRecord,
  parentIdOverride: string | null = null,
): Category => {
  const id = typeof record.id === 'string' ? record.id : String(record.id ?? '');
  const children = Array.isArray(record.children) ? record.children : [];
  const parentId = parentIdOverride ?? (record.parentId ? String(record.parentId) : null);

  return {
    id,
    name: record.name?.trim() ?? '',
    description: record.description?.trim() ?? '',
    productCount: Number.isFinite(record.productCount ?? NaN) ? Number(record.productCount) : 0,
    parentId,
    children: children.map((child) => normalizeCategoryRecord(child, id)),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
};

const buildPayload = (input: CategoryPayload): CategoryPayloadRequest => {
  const name = input.name?.trim() ?? '';
  const description = input.description?.trim() ?? '';
  const parentId = input.parentId?.toString().trim() ?? '';

  return {
    name,
    description: description || null,
    parentId: parentId || null,
  };
};

export async function fetchCategories(query?: string): Promise<Category[]> {
  const params = new URLSearchParams();
  if (query && query.trim()) {
    params.set('q', query.trim());
  }

  const path = params.toString() ? `/categories?${params.toString()}` : '/categories';
  const response = await request<CategoryListResponse>(path, { method: 'GET' });
  const items = Array.isArray(response.items) ? response.items : [];
  const hasNestedChildren = items.some((item) => Array.isArray(item.children) && item.children.length > 0);

  if (hasNestedChildren) {
    return items.map((item) => normalizeCategoryRecord(item));
  }

  const normalized = items.map((item) => {
    const parentId = item.parentId ? String(item.parentId) : null;
    return {
      ...normalizeCategoryRecord({ ...item, children: [] }, parentId),
      parentId,
    };
  });

  const byId = new Map<string, Category>();
  normalized.forEach((entry) => {
    byId.set(entry.id, { ...entry, children: [] });
  });

  const roots: Category[] = [];

  normalized.forEach((entry) => {
    const parentId = entry.parentId;
    if (parentId && byId.has(parentId)) {
      const parent = byId.get(parentId)!;
      parent.children = [...parent.children, byId.get(entry.id)!];
    } else {
      roots.push(byId.get(entry.id)!);
    }
  });

  return roots;
}

export async function createCategory(input: CategoryPayload): Promise<Category> {
  const response = await request<CategoryItemResponse>('/categories', {
    method: 'POST',
    body: buildPayload(input),
  });

  return normalizeCategoryRecord(response.item);
}

export async function updateCategory(
  categoryId: string,
  input: CategoryPayload,
): Promise<Category> {
  const response = await request<CategoryItemResponse>(
    `/categories/${encodeURIComponent(categoryId)}`,
    {
      method: 'PUT',
      body: buildPayload(input),
    },
  );

  return normalizeCategoryRecord(response.item);
}

export async function deleteCategory(categoryId: string): Promise<void> {
  await request<void>(`/categories/${encodeURIComponent(categoryId)}`, {
    method: 'DELETE',
  });
}

export const __test__ = {
  normalizeCategoryRecord,
  buildPayload,
};
