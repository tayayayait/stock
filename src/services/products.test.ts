import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setupServer } from 'msw/node';
import { http, HttpResponse } from 'msw';

import { productCatalog } from '../mocks/products';
import { fetchProducts } from './products';

const server = setupServer(
  http.get('*/api/products', () => HttpResponse.json(productCatalog)),
);

beforeAll(() => server.listen());
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('fetchProducts with MSW', () => {
  it('returns the mocked product catalog when the handler is active', async () => {
    const products = await fetchProducts();

    expect(products).toHaveLength(productCatalog.count);
    expect(products.map((product) => product.sku)).toEqual(
      productCatalog.items.map((product) => product.sku),
    );
  });
});
