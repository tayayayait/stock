import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

vi.mock('@/src/services/policies', () => ({
  savePolicies: vi.fn(),
  fetchPolicies: vi.fn(),
  requestForecastRecommendation: vi.fn(),
}));

import { __test__ as deepflowTestUtils } from '@/src/app/pages/deepflow/DeepflowDashboard';
import { createEmptyProduct } from '@/src/domains/products';
import type { PolicyRow } from '@/src/app/pages/deepflow/DeepflowDashboard';
import type { Product } from '@/src/domains/products';
import { savePolicies, fetchPolicies } from '@/src/services/policies';

const { PoliciesPage } = deepflowTestUtils;

const buildProduct = (overrides: Partial<Product> = {}): Product => ({
  ...createEmptyProduct(),
  productId: 'product-1',
  legacyProductId: 1,
  sku: 'SKU-TEST',
  name: '테스트 상품',
  category: '식품',
  subCategory: '과자',
  dailyAvg: 120,
  dailyStd: 35,
  ...overrides,
});

type OverrideProps = Partial<React.ComponentProps<typeof PoliciesPage>>;

const renderPoliciesPage = (
  initialRows: PolicyRow[],
  overrides: OverrideProps = {},
) => {
  const rowsRef: { current: PolicyRow[] } = { current: initialRows };
  const defaultProduct = buildProduct();
  const {
    skus = [defaultProduct],
    allProducts = [defaultProduct],
    forecastCache = {},
    loading = false,
    ready = true,
    persistedManualSkus = [],
  } = overrides;

  const Wrapper: React.FC = () => {
    const [rows, setRows] = React.useState<PolicyRow[]>(initialRows);

    React.useEffect(() => {
      rowsRef.current = rows;
    }, [rows]);

    const handleSetRows = React.useCallback((value: React.SetStateAction<PolicyRow[]>) => {
      setRows((prev) => (typeof value === 'function' ? (value as (input: PolicyRow[]) => PolicyRow[])(prev) : value));
    }, []);

    return (
      <PoliciesPage
        skus={skus}
        allProducts={allProducts}
        policyRows={rows}
        setPolicyRows={handleSetRows}
        forecastCache={forecastCache as React.ComponentProps<typeof PoliciesPage>['forecastCache']}
        loading={loading}
        loadError={overrides.loadError ?? null}
        onReload={overrides.onReload}
        persistedManualSkus={persistedManualSkus}
        ready={ready}
        onPersistedSkusChange={overrides.onPersistedSkusChange}
      />
    );
  };

  const user = userEvent.setup();
  render(<Wrapper />);
  return { user, rowsRef };
};

const getSaveButton = (): HTMLButtonElement => {
  const buttons = screen.getAllByRole('button', { name: /정책 저장/ });
  const enabled = buttons.find((button) => !button.hasAttribute('disabled'));
  return (enabled ?? buttons[0]) as HTMLButtonElement;
};

describe('PoliciesPage save flow', () => {
  beforeEach(() => {
    vi.mocked(savePolicies).mockResolvedValue();
    vi.mocked(fetchPolicies).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('keeps the save button enabled during initial loading when rows exist', async () => {
    const row: PolicyRow = {
      sku: 'SKU-TEST',
      forecastDemand: 150,
      demandStdDev: 40,
      leadTimeDays: 16,
      serviceLevelPercent: 97,
    };

    const { user } = renderPoliciesPage([row], { loading: true, ready: false });

    const saveButton = getSaveButton();
    expect(saveButton).toBeEnabled();

    await user.click(saveButton);

    await waitFor(() => {
      expect(savePolicies).toHaveBeenCalledTimes(1);
      expect(fetchPolicies).toHaveBeenCalledTimes(1);
    });
  });

  it('preserves local rows when refreshed policies are empty after save', async () => {
    const row: PolicyRow = {
      sku: 'SKU-LOCAL',
      forecastDemand: 90,
      demandStdDev: 20,
      leadTimeDays: 12,
      serviceLevelPercent: 95,
    };

    const { user, rowsRef } = renderPoliciesPage([row]);

    const saveButton = getSaveButton();
    await user.click(saveButton);

    await waitFor(() => {
      expect(savePolicies).toHaveBeenCalledTimes(1);
      expect(fetchPolicies).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(rowsRef.current).toHaveLength(1);
      expect(rowsRef.current[0]?.sku).toBe('SKU-LOCAL');
    });
  });

  it('merges remote policies returned from the server after save', async () => {
    const localRow: PolicyRow = {
      sku: 'SKU-LOCAL',
      forecastDemand: 110,
      demandStdDev: 30,
      leadTimeDays: 15,
      serviceLevelPercent: 93,
    };

    const remoteRow: PolicyRow = {
      sku: 'SKU-REMOTE',
      forecastDemand: 210,
      demandStdDev: 55,
      leadTimeDays: 18,
      serviceLevelPercent: 97,
    };

    vi.mocked(fetchPolicies).mockResolvedValue([remoteRow]);

    const { user, rowsRef } = renderPoliciesPage([localRow]);

    const saveButton = getSaveButton();
    await user.click(saveButton);

  await waitFor(() => {
    expect(savePolicies).toHaveBeenCalledTimes(1);
    expect(fetchPolicies).toHaveBeenCalledTimes(1);
  });

  await waitFor(() => {
    expect(screen.getByText('정책을 저장했습니다.')).toBeInTheDocument();
  });
  });

  it('keeps local policies when refresh fails', async () => {
    const row: PolicyRow = {
      sku: 'SKU-LOCAL',
      forecastDemand: 95,
      demandStdDev: 25,
      leadTimeDays: 10,
      serviceLevelPercent: 95,
    };

    vi.mocked(fetchPolicies).mockRejectedValue(new Error('network error'));

    const { user, rowsRef } = renderPoliciesPage([row]);

    const saveButton = getSaveButton();
    await user.click(saveButton);

  await waitFor(() => {
    expect(savePolicies).toHaveBeenCalledTimes(1);
    expect(fetchPolicies).toHaveBeenCalledTimes(1);
  });

  await waitFor(() => {
    expect(rowsRef.current).toHaveLength(1);
    expect(rowsRef.current[0]?.sku).toBe('SKU-LOCAL');
  });
  });
});



