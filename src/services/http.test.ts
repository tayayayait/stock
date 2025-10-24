import { describe, expect, it } from 'vitest';

import { __test__ } from './http';

const { extractErrorMessage, parsePayload } = __test__;

describe('extractErrorMessage', () => {
  it('returns nested message values', () => {
    const message = extractErrorMessage({ error: { message: 'Invalid request' } });
    expect(message).toBe('Invalid request');
  });

  it('ignores HTML payload strings', () => {
    const html = '<!DOCTYPE html><html><body>Oops</body></html>';
    expect(extractErrorMessage(html)).toBeUndefined();
  });
});

describe('parsePayload', () => {
  it('returns raw content for non-JSON payloads', async () => {
    const response = new Response('<html><body>Error</body></html>', {
      status: 502,
      statusText: 'Bad Gateway',
      headers: { 'content-type': 'text/html' },
    });

    const result = await parsePayload(response, false);

    expect(result.payload).toBe('<html><body>Error</body></html>');
    expect(result.rawText).toBe('<html><body>Error</body></html>');
  });

  it('wraps invalid JSON responses in a failure payload', async () => {
    const response = new Response('<html>Error</html>', {
      status: 400,
      statusText: 'Bad Request',
      headers: { 'content-type': 'application/json' },
    });

    const { payload } = await parsePayload(response, true);

    expect(payload).toEqual({
      success: false,
      error: {
        code: 400,
        message: '요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.',
      },
    });
  });
});
