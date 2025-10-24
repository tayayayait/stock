import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  http,
  addRequestInterceptor,
  addResponseInterceptor,
  type HttpResponse,
} from '@/src/lib/http';

const originalFetch = globalThis.fetch;

describe('http.request', () => {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

  beforeEach(() => {
    fetchMock.mockReset();
    globalThis.fetch = fetchMock as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('prefixes relative paths, stringifies JSON bodies, and returns normalized data', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { id: 1, name: 'Item' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const response = await http.request<{ id: number; name: string }>('/inventory/items', {
      method: 'POST',
      body: { id: 1, name: 'Item' },
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0]!;
    const [url, init] = call;
    expect(url).toBe('/api/inventory/items');
    expect(init?.method).toBe('POST');

    const headers = new Headers(init?.headers);
    expect(headers.get('content-type')).toBe('application/json');
    expect(init?.body).toBe(JSON.stringify({ id: 1, name: 'Item' }));

    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.data).toEqual({ id: 1, name: 'Item' });
    }
  });

  it('runs request and response interceptors in order', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ data: { id: 2, name: 'Intercepted' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const removeRequest = addRequestInterceptor((context) => {
      const headers = new Headers(context.init.headers);
      headers.set('x-test-interceptor', 'true');
      return {
        ...context,
        init: { ...context.init, headers },
      };
    });

    const removeResponse = addResponseInterceptor(async ({ response, request }) => {
      const json = await response.json();
      const modified = {
        ...json,
        data: { ...(json.data as { id: number; name: string }), name: 'Modified' },
      };

      return {
        request,
        response: new Response(JSON.stringify(modified), {
          status: response.status,
          headers: response.headers,
        }),
      };
    });

    try {
      const result = await http.request<{ id: number; name: string }>('/test');
      const call = fetchMock.mock.calls[0]!;
      const [, init] = call;
      const headers = new Headers(init?.headers);
      expect(headers.get('x-test-interceptor')).toBe('true');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.data).toEqual({ id: 2, name: 'Modified' });
      }
    } finally {
      removeRequest();
      removeResponse();
    }
  });

  it('returns client error messages extracted from payload', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: { message: '요청이 유효하지 않습니다.' } }), {
        status: 422,
        headers: { 'content-type': 'application/json' },
      }),
    );

    const result = await http.request<unknown>('/failing-request');

    if (result.ok) {
      throw new Error('Expected error response');
    }

    const errorResult = result as Extract<HttpResponse<unknown>, { ok: false }>;

    expect(errorResult.error.code).toBe(422);
    expect(errorResult.error.message).toBe('요청이 유효하지 않습니다.');
  });
});
