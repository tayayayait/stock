export interface DemandHistoryPoint {
  date: string; // ISO yyyy-mm-01
  quantity: number;
  promo?: boolean;
}

export interface UpcomingPromotion {
  month: string; // ISO yyyy-mm-01 for the first day of month
  note: string;
}

export interface ForecastProduct {
  id: number;
  sku: string;
  name: string;
  category: string;
  safetyStock: number;
  leadTimeDays: number;
  configuredReorderPoint: number;
  onHand: number;
  reserved: number;
  avgDaily: number;
  history: DemandHistoryPoint[];
  futurePromotions?: UpcomingPromotion[];
}

const buildMonths = (values: Array<{ month: string; quantity: number; promo?: boolean }>): DemandHistoryPoint[] =>
  values.map((entry) => ({
    date: `${entry.month}-01`,
    quantity: entry.quantity,
    promo: entry.promo ?? false,
  }));

export const forecastProducts: ForecastProduct[] = [
  {
    id: 101,
    sku: 'D1E2F3G',
    name: '그린팜 오트 드링크',
    category: '식물성음료/오트밀크',
    safetyStock: 960,
    leadTimeDays: 9,
    configuredReorderPoint: 2100,
    onHand: 2960,
    reserved: 160,
    avgDaily: 94,
    history: buildMonths([
      { month: '2023-01', quantity: 1920 },
      { month: '2023-02', quantity: 1880 },
      { month: '2023-03', quantity: 1960 },
      { month: '2023-04', quantity: 2050 },
      { month: '2023-05', quantity: 2140 },
      { month: '2023-06', quantity: 2250 },
      { month: '2023-07', quantity: 2340 },
      { month: '2023-08', quantity: 2580, promo: true },
      { month: '2023-09', quantity: 2420 },
      { month: '2023-10', quantity: 2360 },
      { month: '2023-11', quantity: 2480 },
      { month: '2023-12', quantity: 2660, promo: true },
      { month: '2024-01', quantity: 2540 },
      { month: '2024-02', quantity: 2460 },
      { month: '2024-03', quantity: 2580 },
      { month: '2024-04', quantity: 2680 },
      { month: '2024-05', quantity: 2790 },
      { month: '2024-06', quantity: 2860 },
    ]),
    futurePromotions: [
      { month: '2024-08-01', note: '신제품 냉장 매대 집입' },
      { month: '2024-11-01', note: '비건 주간 기획전' },
    ],
  },
  {
    id: 102,
    sku: 'H4I5J6K',
    name: '에너핏 단백질 드링크',
    category: '건강음료/단백질',
    safetyStock: 480,
    leadTimeDays: 16,
    configuredReorderPoint: 920,
    onHand: 460,
    reserved: 80,
    avgDaily: 32,
    history: buildMonths([
      { month: '2023-01', quantity: 620 },
      { month: '2023-02', quantity: 640 },
      { month: '2023-03', quantity: 660 },
      { month: '2023-04', quantity: 690 },
      { month: '2023-05', quantity: 720 },
      { month: '2023-06', quantity: 768 },
      { month: '2023-07', quantity: 812 },
      { month: '2023-08', quantity: 904, promo: true },
      { month: '2023-09', quantity: 840 },
      { month: '2023-10', quantity: 802 },
      { month: '2023-11', quantity: 836 },
      { month: '2023-12', quantity: 912, promo: true },
      { month: '2024-01', quantity: 876 },
      { month: '2024-02', quantity: 842 },
      { month: '2024-03', quantity: 888 },
      { month: '2024-04', quantity: 924 },
      { month: '2024-05', quantity: 968 },
      { month: '2024-06', quantity: 1012, promo: true },
    ]),
    futurePromotions: [
      { month: '2024-09-01', note: '헬스 페어 한정 패키지' },
    ],
  },
];

export function findForecastProduct(productId: number): ForecastProduct | undefined {
  return forecastProducts.find((product) => product.id === productId);
}

export function findForecastProductBySku(sku: string): ForecastProduct | undefined {
  return forecastProducts.find((product) => product.sku === sku);
}
