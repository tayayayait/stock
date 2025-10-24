import { beforeEach, describe, expect, it, vi } from 'vitest';

const httpRequestMock = vi.hoisted(() => vi.fn());

vi.mock('./http', () => ({
  request: httpRequestMock,
}));

import { __test__, createLocation, createWarehouse, fetchLocations } from './api';

const { buildRequestUrl, trimTrailingSlashes, FALLBACK_RELATIVE_BASE, isAbsoluteUrl } = __test__;

describe('api service URL helpers', () => {
  it('trims trailing slashes from base values', () => {
    expect(trimTrailingSlashes('https://example.com/')).toBe('https://example.com');
    expect(trimTrailingSlashes('https://example.com///')).toBe('https://example.com');
    expect(trimTrailingSlashes('/api/')).toBe('/api');
  });

  it('detects absolute URLs', () => {
    expect(isAbsoluteUrl('https://example.com')).toBe(true);
    expect(isAbsoluteUrl('HTTP://example.com')).toBe(true);
    expect(isAbsoluteUrl('/api')).toBe(false);
  });

  it('builds URLs using absolute API host when provided', () => {
    const url = buildRequestUrl('/api/warehouses', 'https://api.example.com/');
    expect(url).toBe('https://api.example.com/api/warehouses');
  });

  it('reuses dashboard origin when provided as base', () => {
    const url = buildRequestUrl('/api/warehouses', 'https://app.example.com');
    expect(url).toBe('https://app.example.com/api/warehouses');
  });

  it('avoids duplicating the /api prefix when the base already includes it', () => {
    const directBase = buildRequestUrl('/api/warehouses', 'https://api.example.com/api');
    expect(directBase).toBe('https://api.example.com/api/warehouses');

    const nestedBase = buildRequestUrl('/api/warehouses', 'https://api.example.com/v1/api/');
    expect(nestedBase).toBe('https://api.example.com/v1/api/warehouses');
  });

  it('falls back to relative /api prefix when base is unset during SSR', () => {
    const urlWithPrefix = buildRequestUrl('/api/import/csv', FALLBACK_RELATIVE_BASE);
    expect(urlWithPrefix).toBe('/api/import/csv');

    const urlWithoutPrefix = buildRequestUrl('/health', FALLBACK_RELATIVE_BASE);
    expect(urlWithoutPrefix).toBe('/api/health');
  });

  it('handles undefined base by returning the provided path', () => {
    const url = buildRequestUrl('/api/movements');
    expect(url.endsWith('/api/movements')).toBe(true);
  });
});

describe('api service endpoints', () => {
  beforeEach(() => {
    httpRequestMock.mockReset();
    httpRequestMock.mockResolvedValue({});
  });

  it('requests the locations list using the /api/locations path', async () => {
    await fetchLocations('WH-42', { q: 'bin' });

    const [url, options] = httpRequestMock.mock.calls[0];
    expect(url).toContain('/api/locations');
    expect(url).toContain('warehouseCode=WH-42');
    expect(options).toMatchObject({ method: 'GET' });
  });

  it('creates a location using the /api/locations path', async () => {
    await createLocation({ warehouseCode: 'WH-13', code: 'A1', description: 'Shelf' });

    const [url, options] = httpRequestMock.mock.calls[0];
    expect(url).toContain('/api/locations');
    expect(options).toMatchObject({ method: 'POST' });
  });

  it('returns the created location when the response is wrapped in an item envelope', async () => {
    const createdLocation = {
      id: 'loc-1',
      code: 'A1',
      description: 'Shelf',
      warehouseCode: 'WH-13',
    };

    httpRequestMock.mockResolvedValueOnce({ item: createdLocation });

    const result = await createLocation({ warehouseCode: 'WH-13', code: 'A1', description: 'Shelf' });
    expect(result).toEqual(createdLocation);
  });

  it('returns the created warehouse when the response is wrapped in an item envelope', async () => {
    const createdWarehouse = {
      id: 10,
      code: 'WH-13',
      name: 'Main Warehouse',
    };

    httpRequestMock.mockResolvedValueOnce({ item: createdWarehouse });

    const result = await createWarehouse({ code: 'WH-13', name: 'Main Warehouse' });
    expect(result).toEqual(createdWarehouse);
  });
});
