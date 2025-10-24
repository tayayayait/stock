import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { SalesOrderListItem } from '@/src/hooks/useSales';

vi.mock('@/src/services/http', () => ({
  http: {
    request: vi.fn(),
  },
}));

import { http } from '@/src/services/http';
import { useSalesOrders } from '@/src/hooks/useSales';

type MockInstance = ReturnType<typeof vi.fn>;
const httpRequestMock = http.request as unknown as MockInstance;

describe('useSalesOrders', () => {
  beforeEach(() => {
    httpRequestMock.mockReset();
  });

  afterEach(() => {
    httpRequestMock.mockReset();
  });

  it('fetches sales orders and exposes them with loading state updates', async () => {
    const orders: SalesOrderListItem[] = [
      {
        id: 1,
        orderNumber: 'SO-1',
        status: 'draft',
        orderDate: '2024-01-01T00:00:00.000Z',
        shipmentDate: null,
        totalAmount: '120000',
        currency: 'KRW',
        customer: { id: 10, name: 'Acme' },
      },
    ];

    httpRequestMock.mockResolvedValue(orders);

    const { result } = renderHook(() => useSalesOrders({ debounceMs: 0 }));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.orders).toEqual([]);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.orders).toEqual(orders);
    expect(result.current.error).toBeNull();
  });

  it('normalizes errors when the request fails', async () => {
    const failure = new Error('boom');
    httpRequestMock.mockRejectedValue(failure);

    const { result } = renderHook(() => useSalesOrders({ debounceMs: 0 }));

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.orders).toEqual([]);
    expect(result.current.error).not.toBeNull();
    expect(result.current.error?.message).toBe('boom');
  });
});
