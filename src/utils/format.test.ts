import Decimal from 'decimal.js';
import { describe, expect, it } from 'vitest';

import { calculateVat, formatCurrency, sumMonetary } from './format';

describe('format utilities', () => {
  it('formats KRW currency with half-up rounding', () => {
    expect(formatCurrency('1234.56')).toBe('₩1,235');
    expect(formatCurrency('1234.49')).toBe('₩1,234');
  });

  it('sums monetary values using decimal arithmetic without precision loss', () => {
    const total = sumMonetary(['0.1', '0.2'], 2);

    expect(total.equals(new Decimal('0.30'))).toBe(true);
  });

  it('calculates VAT using decimal rounding rules', () => {
    const { net, vat, gross } = calculateVat('1000', { rate: '0.1', fractionDigits: 0 });

    expect(net.equals(new Decimal('1000'))).toBe(true);
    expect(vat.equals(new Decimal('100'))).toBe(true);
    expect(gross.equals(new Decimal('1100'))).toBe(true);
  });
});
