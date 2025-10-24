import { describe, expect, it } from 'vitest';

import { __test__ } from '../NewOrderForm';
import type { Partner } from '../../../../services/orders';
import type { OrderKind } from '../NewOrderForm';

const { buildPartnerOptions, resolveDefaultPartnerId } = __test__;

const createPartner = (overrides: Partial<Partner> & { id: string }): Partner => ({
  id: overrides.id,
  type: 'SUPPLIER',
  name: overrides.name ?? `Partner ${overrides.id}`,
  isActive: true,
  ...overrides,
});

const collectIds = (partners: Partner[]) => partners.map((partner) => partner.id);

describe('NewOrderForm partner helpers', () => {
  const partners: Partner[] = [
    createPartner({ id: 'supplier-1', type: 'SUPPLIER', name: 'Supplier 1' }),
    createPartner({ id: 'supplier-2', type: 'SUPPLIER', name: 'Supplier 2' }),
    createPartner({ id: 'customer-1', type: 'CUSTOMER', name: 'Customer 1' }),
    createPartner({ id: 'inactive-supplier', type: 'SUPPLIER', name: 'Inactive', isActive: false }),
  ];

  const assertPartnerOrder = (kind: OrderKind, expectedIds: string[]) => {
    const options = buildPartnerOptions(partners, kind);
    expect(collectIds(options)).toEqual(expectedIds);
    expect(resolveDefaultPartnerId(partners, kind)).toBe(expectedIds[0] ?? '');
  };

  it('returns active suppliers for purchase orders', () => {
    assertPartnerOrder('purchase', ['supplier-1', 'supplier-2']);
  });

  it('prefers customers for sales orders when available', () => {
    assertPartnerOrder('sales', ['customer-1']);
  });

  it('falls back to suppliers for sales orders when no customers exist', () => {
    const supplierOnly = partners.filter((partner) => partner.type === 'SUPPLIER');
    const options = buildPartnerOptions(supplierOnly, 'sales');
    expect(collectIds(options)).toEqual(['supplier-1', 'supplier-2']);
    expect(resolveDefaultPartnerId(supplierOnly, 'sales')).toBe('supplier-1');
  });

  it('returns an empty array when no active partners match', () => {
    const inactiveOnly = [createPartner({ id: 'inactive', isActive: false })];
    const options = buildPartnerOptions(inactiveOnly, 'purchase');
    expect(options).toEqual([]);
    expect(resolveDefaultPartnerId(inactiveOnly, 'purchase')).toBe('');
  });
});
