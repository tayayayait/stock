import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import NewOrderForm from '@/src/domains/orders/components/NewOrderForm';
import type { Partner } from '@/src/services/orders';
import type { Warehouse, Location } from '@/src/services/wh';
import { createEmptyProduct } from '@/src/domains/products';

const showToastMock = vi.fn();

vi.mock('@/src/components/Toaster', async () => {
  const actual = await vi.importActual<typeof import('@/src/components/Toaster')>(
    '@/src/components/Toaster',
  );
  return {
    ...actual,
    useToast: () => showToastMock,
  };
});

describe('NewOrderForm product loading', () => {
  beforeEach(() => {
    window.localStorage.clear();
    showToastMock.mockReset();
  });

  it('fetches products via onReloadProducts when none are loaded yet', async () => {
    const partners: Partner[] = [
      {
        id: 'partner-1',
        type: 'SUPPLIER',
        name: '테스트 공급사',
        isActive: true,
      },
    ];
    const warehouses: Warehouse[] = [
      { id: 'wh-1', code: 'W1', name: '1창고' },
    ];
    const locationsByWarehouse: Record<string, Location[]> = {};
    const loadingLocations: Record<string, boolean> = {};

    const product = {
      ...createEmptyProduct(),
      productId: 'prod-1',
      legacyProductId: 1,
      sku: 'SKU-1',
      name: '테스트 상품',
      unit: 'EA',
      inventory: [{ warehouseCode: 'W1', locationCode: 'L1', onHand: 64, reserved: 0 }],
    };

    const onReloadProducts = vi.fn().mockResolvedValue([product]);

    render(
      <NewOrderForm
        defaultKind="purchase"
        partners={partners}
        warehouses={warehouses}
        locationsByWarehouse={locationsByWarehouse}
        loadingLocations={loadingLocations}
        products={undefined}
        onReloadProducts={onReloadProducts}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onRequestLocations={() => {}}
      />,
    );

    await waitFor(() => {
      expect(onReloadProducts).toHaveBeenCalledTimes(1);
    });

    const option = await screen.findByRole('option', { name: '테스트 상품 (SKU-1)' });
    expect(option.textContent).toContain('테스트 상품');
  });

  it('stops showing loading message after fetching empty product list', async () => {
    const partners: Partner[] = [
      {
        id: 'partner-1',
        type: 'SUPPLIER',
        name: '테스트 공급사',
        isActive: true,
      },
    ];
    const warehouses: Warehouse[] = [
      { id: 'wh-1', code: 'W1', name: '1창고' },
    ];
    const locationsByWarehouse: Record<string, Location[]> = {};
    const loadingLocations: Record<string, boolean> = {};

    const onReloadProducts = vi.fn().mockResolvedValue([]);

    render(
      <NewOrderForm
        defaultKind="purchase"
        partners={partners}
        warehouses={warehouses}
        locationsByWarehouse={locationsByWarehouse}
        loadingLocations={loadingLocations}
        products={undefined}
        onReloadProducts={onReloadProducts}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onRequestLocations={() => {}}
      />,
    );

    await waitFor(() => {
      expect(onReloadProducts).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.queryByRole('option', { name: '상품을 불러오는 중...' })).toBeNull();
    });
  });

  it('retries loading products when a previous attempt failed and no data is present', async () => {
    const partners: Partner[] = [
      {
        id: 'partner-1',
        type: 'SUPPLIER',
        name: '테스트 공급사',
        isActive: true,
      },
    ];
    const warehouses: Warehouse[] = [
      { id: 'wh-1', code: 'W1', name: '1창고' },
    ];
    const locationsByWarehouse: Record<string, Location[]> = {};
    const loadingLocations: Record<string, boolean> = {};

    const product = {
      ...createEmptyProduct(),
      productId: 'prod-1',
      legacyProductId: 1,
      sku: 'SKU-1',
      name: '테스트 상품',
      unit: 'EA',
      inventory: [{ warehouseCode: 'W1', locationCode: 'L1', onHand: 120, reserved: 0 }],
    };

    const onReloadProducts = vi
      .fn()
      .mockRejectedValueOnce(new Error('network failed'))
      .mockResolvedValueOnce([product]);

    render(
      <NewOrderForm
        defaultKind="purchase"
        partners={partners}
        warehouses={warehouses}
        locationsByWarehouse={locationsByWarehouse}
        loadingLocations={loadingLocations}
        products={undefined}
        onReloadProducts={onReloadProducts}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onRequestLocations={() => {}}
      />,
    );

    await waitFor(() => {
      expect(onReloadProducts).toHaveBeenCalledTimes(1);
    });

    const retryButton = await screen.findByRole('button', { name: '다시 시도' });

    const user = userEvent.setup();
    await user.click(retryButton);

    await waitFor(() => {
      expect(onReloadProducts).toHaveBeenCalledTimes(2);
    });

    const option = await screen.findByRole('option', { name: '테스트 상품 (SKU-1)' });
    expect(option.textContent).toContain('테스트 상품');
  });

  it('filters product options by selected warehouse and shows the current stock', async () => {
    const partners: Partner[] = [
      {
        id: 'partner-1',
        type: 'SUPPLIER',
        name: '공급 파트너',
        isActive: true,
      },
    ];
    const warehouses: Warehouse[] = [
      { id: 'wh-1', code: 'W1', name: 'A창고' },
      { id: 'wh-2', code: 'W2', name: 'B창고' },
    ];
    const locationsByWarehouse: Record<string, Location[]> = {
      W1: [{ id: 'loc-1', code: 'L1', name: 'A존', warehouseCode: 'W1' }],
      W2: [{ id: 'loc-2', code: 'L2', name: 'B존', warehouseCode: 'W2' }],
    };
    const loadingLocations: Record<string, boolean> = {};

    const productInW1 = {
      ...createEmptyProduct(),
      productId: 'prod-a',
      legacyProductId: 101,
      sku: 'SKU-A',
      name: '반도체 A',
      unit: 'EA',
      inventory: [
        { warehouseCode: 'W1', locationCode: 'L1', onHand: 31, reserved: 0 },
        { warehouseCode: 'W2', locationCode: 'L2', onHand: 9, reserved: 0 },
      ],
    };

    const productInW2 = {
      ...createEmptyProduct(),
      productId: 'prod-b',
      legacyProductId: 102,
      sku: 'SKU-B',
      name: '반도체 B',
      unit: 'EA',
      inventory: [{ warehouseCode: 'W2', locationCode: 'L2', onHand: 9, reserved: 0 }],
    };

    render(
      <NewOrderForm
        defaultKind="purchase"
        partners={partners}
        warehouses={warehouses}
        locationsByWarehouse={locationsByWarehouse}
        loadingLocations={loadingLocations}
        products={[productInW1, productInW2]}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onRequestLocations={() => {}}
        preferredWarehouseSelection={{
          warehouseId: 'wh-1',
          warehouseCode: 'W1',
          locationId: 'loc-1',
          locationCode: 'L1',
        }}
      />,
    );

    const productSelect = await screen.findByLabelText('?�품');

    await waitFor(() => {
      expect(screen.queryByRole('option', { name: '반도체 B (SKU-B)' })).toBeNull();
    });

    const user = userEvent.setup();
    await user.selectOptions(productSelect, 'SKU-A');

    await screen.findByText('현재 재고: 31 EA (W1) · 상세 위치 L1: 31 EA');
  });

  it('shows zero quantity for registered items without stock in the selected warehouse', async () => {
    const partners: Partner[] = [
      {
        id: 'partner-1',
        type: 'SUPPLIER',
        name: '공급 파트너',
        isActive: true,
      },
    ];
    const warehouses: Warehouse[] = [
      { id: 'wh-1', code: 'W1', name: 'A창고' },
      { id: 'wh-2', code: 'W2', name: 'B창고' },
    ];
    const locationsByWarehouse: Record<string, Location[]> = {
      W1: [
        { id: 'loc-1', code: 'L1', name: 'A존', warehouseCode: 'W1' },
        { id: 'loc-3', code: 'L3', name: 'A존-보관', warehouseCode: 'W1' },
      ],
      W2: [{ id: 'loc-2', code: 'L2', name: 'B존', warehouseCode: 'W2' }],
    };
    const loadingLocations: Record<string, boolean> = {};

    const productWithZeroStock = {
      ...createEmptyProduct(),
      productId: 'prod-zero',
      legacyProductId: 103,
      sku: 'SKU-Z',
      name: '반도체 Z',
      unit: 'EA',
      inventory: [{ warehouseCode: 'W1', locationCode: 'L1', onHand: 0, reserved: 0 }],
    };

    render(
      <NewOrderForm
        defaultKind="purchase"
        partners={partners}
        warehouses={warehouses}
        locationsByWarehouse={locationsByWarehouse}
        loadingLocations={loadingLocations}
        products={[productWithZeroStock]}
        onSubmit={vi.fn().mockResolvedValue(undefined)}
        onRequestLocations={() => {}}
        preferredWarehouseSelection={{
          warehouseId: 'wh-1',
          warehouseCode: 'W1',
          locationId: 'loc-1',
          locationCode: 'L1',
        }}
      />,
    );

    const productSelect = await screen.findByLabelText('?�품');
    await screen.findByRole('option', { name: '반도체 Z (SKU-Z)' });

    const user = userEvent.setup();
    await user.selectOptions(productSelect, 'SKU-Z');

    await screen.findByText('현재 재고: 0 EA (W1) · 상세 위치 L1: 0 EA');
  });
});

