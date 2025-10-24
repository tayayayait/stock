import * as React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';

const listPartnersMock = vi.hoisted(() => vi.fn());
const createPartnerMock = vi.hoisted(() => vi.fn());
const updatePartnerMock = vi.hoisted(() => vi.fn());
const deletePartnerMock = vi.hoisted(() => vi.fn());

vi.mock('recharts', () => {
  const ChartContainer = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  const noop = () => null;
  return {
    ResponsiveContainer: ChartContainer,
    BarChart: ChartContainer,
    LineChart: ChartContainer,
    CartesianGrid: noop,
    Legend: noop,
    Line: noop,
    Bar: noop,
    ReferenceArea: noop,
    ReferenceDot: noop,
    ReferenceLine: noop,
    Tooltip: noop,
    XAxis: noop,
    YAxis: noop,
  };
});

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...rest }: { children?: React.ReactNode }) => <div {...rest}>{children}</div>,
  },
}));

vi.mock('../../../../components/ServiceCoveragePanel', () => ({
  default: () => <div data-testid="service-coverage-placeholder" />,
}));

vi.mock('../components/PolicyMetricsChart', () => ({
  default: () => <div data-testid="policy-metrics-placeholder" />,
}));

vi.mock('../components/WarehouseManagementPanel', () => ({
  default: () => <div data-testid="warehouse-panel-placeholder" />,
}));

vi.mock('../components/ProductCsvUploadDialog', () => ({
  default: () => null,
}));

const mockForecastResponse = {
  product: {
    id: 1,
    sku: 'SKU-001',
    name: '테스트 상품',
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
  sampleCalculation: {
    reorderPoint: '',
    recommendedOrderQty: '',
  },
  timeline: [],
  explanation: {
    summary: '',
    drivers: [],
    details: '',
    model: {
      name: '',
      seasonalPeriod: 0,
      trainingWindow: '',
      generatedAt: '',
      mape: null,
    },
  },
};

vi.mock('../../../../services/api', () => ({
  fetchForecast: vi.fn(async () => mockForecastResponse),
  fetchWarehouses: vi.fn(async () => ({ items: [] })),
  fetchLocations: vi.fn(async () => ({ items: [] })),
}));

vi.mock('../../../../services/products', () => ({
  fetchProducts: vi.fn(async () => [
    {
      productId: 'prod-1',
      legacyProductId: 1,
      sku: 'SKU-001',
      name: '테스트 상품',
      category: '식품',
      subCategory: '간식',
      brand: '브랜드',
      unit: 'EA',
      packCase: '1/10',
      pack: 1,
      casePack: 10,
      abcGrade: 'A',
      xyzGrade: 'X',
      bufferRatio: 0.2,
      dailyAvg: 10,
      dailyStd: 2,
      isActive: true,
      onHand: 100,
      reserved: 10,
      risk: '정상',
      expiryDays: 30,
    },
  ]),
  createProduct: vi.fn(),
  updateProduct: vi.fn(),
  deleteProduct: vi.fn(),
}));

vi.mock('../../../../services/csv', () => ({
  downloadTemplate: vi.fn(async () => new Blob()),
}));

vi.mock('../../../../services/policies', () => ({
  requestPolicyRecommendation: vi.fn(async () => ({
    params: {},
    recommendation: {},
  })),
  savePolicies: vi.fn(async () => undefined),
}));

vi.mock('../../../../services/orders', () => ({
  listPartners: listPartnersMock,
  createPartner: createPartnerMock,
  updatePartner: updatePartnerMock,
  deletePartner: deletePartnerMock,
}));

import DeepflowDashboard from '../DeepflowDashboard';

describe('DeepflowDashboard partner management', () => {
  beforeEach(() => {
    listPartnersMock.mockResolvedValue([
      {
        id: 'partner-s-001',
        type: 'SUPPLIER',
        name: '에이플러스 식자재',
        phone: '010-1234-5678',
        email: 'aplus@example.com',
        address: '서울시 강남구',
        notes: '',
        isActive: true,
        isSample: false,
      },
    ]);
    createPartnerMock.mockResolvedValue({
      id: 'partner-s-002',
      type: 'SUPPLIER',
      name: '비타상사',
      phone: '',
      email: '',
      address: '',
      notes: '',
      isActive: true,
      isSample: false,
    });
    updatePartnerMock.mockResolvedValue({
      id: 'partner-s-001',
      type: 'SUPPLIER',
      name: '에이플러스 식자재',
      phone: '010-1234-5678',
      email: 'aplus@example.com',
      address: '서울시 강남구',
      notes: '',
      isActive: true,
      isSample: false,
    });
    deletePartnerMock.mockResolvedValue({
      id: 'partner-s-001',
      type: 'SUPPLIER',
      name: '에이플러스 식자재',
      phone: '010-1234-5678',
      email: 'aplus@example.com',
      address: '서울시 강남구',
      notes: '',
      isActive: true,
      isSample: false,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows supplier list and opens create modal from partner tab', async () => {
    render(<DeepflowDashboard />);

    const partnersTab = (await screen.findAllByRole('button', { name: '거래처관리' }))[0];
    fireEvent.click(partnersTab);

    const supplierTable = await screen.findByRole('table', { name: '공급업체 목록' });
    expect(supplierTable).toBeDefined();
    expect(await screen.findByText('에이플러스 식자재')).toBeDefined();

    expect(await screen.findAllByRole('button', { name: '수정' })).not.toHaveLength(0);
    expect(await screen.findAllByRole('button', { name: '삭제' })).not.toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: '거래처 추가' }));

    expect(
      await screen.findByRole('heading', { level: 2, name: '새 거래처 추가' }),
    ).toBeDefined();
  });

  it('edits a supplier from the management panel', async () => {
    render(<DeepflowDashboard />);

    const partnersTab = (await screen.findAllByRole('button', { name: '거래처관리' }))[0];
    fireEvent.click(partnersTab);

    const editButtons = await screen.findAllByRole('button', { name: '수정' });
    expect(editButtons.length).toBeGreaterThan(0);

    fireEvent.click(editButtons[0]);

    expect(
      await screen.findByRole('heading', { level: 2, name: '거래처 정보 수정' }),
    ).toBeDefined();

    const nameInput = screen.getByLabelText('거래처명') as HTMLInputElement;
    expect(nameInput.value).toBe('에이플러스 식자재');
    fireEvent.change(nameInput, { target: { value: '에이플러스 식자재 (수정)' } });

    fireEvent.click(screen.getByRole('button', { name: '변경 내용 저장' }));

    await waitFor(() => expect(updatePartnerMock).toHaveBeenCalledTimes(1));
    expect(updatePartnerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'partner-s-001',
        name: '에이플러스 식자재 (수정)',
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('heading', { level: 2, name: '거래처 정보 수정' })).toBeNull(),
    );
  });

  it('deletes a supplier after confirmation', async () => {
    render(<DeepflowDashboard />);

    const partnersTab = (await screen.findAllByRole('button', { name: '거래처관리' }))[0];
    fireEvent.click(partnersTab);

    const deleteButtons = await screen.findAllByRole('button', { name: '삭제' });
    expect(deleteButtons.length).toBeGreaterThan(0);

    fireEvent.click(deleteButtons[0]);

    expect(
      await screen.findByRole('dialog', { name: /거래처 삭제/ }),
    ).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: '삭제 확인' }));

    await waitFor(() => expect(deletePartnerMock).toHaveBeenCalledTimes(1));
    expect(deletePartnerMock).toHaveBeenCalledWith('partner-s-001');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /거래처 삭제/ })).toBeNull());
  });
});
