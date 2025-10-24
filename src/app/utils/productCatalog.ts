import type { Product } from '@/types';

export type ProductCatalogSummary = {
  id: number;
  name: string;
  sku: string;
};

const resolveNumericId = (product: Product): number | null => {
  if (typeof product.serverId === 'number' && Number.isFinite(product.serverId)) {
    return product.serverId;
  }

  const parsed = Number.parseInt(product.id, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

export const mapProductsToCatalogSummaries = (products: Product[]): ProductCatalogSummary[] => {
  const unique = new Map<number, ProductCatalogSummary>();

  for (const product of products) {
    if (product.isDeleted) {
      continue;
    }

    const id = resolveNumericId(product);
    if (id == null) {
      continue;
    }

    if (!unique.has(id)) {
      unique.set(id, {
        id,
        name: product.productName,
        sku: product.sku,
      });
    }
  }

  return Array.from(unique.values());
};
