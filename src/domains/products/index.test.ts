import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';

import { generateSku } from './index';

const ORIGINAL_CRYPTO_DESCRIPTOR = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

const restoreCrypto = () => {
  if (ORIGINAL_CRYPTO_DESCRIPTOR) {
    Object.defineProperty(globalThis, 'crypto', ORIGINAL_CRYPTO_DESCRIPTOR);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete (globalThis as Record<string, unknown>).crypto;
  }
};

beforeEach(() => {
  restoreCrypto();
});

afterEach(() => {
  vi.restoreAllMocks();
  restoreCrypto();
});

describe('generateSku', () => {
  it('creates an uppercase SKU with the default prefix using crypto.randomUUID', () => {
    const mockCrypto = {
      randomUUID: vi.fn(() => '12345678-90ab-cdef-1234-567890abcdef'),
    } as unknown as Crypto;

    Object.defineProperty(globalThis, 'crypto', {
      value: mockCrypto,
      configurable: true,
    });

    const sku = generateSku();
    expect(mockCrypto.randomUUID).toHaveBeenCalledTimes(1);
    expect(sku).toBe('SKU-12345678');
  });

  it('retries until a unique SKU is produced', () => {
    const randomUUID = vi
      .fn<() => string>()
      .mockReturnValueOnce('12345678-90ab-cdef-1234-567890abcdef')
      .mockReturnValueOnce('87654321-90ab-cdef-1234-567890abcdef')
      .mockReturnValue('87654321-90ab-cdef-1234-567890abcdef');

    const mockCrypto = {
      randomUUID,
    } as unknown as Crypto;

    Object.defineProperty(globalThis, 'crypto', {
      value: mockCrypto,
      configurable: true,
    });

    const sku = generateSku(['sku-12345678']);
    expect(randomUUID).toHaveBeenCalledTimes(2);
    expect(sku).toBe('SKU-87654321');
  });

  it('falls back to Math.random when crypto is unavailable', () => {
    Object.defineProperty(globalThis, 'crypto', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.25);
    const sku = generateSku(['SKU-00000000']);
    const expectedSegment = Math.floor(0.25 * 36 ** 8)
      .toString(36)
      .toUpperCase()
      .padStart(8, '0');

    expect(randomSpy).toHaveBeenCalledTimes(1);
    expect(sku).toBe(`SKU-${expectedSegment}`);
    expect(sku).not.toBe('SKU-00000000');
  });
});
