import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import { request } from '@/src/services/http';

const originalFetch = globalThis.fetch;

describe('services/http idempotency safeguards', () => {
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

  it('reuses idempotency responses during concurrent submissions to prevent double deductions', async () => {
    const stock = { quantity: 12 };
    const cache = new Map<string, { remaining: number; body: unknown }>();

    fetchMock.mockImplementation(async (_input, init) => {
      const headers = new Headers(init?.headers);
      const idempotencyKey = headers.get('idempotency-key');
      expect(idempotencyKey).toBe('ship-order-1');

      const parsedBody = init?.body ? JSON.parse(String(init.body)) : {};
      const requested = Array.isArray(parsedBody.lines)
        ? (parsedBody.lines as Array<{ quantity: number }>).reduce(
            (sum, line) => sum + Number(line.quantity ?? 0),
            0,
          )
        : 0;

      if (!cache.has(idempotencyKey!)) {
        if (stock.quantity < requested) {
          return new Response(
            JSON.stringify({ error: { message: '재고가 부족합니다.' } }),
            {
              status: 400,
              headers: { 'content-type': 'application/json' },
            },
          );
        }

        stock.quantity -= requested;
        const payload = {
          idempotent: false,
          remaining: stock.quantity,
        };
        cache.set(idempotencyKey!, { remaining: stock.quantity, body: payload });
        return new Response(JSON.stringify(payload), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      const cached = cache.get(idempotencyKey!)!;
      const replayPayload = {
        idempotent: true,
        remaining: cached.remaining,
      };
      return new Response(JSON.stringify(replayPayload), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });

    const payload = {
      lines: [
        { lineId: 101, quantity: 5, locationId: 1 },
        { lineId: 102, quantity: 3, locationId: 2 },
      ],
    };

    const [first, second] = await Promise.all([
      request('/sales/orders/1/ship', {
        method: 'POST',
        body: payload,
        idempotencyKey: 'ship-order-1',
      }),
      request('/sales/orders/1/ship', {
        method: 'POST',
        body: payload,
        idempotencyKey: 'ship-order-1',
      }),
    ]);

    expect(first).toEqual({ idempotent: false, remaining: 4 });
    expect(second).toEqual({ idempotent: true, remaining: 4 });
    expect(stock.quantity).toBe(4);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstHeaders = new Headers(fetchMock.mock.calls[0]?.[1]?.headers);
    expect(firstHeaders.get('idempotency-key')).toBe('ship-order-1');
  });
});
