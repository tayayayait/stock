import { DEFAULT_UNIT_OPTIONS, type Product } from '../../../domains/products';

const toMessage = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

export function validateProductDraft(row: Product): string | null {
  const trimmedCategory = row.category.trim();
  if (!trimmedCategory) {
    return '카테고리를 선택해 주세요.';
  }

  const normalizedUnit = row.unit.trim().toUpperCase();
  if (!normalizedUnit || !DEFAULT_UNIT_OPTIONS.includes(normalizedUnit)) {
    return '유효한 단위를 선택해 주세요.';
  }

  return null;
}

export const extractFirstDetail = (payload: unknown): string | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const container = payload as { details?: unknown };
  const direct = toMessage(container.details);
  if (direct) {
    return direct;
  }

  if (Array.isArray(container.details)) {
    for (const entry of container.details) {
      const message = toMessage(entry);
      if (message) {
        return message;
      }
    }
  }

  return null;
};
