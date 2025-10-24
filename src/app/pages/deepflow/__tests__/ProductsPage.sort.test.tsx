import * as React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { type Product } from '../../../../domains/products';
import { ProductsPage } from '../DeepflowDashboard';

const createProduct = (overrides: Partial<Product>): Product => ({
  productId: overrides.productId ?? `product-${overrides.legacyProductId ?? 0}`,
  legacyProductId: overrides.legacyProductId ?? 0,
  sku: overrides.sku ?? 'SKU-DEFAULT',
  name: overrides.name ?? '기본 상품',
  category: overrides.category ?? '카테고리',
  subCategory: overrides.subCategory ?? '서브카테고리',
  unit: overrides.unit ?? 'EA',
  packCase: overrides.packCase ?? '1/1',
  pack: overrides.pack ?? 1,
  casePack: overrides.casePack ?? 1,
  abcGrade: overrides.abcGrade ?? 'A',
  xyzGrade: overrides.xyzGrade ?? 'X',
  bufferRatio: overrides.bufferRatio ?? 0.1,
  dailyAvg: overrides.dailyAvg ?? 10,
  dailyStd: overrides.dailyStd ?? 2,
  totalInbound: overrides.totalInbound ?? 0,
  totalOutbound: overrides.totalOutbound ?? 0,
  avgOutbound7d: overrides.avgOutbound7d ?? 0,
  isActive: overrides.isActive ?? true,
  onHand: overrides.onHand ?? 100,
  reserved: overrides.reserved ?? 0,
  risk: overrides.risk ?? '정상',
  brand: overrides.brand,
  expiryDays: overrides.expiryDays,
  supplyPrice: overrides.supplyPrice ?? null,
  salePrice: overrides.salePrice ?? null,
  referencePrice: overrides.referencePrice ?? null,
  currency: overrides.currency ?? null,
  inventory: overrides.inventory ?? [],
});

const renderProducts = (products: Product[]) =>
  render(
    <ProductsPage
      skus={products}
      query=""
      onQueryChange={() => {}}
      loading={false}
      error={null}
      onRetry={() => {}}
      onEdit={() => {}}
      onNew={() => {}}
      onCsvUpload={() => {}}
      onCsvDownload={() => {}}
      csvDownloading={false}
      csvStatus={null}
    />,
  );

const getRowTexts = () =>
  screen
    .getAllByTestId('product-row')
    .map((row) => row.getAttribute('data-product-name') ?? '');

describe('ProductsPage sorting', () => {
  const sampleProducts = [
    createProduct({ name: 'Bravo', sku: 'SKU-002', legacyProductId: 1 }),
    createProduct({ name: 'Charlie', sku: 'SKU-001', legacyProductId: 3 }),
    createProduct({ name: 'Alpha', sku: 'SKU-003', legacyProductId: 2 }),
  ];

  it('sorts by recent addition descending by default', () => {
    renderProducts(sampleProducts);

    const order = getRowTexts();
    expect(order[0]).toBe('Charlie');
    expect(order[1]).toBe('Alpha');
    expect(order[2]).toBe('Bravo');
  });

  it('allows sorting by name ascending', () => {
    renderProducts(sampleProducts);

    const [sortSelect] = screen.getAllByLabelText('정렬');
    fireEvent.change(sortSelect, { target: { value: 'name:asc' } });

    const order = getRowTexts();
    expect(order[0]).toBe('Alpha');
    expect(order[1]).toBe('Bravo');
    expect(order[2]).toBe('Charlie');
  });

  it('allows sorting by SKU descending', () => {
    renderProducts(sampleProducts);

    const [sortSelect] = screen.getAllByLabelText('정렬');
    fireEvent.change(sortSelect, { target: { value: 'sku:desc' } });

    const order = getRowTexts();
    expect(order[0]).toBe('Alpha');
    expect(order[1]).toBe('Bravo');
    expect(order[2]).toBe('Charlie');
  });
});
