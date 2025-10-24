import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import {
  formatQty,
  formatPercent,
  formatDays,
  formatCurrency,
  sumMonetary,
  calculateVat,
} from '@/src/utils/format';

describe('format utilities', () => {
  it('formats quantities with defaults and handles invalid numbers', () => {
    expect(formatQty(1234.56)).toBe('1,234.6');
    expect(formatQty(Number.NaN)).toBe('-');
  });

  it('formats percentages with optional multiplier', () => {
    expect(formatPercent(0.157)).toBe('15.7%');
    expect(formatPercent(42, { multiplyBy100: false, maximumFractionDigits: 0 })).toBe('42%');
  });

  it('formats day values with suffix', () => {
    expect(formatDays(7)).toBe('7일');
    expect(formatDays(Number.NaN)).toBe('-');
  });

  it('formats currency values using KRW defaults and custom fraction digits', () => {
    expect(formatCurrency('1000.49')).toBe('₩1,000');
    expect(formatCurrency(1234.5, { fractionDigits: 1 })).toBe('₩1,234.5');
  });

  it('sums monetary values with Decimal rounding', () => {
    const total = sumMonetary(['10.45', '5.55', 4]);
    expect(total.toNumber()).toBe(20);
  });

  it('calculates VAT with proper rounding rules', () => {
    const result = calculateVat(new Decimal('1234.56'), { rate: 0.1, fractionDigits: 0 });
    expect(result.net.toNumber()).toBe(1235);
    expect(result.vat.toNumber()).toBe(124);
    expect(result.gross.toNumber()).toBe(1359);
  });
});