describe('NewOrderForm submission feedback', () => {
  beforeEach(() => {
    window.localStorage.clear();
    showToastMock.mockReset();
  });

  const buildCommonProps = (kind: 'purchase' | 'sales') => {
    const partner: Partner = {
      id: kind === 'purchase' ? 'partner-supplier' : 'partner-customer',
      type: kind === 'purchase' ? 'SUPPLIER' : 'CUSTOMER',
      name: kind === 'purchase' ? '공급사' : '고객사',
      isActive: true,
    };

    const warehouses: Warehouse[] = [{ id: 'wh-1', code: 'W1', name: '1창고' }];
    const locationsByWarehouse: Record<string, Location[]> = {
      W1: [{ id: 'loc-1', code: 'L1', name: '상세위치', warehouseCode: 'W1' }],
    };
    const loadingLocations: Record<string, boolean> = {};

    const product = {
      ...createEmptyProduct(),
      productId: 'prod-1',
      legacyProductId: 1,
      sku: 'SKU-1',
      name: '테스트 상품',
      unit: 'EA',
      inventory: [{ warehouseCode: 'W1', locationCode: 'L1', onHand: 120, reserved: 0 }],
    };

    return {
      defaultKind: kind,
      partners: [partner],
      warehouses,
      locationsByWarehouse,
      loadingLocations,
      products: [product],
      preferredWarehouseSelection: {
        warehouseId: 'wh-1',
        warehouseCode: 'W1',
        locationId: 'loc-1',
        locationCode: 'L1',
      } as const,
    };
  };

  const fillValidForm = async (kind: 'purchase' | 'sales') => {
    const scheduledAtLabel = kind === 'purchase' ? '입고일' : '출고일';
    const scheduledAtInput = screen.getByLabelText(scheduledAtLabel) as HTMLInputElement;
    fireEvent.change(scheduledAtInput, { target: { value: '2024-01-01' } });

    const productSelect = await screen.findByLabelText('상품');
    const user = userEvent.setup();
    await user.selectOptions(productSelect, 'SKU-1');

    const quantityInput = screen.getByLabelText('수량 / 단위');
    await user.clear(quantityInput);
    await user.type(quantityInput, '3');

    return user;
  };

  it('shows an error toast when purchase order submission fails due to network issues', async () => {
    const networkError = Object.assign(new Error('네트워크 오류'), { status: 0, name: 'HttpError' });
    const onSubmit = vi.fn().mockRejectedValue(networkError);

    render(
      <NewOrderForm
        {...buildCommonProps('purchase')}
        onSubmit={onSubmit}
        onRequestLocations={() => {}}
      />, 
    );

    const user = await fillValidForm('purchase');
    const submitButton = screen.getByRole('button', { name: '저장' });
    await user.click(submitButton);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith(
        '입고 처리에 실패했습니다.',
        expect.objectContaining({ tone: 'error' }),
      );
    });
    expect(screen.queryByText('네트워크 오류')).not.toBeInTheDocument();
  });

  it('shows an error toast when sales order submission fails due to server issues', async () => {
    const serverError = Object.assign(new Error('Server exploded'), { status: 500, name: 'HttpError' });
    const onSubmit = vi.fn().mockRejectedValue(serverError);

    render(
      <NewOrderForm
        {...buildCommonProps('sales')}
        onSubmit={onSubmit}
        onRequestLocations={() => {}}
      />, 
    );

    const user = await fillValidForm('sales');
    const submitButton = screen.getByRole('button', { name: '저장' });
    await user.click(submitButton);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith(
        '출고 처리에 실패했습니다.',
        expect.objectContaining({ tone: 'error' }),
      );
    });
    expect(screen.queryByText('Server exploded')).not.toBeInTheDocument();
  });
});
