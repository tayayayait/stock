import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import NewOrderModal from '@/components/NewOrderModal';
import { createEmptyProduct } from '@/src/domains/products';

const fetchProductsMock = vi.hoisted(() => vi.fn());

vi.mock('@/src/services/products', () => ({
  fetchProducts: fetchProductsMock,
}));

describe('NewOrderModal product catalog integration', () => {
  const defaultProps = {
    onClose: () => {},
    onSubmit: vi.fn(),
  };

  beforeEach(() => {
    fetchProductsMock.mockReset();
  });

  it('loads products when the modal opens and shows them in the selector', async () => {
    const product = {
      ...createEmptyProduct(),
      productId: 'prod-1',
      legacyProductId: 101,
      sku: 'SKU-101',
      name: '테스트 상품',
    };

    fetchProductsMock.mockResolvedValueOnce([product]);

    const user = userEvent.setup();

    render(<NewOrderModal isOpen taxRate={0.1} {...defaultProps} />);

    await waitFor(() => {
      expect(fetchProductsMock).toHaveBeenCalledTimes(1);
    });

    const selectorInput = screen.getByPlaceholderText('제품명을 검색하세요');
    await user.click(selectorInput);

    const option = await screen.findByRole('option', { name: '테스트 상품 (SKU-101)' });
    expect(option).toBeTruthy();
  });

  it('re-fetches products when reopened so newly added items appear', async () => {
    const baseProduct = createEmptyProduct();
    const croissant = {
      ...baseProduct,
      productId: 'prod-1',
      legacyProductId: 201,
      sku: 'FG-CR-001',
      name: '크루아상 반죽',
    };
    const cheesecake = {
      ...baseProduct,
      productId: 'prod-2',
      legacyProductId: 202,
      sku: 'FG-CK-002',
      name: '치즈 케이크 베이스',
    };

    fetchProductsMock.mockResolvedValueOnce([croissant]);
    fetchProductsMock.mockResolvedValueOnce([croissant, cheesecake]);

    const user = userEvent.setup();

    const { rerender } = render(<NewOrderModal isOpen={false} taxRate={0.1} {...defaultProps} />);

    rerender(<NewOrderModal isOpen taxRate={0.1} {...defaultProps} />);

    await waitFor(() => {
      expect(fetchProductsMock).toHaveBeenCalledTimes(1);
    });

    let selectorInput = screen.getByPlaceholderText('제품명을 검색하세요');
    await user.click(selectorInput);

    await screen.findByRole('option', { name: '크루아상 반죽 (FG-CR-001)' });
    expect(screen.queryByRole('option', { name: '치즈 케이크 베이스 (FG-CK-002)' })).toBeNull();

    rerender(<NewOrderModal isOpen={false} taxRate={0.1} {...defaultProps} />);
    rerender(<NewOrderModal isOpen taxRate={0.1} {...defaultProps} />);

    await waitFor(() => {
      expect(fetchProductsMock).toHaveBeenCalledTimes(2);
    });

    selectorInput = screen.getByPlaceholderText('제품명을 검색하세요');
    await user.click(selectorInput);

    const newOption = await screen.findByRole('option', { name: '치즈 케이크 베이스 (FG-CK-002)' });
    expect(newOption).toBeTruthy();
  });

  it('shows an empty catalog message when no products are available', async () => {
    fetchProductsMock.mockResolvedValueOnce([]);

    render(<NewOrderModal isOpen taxRate={0.1} {...defaultProps} />);

    await waitFor(() => {
      expect(fetchProductsMock).toHaveBeenCalledTimes(1);
    });

    const emptyState = await screen.findByText('등록된 제품이 없습니다. 품목 관리에서 제품을 추가해 주세요.');
    expect(emptyState).toBeTruthy();
  });
});
