import Decimal from 'decimal.js';

export interface OrderLineAmountInput {
  quantity: Decimal.Value;
  unitPrice: Decimal.Value;
}

export interface OrderTotalsResult {
  subtotal: Decimal;
  tax: Decimal;
  total: Decimal;
}

export const toDecimal = (value: Decimal.Value): Decimal => {
  try {
    if (value instanceof Decimal) {
      return value;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (!trimmed) {
        return new Decimal(0);
      }

      return new Decimal(trimmed);
    }

    return new Decimal(value);
  } catch {
    return new Decimal(NaN);
  }
};

export const calculateLineAmount = (line: OrderLineAmountInput): Decimal => {
  const quantity = toDecimal(line.quantity);
  const unitPrice = toDecimal(line.unitPrice);

  if (!quantity.isFinite() || !unitPrice.isFinite()) {
    return new Decimal(0);
  }

  const normalizedQuantity = Decimal.max(quantity, 0);
  const normalizedPrice = Decimal.max(unitPrice, 0);

  return normalizedQuantity.times(normalizedPrice);
};

export const calculateOrderTotals = (
  lines: OrderLineAmountInput[],
  taxRate: Decimal.Value = 0.1,
): OrderTotalsResult => {
  const subtotal = lines.reduce((sum, line) => sum.plus(calculateLineAmount(line)), new Decimal(0));

  const rate = toDecimal(taxRate);
  const normalizedRate = rate.isFinite() ? Decimal.max(rate, 0) : new Decimal(0);

  const tax = subtotal.times(normalizedRate);
  const total = subtotal.plus(tax);

  return { subtotal, tax, total };
};
