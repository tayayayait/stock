import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { shipSO } from '@/src/services/sales';

type ShipRequest = {
  lines: Array<{ lineId: number; quantity: number; locationId: number }>
};

describe('shipSO concurrency handling', () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = vi.fn<(
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Promise<Response>>();

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('avoids double shipment when the same idempotency key is replayed concurrently', async () => {
    const stock = { quantity: 6 };
    let responsesSeen = 0;
    let shipmentsApplied = 0;
    const cache = new Map<string, Response>();

    fetchMock.mockImplementation(async (input, init) => {
      responsesSeen += 1;
      const url = String(input);
      if (!/\/sales(?:-|\/)orders\//.test(url) || !url.endsWith('/ship')) {
        throw new Error(`Unexpected URL ${url}`);
      }

      const headers = new Headers(init?.headers);
      const idempotencyKey = headers.get('idempotency-key');
      expect(idempotencyKey).toBe('test-ship-key');

      if (cache.has(idempotencyKey!)) {
        return cache.get(idempotencyKey!)!.clone();
      }

      const body = init?.body ? (JSON.parse(String(init.body)) as ShipRequest) : { lines: [] };
      const requested = body.lines.reduce((total, line) => total + Number(line.quantity ?? 0), 0);

      if (stock.quantity < requested) {
        return new Response(JSON.stringify({ error: { message: '재고가 부족합니다.' } }), {
          status: 400,
          headers: { 'content-type': 'application/json' },
        });
      }

      stock.quantity -= requested;
      shipmentsApplied += 1;

      const now = new Date().toISOString();
      const responseBody = {
        idempotent: false,
        order: {
          id: 42,
          orderNumber: 'SO-42',
          customerId: 1,
          status: 'shipped',
          totalAmount: '0',
          currency: 'KRW',
          createdAt: now,
          updatedAt: now,
          lines: body.lines.map((line, index) => ({
            id: line.lineId ?? index + 1,
            salesOrderId: 42,
            productId: 99,
            quantityOrdered: line.quantity,
            quantityFulfilled: line.quantity,
            rate: '0',
            lineAmount: '0',
          })),
        },
        movements: [],
        levels: [
          { productId: 99, locationId: 1, quantity: stock.quantity },
        ],
      } satisfies ReturnType<typeof shipSO> extends Promise<infer T> ? T : never;

      const response = new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });

      cache.set(idempotencyKey!, response.clone());
      return response;
    });

    const payload: ShipRequest = {
      lines: [
        { lineId: 11, quantity: 2, locationId: 10 },
        { lineId: 12, quantity: 1, locationId: 11 },
      ],
    };

    const [first, second] = await Promise.all([
      shipSO(42, payload, { idempotencyKey: 'test-ship-key' }),
      shipSO(42, payload, { idempotencyKey: 'test-ship-key' }),
    ]);

    expect(first.idempotent).toBe(false);
    expect(second.idempotent).toBe(false);
    expect(second).toEqual(first);
    expect(first.order.lines.every((line) => line.quantityFulfilled === line.quantityOrdered)).toBe(true);
    expect(stock.quantity).toBe(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(responsesSeen).toBe(2);
    expect(shipmentsApplied).toBe(1);
  });
});
