import { formatQty } from '../../../../utils/format';

export type InventoryRiskLevel = 'critical' | 'high' | 'medium' | 'stable';

export interface RiskSku {
  id: string;
  sku: string;
  name: string;
  category: string;
  location: string;
  daysOfCover: number;
  shortageQty: number;
  riskLevel: InventoryRiskLevel;
  fillRate: number;
  trend: number[];
}

export interface MovementSummaryItem {
  date: string;
  inbound: number;
  outbound: number;
}

export interface ScheduleEvent {
  id: string;
  title: string;
  time: string;
  owner: string;
  type: 'cutoff' | 'review' | 'meeting' | 'shipment';
  path: string;
}

export interface ScheduleDay {
  id: string;
  dateLabel: string;
  weekday: string;
  isoDate: string;
  isToday: boolean;
  events: ScheduleEvent[];
}

export interface DemandForecastPoint {
  id: string;
  label: string;
  forecast: number;
  actual: number;
}

export interface HomeDashboardData {
  totalSkuCount: number;
  shortageSkuCount: number;
  shortageRate: number;
  movementTotals: {
    inbound: number;
    outbound: number;
    net: number;
  };
  movementHistory: MovementSummaryItem[];
  riskTop20: RiskSku[];
  weeklySchedule: ScheduleDay[];
  demandForecast: DemandForecastPoint[];
  updatedAt: string;
}

