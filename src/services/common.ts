export interface PaginationRequest {
  page?: number;
  pageSize?: number;
  sort?: string | string[];
}

export interface PaginationResult<T> {
  total: number;
  count: number;
  items: T[];
}

export type PaginatedResponse<T> = PaginationResult<T>;

export function buildPaginationParams(
  params?: (PaginationRequest & Record<string, unknown>) | null,
): URLSearchParams {
  const search = new URLSearchParams();

  if (!params) {
    return search;
  }

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }

    if (Array.isArray(value)) {
      value
        .filter((entry) => entry !== undefined && entry !== null)
        .forEach((entry) => search.append(key, String(entry)));
      return;
    }

    search.set(key, String(value));
  });

  return search;
}

export interface IdempotentRequestOptions {
  idempotencyKey?: string;
}

export function createIdempotencyHeaders(
  idempotencyKey?: string,
): Record<string, string> | undefined {
  if (!idempotencyKey) {
    return undefined;
  }

  return { 'idempotency-key': idempotencyKey };
}
