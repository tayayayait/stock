import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import ProductDetailPanel from '../components/ProductDetailPanel';
import { createEmptyProduct } from '../../../../domains/products';

const listMovementsMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../services/movements', () => ({
  listMovements: listMovementsMock,
}));

const buildProduct = () => {
  const base = createEmptyProduct();
  return {
    ...base,
    productId: 'product-1',
    legacyProductId: 1,
    sku: 'SKU-001',
    name: '테스트 상품',
    category: '식품',
    subCategory: '간식',
    onHand: 120,
    reserved: 20,
    inventory: [
      {
        warehouseCode: 'WH-01',
        locationCode: 'LOC-01',
        onHand: 80,
        reserved: 10,
      },
    ],
  };
};

describe('ProductDetailPanel', () => {
  beforeEach(() => {
    listMovementsMock.mockReset();
  });

  it('renders total inventory summary and latest receipt/issue details', async () => {
    const product = buildProduct();
    const latestReceiptDate = '2024-02-10T03:00:00Z';
    const latestIssueDate = '2024-02-12T09:30:00Z';

    const receiptLabel = new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(latestReceiptDate));

    const issueLabel = new Intl.DateTimeFormat('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(latestIssueDate));

    listMovementsMock.mockResolvedValue({
      total: 3,
      count: 3,
      offset: 0,
      limit: 50,
      items: [
        {
          id: 'mv-1',
          occurredAt: latestReceiptDate,
          type: 'RECEIPT',
          qty: 30,
          partnerId: 'ACME',
          from: null,
          to: { warehouseCode: 'WH-01', locationCode: 'LOC-01' },
        },
        {
          id: 'mv-2',
          occurredAt: latestIssueDate,
          type: 'ISSUE',
          qty: 10,
          from: { warehouseCode: 'WH-01', locationCode: 'LOC-02' },
          to: null,
        },
        {
          id: 'mv-3',
          occurredAt: '2023-12-01T00:00:00Z',
          type: 'ADJUST',
          qty: 5,
          partnerId: 'OLD',
        },
      ],
    });

    render(<ProductDetailPanel product={product} />);

    expect(screen.getByText('재고 요약')).toBeInTheDocument();
    expect(screen.getByText('총 재고')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(receiptLabel)).toBeInTheDocument();
      expect(screen.getByText(issueLabel)).toBeInTheDocument();
    });

    expect(screen.getByText('100 EA')).toBeInTheDocument();
    expect(screen.getByText('120 EA')).toBeInTheDocument();
    expect(screen.getByText('20 EA')).toBeInTheDocument();
    expect(screen.getByText('+30 EA')).toBeInTheDocument();
    expect(screen.getByText('-10 EA')).toBeInTheDocument();
    expect(screen.getByText('거래처 ACME')).toBeInTheDocument();
    expect(screen.getByText('거래처 정보 없음')).toBeInTheDocument();
  });
});
