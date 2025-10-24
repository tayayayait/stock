import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { calculateLineAmount, calculateOrderTotals, toDecimal } from './orderTotals';

describe('order total helpers', () => {
  it('calculates a single line amount with decimal precision', () => {
    const amount = calculateLineAmount({ quantity: '2.75', unitPrice: '19.99' });

    expect(amount.equals(new Decimal('54.9725'))).toBe(true);
  });

  it('normalizes negative values to zero in line calculation', () => {
    const amount = calculateLineAmount({ quantity: '-3', unitPrice: '5' });

    expect(amount.equals(new Decimal(0))).toBe(true);
  });

  it('aggregates subtotal, tax, and total using decimal arithmetic', () => {
    const totals = calculateOrderTotals(
      [
        { quantity: '1.5', unitPrice: '12.40' },
        { quantity: '0.25', unitPrice: '199.99' },
        { quantity: '3', unitPrice: '5.55' },
      ],
      '0.1',
    );

    expect(totals.subtotal.toFixed(4)).toBe('85.2475');
    expect(totals.tax.toFixed(4)).toBe('8.5248');
    expect(totals.total.toFixed(4)).toBe('93.7723');
  });

  it('treats invalid numeric inputs as zero', () => {
    const totals = calculateOrderTotals(
      [
        { quantity: 'abc', unitPrice: '100' },
        { quantity: '1', unitPrice: 'xyz' },
      ],
      '0.2',
    );

    expect(totals.subtotal.equals(new Decimal(0))).toBe(true);
    expect(totals.tax.equals(new Decimal(0))).toBe(true);
    expect(totals.total.equals(new Decimal(0))).toBe(true);
  });

  it('exposes helper to normalize decimal inputs', () => {
    expect(toDecimal('').equals(new Decimal(0))).toBe(true);
    expect(toDecimal('  2.5 ').equals(new Decimal('2.5'))).toBe(true);
    expect(toDecimal(new Decimal(3)).equals(new Decimal(3))).toBe(true);
  });
});
