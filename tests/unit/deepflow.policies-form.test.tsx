import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { __test__ as deepflowTestUtils } from '@/src/app/pages/deepflow/DeepflowDashboard';
import { createEmptyProduct } from '@/src/domains/products';
import type { PolicyRow } from '@/src/app/pages/deepflow/DeepflowDashboard';
import type { Product } from '@/src/domains/products';

const { PoliciesPage } = deepflowTestUtils;

describe('PoliciesPage policy table', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const buildProduct = (overrides: Partial<Product> = {}): Product => ({
    ...createEmptyProduct(),
    productId: 'product-1',
    legacyProductId: 1,
    sku: 'SKU-TEST',
    name: '비스킷 제품',
    category: '식품',
    subCategory: '과자',
    dailyAvg: 120,
    dailyStd: 35,
    ...overrides,
  });

  const renderPoliciesPage = (skus: Product[], initialRows: PolicyRow[] = []) => {
    const rowsRef: { current: PolicyRow[] } = { current: [] };

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
          policyRows={rows}
          setPolicyRows={handleSetRows}
          forecastCache={{}}
        />
      );
    };

    const user = userEvent.setup();
    render(<Wrapper />);
    return { user, rowsRef };
  };

  it('renders policy headers in the expected order', async () => {
    const product = buildProduct();
    const row: PolicyRow = {
      sku: product.sku,
      forecastDemand: 120,
      demandStdDev: 35,
      leadTimeDays: 14,
      serviceLevelPercent: 95,
    };

    renderPoliciesPage([product], [row]);

    const headers = await screen.findAllByRole('columnheader');
    const headerTexts = headers.map((header) => header.textContent?.trim() ?? '');

    expect(headerTexts).toHaveLength(7);
    expect(headerTexts.slice(0, 7)).toEqual([
      '품명',
      'SKU',
      '예측 수요량 (EA/일)',
      '수요 표준편차 (σ)',
      '리드타임 (L, 일)',
      '서비스 수준 (%)',
      '수정',
    ]);
  });

  it('applies edited values through the 수정 action', async () => {
    const product = buildProduct();
    const initialRow: PolicyRow = {
      sku: product.sku,
      forecastDemand: 120,
      demandStdDev: 35,
      leadTimeDays: 14,
      serviceLevelPercent: 95,
    };

    const { user, rowsRef } = renderPoliciesPage([product], [initialRow]);

    const editButton = await screen.findByRole('button', { name: '수정' });
    await user.click(editButton);

    const demandInput = await screen.findByLabelText('예측 수요량 (EA/일)');
    await user.clear(demandInput);
    await user.type(demandInput, '150');

    const stdInput = screen.getByLabelText('수요 표준편차 (σ)');
    await user.clear(stdInput);
    await user.type(stdInput, '45');

    const leadInput = screen.getByLabelText('리드타임 (L, 일)');
    await user.clear(leadInput);
    await user.type(leadInput, '18');

    const serviceLevelSelect = screen.getByRole('combobox', { name: '서비스 수준 (%)' });
    await user.selectOptions(serviceLevelSelect, '97.5');

    const saveButton = screen.getByRole('button', { name: '저장' });
    await user.click(saveButton);

    const rowElement = screen.getByText(product.name).closest('tr');
    expect(rowElement).not.toBeNull();
    if (!rowElement) {
      throw new Error('행을 찾을 수 없습니다.');
    }

    await waitFor(() => {
      expect(rowsRef.current).toHaveLength(1);
      const [row] = rowsRef.current;
      expect(row.forecastDemand).toBe(150);
      expect(row.demandStdDev).toBe(45);
      expect(row.leadTimeDays).toBe(18);
      expect(row.serviceLevelPercent).toBe(97.5);
    });

    expect(serviceLevelSelect).toHaveValue('97.5');
    expect(within(rowElement).getByText('150')).toBeInTheDocument();
    expect(within(rowElement).getByText('45')).toBeInTheDocument();
    expect(within(rowElement).getByText('18')).toBeInTheDocument();
  });
});
