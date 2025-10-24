import Decimal from 'decimal.js';

const DEFAULT_LOCALE = 'ko-KR';
const DEFAULT_CURRENCY = 'KRW';
const DEFAULT_NUMBER_OPTIONS = {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
} satisfies Intl.NumberFormatOptions;
// KRW 금액 표기는 전역적으로 소수 0자리(원 단위) 기준으로 맞춥니다.
const DEFAULT_CURRENCY_FRACTION_DIGITS = 0;
const DEFAULT_VAT_RATE = new Decimal(0.1);

interface FormatOptions {
  maximumFractionDigits?: number;
  minimumFractionDigits?: number;
}

interface CurrencyFormatOptions {
  currency?: string;
  fractionDigits?: number;
}

interface VatCalculationOptions {
  rate?: Decimal.Value;
  fractionDigits?: number;
}

export interface VatCalculationResult {
  net: Decimal;
  vat: Decimal;
  gross: Decimal;
}

const toDecimal = (value: Decimal.Value): Decimal => {
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

  try {
    return new Decimal(value ?? 0);
  } catch {
    return new Decimal(NaN);
  }
};

const ensureFinite = (value: Decimal): Decimal => {
  if (!value.isFinite()) {
    return new Decimal(0);
  }

  return value;
};

const normalizeFractionDigits = (value: number | undefined): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return DEFAULT_CURRENCY_FRACTION_DIGITS;
  }

  return Math.max(0, Math.floor(value));
};

const roundMonetary = (value: Decimal, fractionDigits: number): Decimal => {
  const digits = normalizeFractionDigits(fractionDigits);

  // 통화 값은 사사오입(ROUND_HALF_UP) 규칙으로 반올림하며, 내림/올림 대신 명시적 반올림만 사용합니다.
  return ensureFinite(value).toDecimalPlaces(digits, Decimal.ROUND_HALF_UP);
};

export const formatQty = (value: number, options: FormatOptions = {}): string => {
  if (value === null || Number.isNaN(value)) {
    return '-';
  }

  const { maximumFractionDigits, minimumFractionDigits } = options;

  return new Intl.NumberFormat(DEFAULT_LOCALE, {
    ...DEFAULT_NUMBER_OPTIONS,
    ...(typeof maximumFractionDigits === 'number' ? { maximumFractionDigits } : {}),
    ...(typeof minimumFractionDigits === 'number' ? { minimumFractionDigits } : {}),
  }).format(value);
};

interface FormatPercentOptions extends FormatOptions {
  multiplyBy100?: boolean;
}

export const formatPercent = (
  value: number,
  options: FormatPercentOptions = {},
): string => {
  if (value === null || Number.isNaN(value)) {
    return '-';
  }

  const { multiplyBy100 = true, maximumFractionDigits, minimumFractionDigits } = options;
  const percentValue = multiplyBy100 ? value * 100 : value;

  const formatted = new Intl.NumberFormat(DEFAULT_LOCALE, {
    ...DEFAULT_NUMBER_OPTIONS,
    ...(typeof maximumFractionDigits === 'number' ? { maximumFractionDigits } : {}),
    ...(typeof minimumFractionDigits === 'number' ? { minimumFractionDigits } : {}),
  }).format(percentValue);

  return `${formatted}%`;
};

export const formatDays = (value: number, options: FormatOptions = {}): string => {
  if (value === null || Number.isNaN(value)) {
    return '-';
  }

  const { maximumFractionDigits, minimumFractionDigits } = options;
  const formatted = new Intl.NumberFormat(DEFAULT_LOCALE, {
    ...DEFAULT_NUMBER_OPTIONS,
    ...(typeof maximumFractionDigits === 'number' ? { maximumFractionDigits } : {}),
    ...(typeof minimumFractionDigits === 'number' ? { minimumFractionDigits } : {}),
  }).format(value);

  return `${formatted}일`;
};

export const formatCurrency = (
  value: Decimal.Value,
  options: CurrencyFormatOptions = {},
): string => {
  const { currency = DEFAULT_CURRENCY, fractionDigits = DEFAULT_CURRENCY_FRACTION_DIGITS } = options;
  const digits = normalizeFractionDigits(fractionDigits);
  const rounded = roundMonetary(ensureFinite(toDecimal(value)), digits);

  return new Intl.NumberFormat(DEFAULT_LOCALE, {
    style: 'currency',
    currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(rounded.toNumber());
};

export const sumMonetary = (
  values: Decimal.Value[],
  fractionDigits: number = DEFAULT_CURRENCY_FRACTION_DIGITS,
): Decimal => {
  // 합산 역시 Decimal 기반으로 수행해 부가가치세 계산과 동일한 반올림 정책을 공유합니다.
  const total = values.reduce<Decimal>(
    (acc, current) => acc.plus(ensureFinite(toDecimal(current))),
    new Decimal(0),
  );

  return roundMonetary(total, fractionDigits);
};

export const calculateVat = (
  amount: Decimal.Value,
  options: VatCalculationOptions = {},
): VatCalculationResult => {
  // 부가세는 순금액(net)에 대해 Decimal 사사오입 반올림을 적용해 계산합니다.
  const { rate = DEFAULT_VAT_RATE, fractionDigits = DEFAULT_CURRENCY_FRACTION_DIGITS } = options;
  const digits = normalizeFractionDigits(fractionDigits);
  const net = roundMonetary(ensureFinite(toDecimal(amount)), digits);
  const vatRate = ensureFinite(toDecimal(rate));
  const vat = roundMonetary(net.times(vatRate), digits);
  const gross = roundMonetary(net.plus(vat), digits);

  return { net, vat, gross };
};
