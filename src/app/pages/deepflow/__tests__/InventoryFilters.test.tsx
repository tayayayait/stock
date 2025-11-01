import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as React from 'react';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import DeepflowDashboard from '../DeepflowDashboard';
import type { Product } from '../../../../domains/products';
import * as ProductService from '../../../../services/products';
import * as ApiService from '../../../../services/api';

const sampleProducts: Product[] = [
  {
    productId: 'prod-1',
    legacyProductId: 1,
    sku: 'D1E2F3G',
    name: '그린팜 오트 드링크',
    category: '식물성음료',
    subCategory: '오트밀크',
    brand: '그린팜',
    unit: 'EA',
    packCase: '8/12',
    pack: 8,
    casePack: 12,
    abcGrade: 'A',
    xyzGrade: 'Y',
    bufferRatio: 0.22,
    dailyAvg: 94,
    dailyStd: 20,
    totalInbound: 11840,
    totalOutbound: 11200,
    avgOutbound7d: 98,
    isActive: true,
    onHand: 2960,
    reserved: 160,
    risk: '정상',
    expiryDays: 120,
    supplyPrice: null,
    salePrice: null,
    referencePrice: null,
    currency: 'KRW',
    inventory: [
      { warehouseCode: 'WH-SEOUL', locationCode: 'SEOUL-A1', onHand: 1240, reserved: 80 },
      { warehouseCode: 'WH-SEOUL', locationCode: 'SEOUL-D2', onHand: 640, reserved: 40 },
      { warehouseCode: 'WH-BUSAN', locationCode: 'BUSAN-B1', onHand: 520, reserved: 0 },
      { warehouseCode: 'WH-SEOUL', locationCode: 'SEOUL-B1', onHand: 560, reserved: 40 },
    ],
  },
  {
    productId: 'prod-2',
    legacyProductId: 2,
    sku: 'H4I5J6K',
    name: '에너핏 단백질 드링크',
    category: '건강음료',
    subCategory: '단백질 음료',
    brand: '에너핏',
    unit: 'EA',
    packCase: '6/18',
    pack: 6,
    casePack: 18,
    abcGrade: 'A',
    xyzGrade: 'Z',
    bufferRatio: 0.35,
    dailyAvg: 32,
    dailyStd: 9,
    totalInbound: 2680,
    totalOutbound: 2410,
    avgOutbound7d: 30,
    isActive: true,
    onHand: 460,
    reserved: 80,
    risk: '결품위험',
    expiryDays: 45,
    supplyPrice: null,
    salePrice: null,
    referencePrice: null,
    currency: 'KRW',
    inventory: [
      { warehouseCode: 'WH-SEOUL', locationCode: 'SEOUL-C1', onHand: 280, reserved: 60 },
      { warehouseCode: 'WH-DAEJEON', locationCode: 'DAEJEON-A1', onHand: 180, reserved: 20 },
    ],
  },
];

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('DeepflowDashboard inventory filters', () => {
  let fetchProductsMock: MockInstance<typeof ProductService.fetchProducts>;
  let fetchWarehousesMock: MockInstance<typeof ApiService.fetchWarehouses>;
  let fetchLocationsMock: MockInstance<typeof ApiService.fetchLocations>;
  let fetchForecastMock: MockInstance<typeof ApiService.fetchForecast>;

  beforeEach(() => {
    fetchProductsMock = vi.spyOn(ProductService, 'fetchProducts');
    fetchProductsMock.mockResolvedValue(sampleProducts);
    fetchWarehousesMock = vi.spyOn(ApiService, 'fetchWarehouses');
    fetchWarehousesMock.mockResolvedValue({
      items: [
        { id: 1, code: 'WH-SEOUL', name: '서울 물류센터' },
        { id: 2, code: 'WH-BUSAN', name: '부산 물류센터' },
      ],
      count: 2,
    });
    fetchLocationsMock = vi.spyOn(ApiService, 'fetchLocations');
    fetchLocationsMock.mockImplementation(async (warehouseCode: string) => {
      if (warehouseCode === 'WH-SEOUL') {
        return {
          items: [
            { id: '11', code: 'SEOUL-A1', description: '서울 A1', warehouseCode: 'WH-SEOUL' },
            { id: '12', code: 'SEOUL-C1', description: '서울 C1', warehouseCode: 'WH-SEOUL' },
          ],
        };
      }
      return {
        items: [{ id: '21', code: 'BUSAN-A1', description: '부산 A1', warehouseCode: warehouseCode }],
      };
    });
    fetchForecastMock = vi.spyOn(ApiService, 'fetchForecast');
    fetchForecastMock.mockImplementation(async (productId: number) => {
      const product = sampleProducts.find((entry) => entry.legacyProductId === productId);
      return {
        product: {
          id: productId,
          sku: product?.sku ?? `SKU-${productId}`,
          name: product?.name ?? `상품-${productId}`,
          safetyStock: 0,
          leadTimeDays: 0,
          configuredReorderPoint: 0,
          onHand: 0,
          reserved: 0,
          availableStock: 0,
        },
        metrics: {
          windowStart: '2024-01-01',
          windowEnd: '2024-01-31',
          outboundTotal: 0,
          outboundReasons: {},
          avgDailyDemand: 0,
          currentTotalStock: 0,
          reorderPoint: 0,
          recommendedOrderQty: 0,
          projectedStockoutDate: null,
        },
        sampleCalculation: { reorderPoint: '', recommendedOrderQty: '' },
        timeline: [],
        explanation: {
          summary: '',
          drivers: [],
          details: '',
          model: {
            name: '',
            seasonalPeriod: 12,
            trainingWindow: '',
            generatedAt: '2024-01-01T00:00:00Z',
            mape: null,
          },
        },
      };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('filters SKU list by selected warehouse and location', async () => {
    render(<DeepflowDashboard />);

    const warehouseSelect = (await screen.findByLabelText('창고 선택')) as HTMLSelectElement;

    await waitFor(() => expect(fetchWarehousesMock).toHaveBeenCalled());

    await waitFor(() => {
      const values = Array.from(warehouseSelect.options).map((option) => option.value);
      expect(values).toContain('1');
      expect(values).toContain('2');
    });

    fireEvent.change(warehouseSelect, { target: { value: '1' } });

    await waitFor(() => expect(fetchLocationsMock).toHaveBeenCalledWith('WH-SEOUL'));

    const locationSelect = (await screen.findByLabelText('로케이션 선택')) as HTMLSelectElement;

    await waitFor(() => {
      const values = Array.from(locationSelect.options).map((option) => option.value);
      expect(values).toContain('SEOUL-A1');
      expect(values).toContain('SEOUL-C1');
    });

    const inventoryTable = screen.getAllByRole('table')[0];
    const tableQueries = within(inventoryTable);

    await waitFor(() => {
      tableQueries.getByText('D1E2F3G');
      tableQueries.getByText('H4I5J6K');
      tableQueries.getByText('총입고량');
      tableQueries.getByText('총출고량');
      tableQueries.getByText('재고소진예상일(YYYY-MM-DD)');
      tableQueries.getByText('초과재고율');
    });

    fireEvent.change(locationSelect, { target: { value: 'SEOUL-A1' } });

    await waitFor(() => expect((locationSelect as HTMLSelectElement).value).toBe('SEOUL-A1'));

    await waitFor(() => {
      tableQueries.getByText('D1E2F3G');
      expect(tableQueries.queryByText('H4I5J6K')).toBeNull();
      tableQueries.getByText('총출고량');
    });

    fireEvent.change(warehouseSelect, { target: { value: '2' } });

    await waitFor(() => expect(fetchLocationsMock).toHaveBeenCalledWith('WH-BUSAN'));

    await waitFor(() => expect((locationSelect as HTMLSelectElement).value).toBe(''));

    await waitFor(() => {
      const values = Array.from(locationSelect.options).map((option) => option.value);
      expect(values).toContain('BUSAN-A1');
    });

    await waitFor(() => {
      tableQueries.getByText('D1E2F3G');
      expect(tableQueries.queryByText('H4I5J6K')).toBeNull();
      tableQueries.getByText('초과재고율');
    });
  });

  it('shows inventory detail empty state when no products are available', async () => {
    fetchProductsMock.mockResolvedValueOnce([]);

    render(<DeepflowDashboard />);

    await waitFor(() => expect(fetchProductsMock).toHaveBeenCalled());

    const emptyMessage = await screen.findByText('품목을 선택하면 상세 정보를 확인할 수 있습니다.');
    expect(emptyMessage).toBeTruthy();
  });
});