const createRiskRecords = (): RiskSku[] => {
  const seed: RiskSku[] = [
    {
      id: 'risk-1',
      sku: 'SKU-COFFEE-001',
      name: '콜드브루 베이스 1L',
      category: '음료/액상',
      location: 'ICN-A1-01',
      daysOfCover: 2.3,
      shortageQty: 320,
      riskLevel: 'critical',
      fillRate: 0.54,
      trend: [92, 88, 84, 72, 61, 49, 36],
    },
    {
      id: 'risk-2',
      sku: 'SKU-DAIRY-014',
      name: '무지방 우유 900ml',
      category: '냉장/유제품',
      location: 'ICN-C2-04',
      daysOfCover: 1.8,
      shortageQty: 210,
      riskLevel: 'critical',
      fillRate: 0.47,
      trend: [84, 81, 76, 65, 53, 41, 28],
    },
    {
      id: 'risk-3',
      sku: 'SKU-SNACK-321',
      name: '통밀 그래놀라 700g',
      category: '건식/시리얼',
      location: 'OSN-B1-11',
      daysOfCover: 3.1,
      shortageQty: 170,
      riskLevel: 'high',
      fillRate: 0.63,
      trend: [78, 74, 69, 63, 59, 54, 48],
    },
    {
      id: 'risk-4',
      sku: 'SKU-READY-205',
      name: '밀키트 크림파스타 2인분',
      category: '즉석/간편식',
      location: 'GMP-D4-03',
      daysOfCover: 2.6,
      shortageQty: 145,
      riskLevel: 'high',
      fillRate: 0.61,
      trend: [74, 73, 70, 68, 61, 55, 47],
    },
    {
      id: 'risk-5',
      sku: 'SKU-FRESH-909',
      name: '친환경 방울토마토 1kg',
      category: '신선/농산',
      location: 'ICN-E3-07',
      daysOfCover: 1.3,
      shortageQty: 260,
      riskLevel: 'critical',
      fillRate: 0.41,
      trend: [88, 85, 80, 69, 57, 43, 32],
    },
    {
      id: 'risk-6',
      sku: 'SKU-BAKERY-112',
      name: '천연발효 식빵 3입',
      category: '베이커리',
      location: 'ICN-B3-02',
      daysOfCover: 2.9,
      shortageQty: 120,
      riskLevel: 'high',
      fillRate: 0.66,
      trend: [72, 71, 69, 62, 58, 52, 46],
    },
    {
      id: 'risk-7',
      sku: 'SKU-BEV-451',
      name: '스파클링 워터 라임 355ml',
      category: '음료/탄산',
      location: 'PUS-A4-12',
      daysOfCover: 4.2,
      shortageQty: 90,
      riskLevel: 'medium',
      fillRate: 0.72,
      trend: [69, 68, 66, 64, 60, 57, 55],
    },
    {
      id: 'risk-8',
      sku: 'SKU-HMR-082',
      name: '냉동 한입 만두 1kg',
      category: '냉동/간편식',
      location: 'ICN-F1-09',
      daysOfCover: 3.6,
      shortageQty: 110,
      riskLevel: 'medium',
      fillRate: 0.75,
      trend: [71, 70, 69, 66, 64, 61, 59],
    },
    {
      id: 'risk-9',
      sku: 'SKU-HEALTH-301',
      name: '비타민C 츄어블 120정',
      category: '헬스/보충제',
      location: 'GMP-A2-05',
      daysOfCover: 5.1,
      shortageQty: 80,
      riskLevel: 'medium',
      fillRate: 0.78,
      trend: [66, 65, 64, 62, 61, 58, 56],
    },
    {
      id: 'risk-10',
      sku: 'SKU-SAUCE-214',
      name: '저염 간장 500ml',
      category: '소스/조미료',
      location: 'ICN-G3-03',
      daysOfCover: 4.5,
      shortageQty: 72,
      riskLevel: 'medium',
      fillRate: 0.79,
      trend: [64, 63, 63, 61, 60, 58, 57],
    },
  ];

  const expansion = seed.map((item, index) => {
    const id = index + 11;
    return {
      ...item,
      id: `risk-${id}`,
      sku: `${item.sku}-B`,
      name: `${item.name} (주문형)`,
      location: item.location.replace(/[0-9]+$/, (value) => `${Number(value) + 1}`),
      daysOfCover: Number((item.daysOfCover + 0.6).toFixed(1)),
      shortageQty: Math.max(45, Math.round(item.shortageQty * 0.68)),
      riskLevel: index < 3 ? 'high' : index < 6 ? 'medium' : 'stable',
      fillRate: Math.max(0.58, Number((item.fillRate + 0.07).toFixed(2))),
      trend: item.trend.map((value, idx) => Math.max(38, value - idx * 2)),
    } satisfies RiskSku;
  });

  const buffer: RiskSku[] = [
    {
      id: 'risk-18',
      sku: 'SKU-FRESH-801',
      name: '유기농 샐러드 믹스 300g',
      category: '신선/채소',
      location: 'ICN-E2-02',
      daysOfCover: 1.9,
      shortageQty: 188,
      riskLevel: 'critical',
      fillRate: 0.52,
      trend: [86, 83, 78, 66, 55, 44, 31],
    },
    {
      id: 'risk-19',
      sku: 'SKU-GRAIN-612',
      name: '프리미엄 현미 10kg',
      category: '건식/곡물',
      location: 'OSN-D2-08',
      daysOfCover: 3.4,
      shortageQty: 134,
      riskLevel: 'high',
      fillRate: 0.69,
      trend: [75, 74, 72, 68, 63, 57, 51],
    },
    {
      id: 'risk-20',
      sku: 'SKU-SEAFOOD-432',
      name: '냉장 연어 필렛 1.2kg',
      category: '신선/수산',
      location: 'PUS-F3-01',
      daysOfCover: 2.1,
      shortageQty: 205,
      riskLevel: 'critical',
      fillRate: 0.46,
      trend: [89, 87, 81, 70, 59, 46, 33],
    },
  ];

  return [...seed, ...expansion.slice(0, 7), ...buffer];
};

const createMovementHistory = (): MovementSummaryItem[] => {
  const today = new Date();
  return Array.from({ length: 7 }).map((_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    const inbound = 1800 + Math.round(Math.sin(index) * 240 + index * 32);
    const outbound = 1600 + Math.round(Math.cos(index / 1.3) * 210 + index * 24);

    return {
      date: date.toISOString(),
      inbound,
      outbound,
    } satisfies MovementSummaryItem;
  });
};

const startOfWeek = (input: Date): Date => {
  const base = new Date(input);
  const day = base.getDay();
  const diff = (day + 6) % 7;
  base.setHours(0, 0, 0, 0);
  base.setDate(base.getDate() - diff);
  return base;
};

const createWeeklySchedule = (): ScheduleDay[] => {
  const today = new Date();
  const monday = startOfWeek(today);
  const formatter = new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' });
  const weekdayFormatter = new Intl.DateTimeFormat('ko-KR', { weekday: 'short' });

  const template: Array<{ offset: number; events: ScheduleEvent[] }> = [
    {
      offset: 0,
      events: [
        {
          id: 'evt-forecast-alignment',
          title: '수요예측 리뷰',
          time: '09:30',
          owner: '수요기획팀',
          type: 'review',
          path: '/planning/calendar?event=forecast-review',
        },
        {
          id: 'evt-vendor-sync',
          title: '주요 공급사 협의',
          time: '15:00',
          owner: '조달팀',
          type: 'meeting',
          path: '/procurement/vendors/meetings?vendor=major',
        },
      ],
    },
    {
      offset: 1,
      events: [
        {
          id: 'evt-replenishment-cutoff',
          title: '보충 발주 마감',
          time: '13:00',
          owner: '재고계획팀',
          type: 'cutoff',
          path: '/planning/replenishment?view=cutoff',
        },
      ],
    },
    {
      offset: 2,
      events: [
        {
          id: 'evt-cold-chain',
          title: '냉장 물류 출고',
          time: '07:30',
          owner: '물류센터',
          type: 'shipment',
          path: '/operations/shipments?type=cold-chain',
        },
        {
          id: 'evt-regional-meeting',
          title: '지역 매장 수요 점검',
          time: '16:00',
          owner: '영업지원팀',
          type: 'meeting',
          path: '/sales/regions/meetings?region=south',
        },
      ],
    },
    {
      offset: 3,
      events: [
        {
          id: 'evt-inventory-audit',
          title: '월간 재고 실사',
          time: '10:00',
          owner: '품질관리팀',
          type: 'review',
          path: '/inventory/audit?scope=monthly',
        },
      ],
    },
    {
      offset: 4,
      events: [
        {
          id: 'evt-frozen-shipment',
          title: '냉동 HMR 출고',
          time: '06:30',
          owner: '물류센터',
          type: 'shipment',
          path: '/operations/shipments?type=frozen',
        },
        {
          id: 'evt-weekly-report',
          title: '주간 성과 공유',
          time: '17:00',
          owner: '경영기획팀',
          type: 'meeting',
          path: '/reports/weekly?section=inventory',
        },
      ],
    },
    {
      offset: 5,
      events: [
        {
          id: 'evt-demand-refresh',
          title: '수요 모델 재학습',
          time: '11:00',
          owner: '데이터팀',
          type: 'review',
          path: '/planning/demand?view=modeling',
        },
      ],
    },
    {
      offset: 6,
      events: [],
    },
  ];

  return template.map(({ offset, events }) => {
    const current = new Date(monday);
    current.setDate(monday.getDate() + offset);
    const isoDate = current.toISOString();
    const isToday = new Date(today.toDateString()).getTime() === new Date(current.toDateString()).getTime();

    return {
      id: `day-${offset}`,
      dateLabel: formatter.format(current),
      weekday: weekdayFormatter.format(current),
      isoDate,
      isToday,
      events,
    } satisfies ScheduleDay;
  });
};

const createDemandForecast = (): DemandForecastPoint[] => {
  const labels = ['월', '화', '수', '목', '금', '토', '일'];
  return labels.map((label, index) => {
    const base = 3200 + index * 120;
    const actual = base + Math.round(Math.sin(index / 1.4) * 180 - 90);
    const forecast = base + Math.round(Math.cos(index / 1.8) * 140);

    return {
      id: `forecast-${index}`,
      label,
      forecast,
      actual,
    } satisfies DemandForecastPoint;
  });
};

export async function fetchHomeDashboardData(): Promise<HomeDashboardData> {
  const riskTop20 = createRiskRecords();
  const movementHistory = createMovementHistory();
  const weeklySchedule = createWeeklySchedule();
  const demandForecast = createDemandForecast();

  const totalSkuCount = 428;
  const shortageSkuCount = riskTop20.filter((item) => item.riskLevel === 'critical' || item.riskLevel === 'high').length;
  const shortageRate = shortageSkuCount / totalSkuCount;

  const movementTotals = movementHistory.reduce(
    (acc, current) => {
      acc.inbound += current.inbound;
      acc.outbound += current.outbound;
      return acc;
    },
    { inbound: 0, outbound: 0, net: 0 },
  );
  movementTotals.net = movementTotals.inbound - movementTotals.outbound;

  return new Promise((resolve) => {
    const callback = () =>
      resolve({
        totalSkuCount,
        shortageSkuCount,
        shortageRate,
        movementTotals,
        movementHistory,
        riskTop20,
        weeklySchedule,
        demandForecast,
        updatedAt: new Date().toISOString(),
      });

    if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(callback);
      return;
    }

    setTimeout(callback, 0);
  });
}

export const formatMovementRange = (value: number): string => `${formatQty(value, { maximumFractionDigits: 0 })} EA`;

