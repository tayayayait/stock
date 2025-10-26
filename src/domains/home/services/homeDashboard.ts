import { formatQty } from '../../../../utils/format';
import {
  fetchInventoryDashboard,
  type InventoryDashboardMovementPoint,
  type InventoryDashboardResponse,
  type InventoryDashboardShortage,
} from '../../../services/inventoryDashboard';

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

type RiskLabel = '정상' | '결품위험' | '과잉';

const PLACEHOLDER_TEXT = '\u2014';

const clamp = (value: number, min = 0, max = Number.POSITIVE_INFINITY) => Math.min(max, Math.max(min, value));

const toFinite = (value: unknown, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const coalesceLocation = (value?: string | null): string => {
  if (typeof value !== 'string') {
    return PLACEHOLDER_TEXT;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : PLACEHOLDER_TEXT;
};

const ensureTrend = (input: number[] | undefined, available: number): number[] => {
  if (Array.isArray(input) && input.length > 0) {
    return input.map((value) => toFinite(value));
  }
  const baseline = Math.max(0, Math.round(toFinite(available)));
  return [baseline, baseline];
};

const toRiskLevel = (
  entry: InventoryDashboardShortage,
  shortageQty: number,
  safetyStock: number,
): InventoryRiskLevel => {
  if (entry.risk === '결품위험') {
    const ratio = safetyStock > 0 ? shortageQty / safetyStock : shortageQty > 0 ? 1 : 0;
    return ratio >= 0.5 ? 'critical' : 'high';
  }
  if (entry.risk === '과잉') {
    return 'medium';
  }
  return 'stable';
};

const mapShortagesToRiskSku = (shortages: InventoryDashboardShortage[]): RiskSku[] =>
  shortages
    .filter((entry) => entry && typeof entry.sku === 'string' && entry.sku.trim())
    .map((entry, index) => {
      const shortageQty = toFinite(entry.shortageQty);
      const available = toFinite(entry.available);
      const safetyStock = toFinite(entry.safetyStock);
      const daysOfCover = Number.isFinite(entry.daysOfCover) ? toFinite(entry.daysOfCover) : safetyStock > 0 ? available / safetyStock : 0;
      const fillRate = Number.isFinite(entry.fillRate) ? clamp(toFinite(entry.fillRate), 0, 1) : safetyStock > 0 ? clamp(available / safetyStock, 0, 1) : available > 0 ? 1 : 0;

      return {
        id: `${entry.sku}-${index}`,
        sku: entry.sku,
        name: entry.name ?? entry.sku,
        category: entry.category ?? PLACEHOLDER_TEXT,
        location: coalesceLocation(entry.primaryLocation),
        daysOfCover,
        shortageQty,
        riskLevel: toRiskLevel(entry, shortageQty, safetyStock),
        fillRate,
        trend: ensureTrend(entry.trend, available),
      };
    });

const normalizeMovementHistory = (history: InventoryDashboardMovementPoint[] = []): MovementSummaryItem[] =>
  history
    .filter((entry) => typeof entry?.date === 'string')
    .map((entry) => ({
      date: entry.date,
      inbound: toFinite(entry.inbound),
      outbound: toFinite(entry.outbound),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

const calculateMovementTotals = (history: MovementSummaryItem[]): HomeDashboardData['movementTotals'] => {
  const totals = history.reduce(
    (acc, current) => {
      acc.inbound += current.inbound;
      acc.outbound += current.outbound;
      return acc;
    },
    { inbound: 0, outbound: 0 },
  );
  return {
    inbound: totals.inbound,
    outbound: totals.outbound,
    net: totals.inbound - totals.outbound,
  };
};

const normalizeShortageRate = (value: number | undefined): number => clamp(toFinite(value) / 100, 0, 1);

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
          title: '주요 공급사 미팅',
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
          title: '지역매장 수요 회의',
          time: '16:00',
          owner: '영업지원실',
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
          title: '주간 재고 감사',
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
          title: '주간 실적 공유',
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
          owner: '데이터랩',
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
    };
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
    };
  });
};

export async function fetchHomeDashboardData(): Promise<HomeDashboardData> {
  const weeklySchedule = createWeeklySchedule();
  const demandForecast = createDemandForecast();
  const inventory: InventoryDashboardResponse = await fetchInventoryDashboard();

  const movementHistory = normalizeMovementHistory(inventory.movementHistory ?? []);
  const movementTotals = calculateMovementTotals(movementHistory);
  const riskTop20 = mapShortagesToRiskSku(inventory.insights?.shortages ?? []).slice(0, 20);

  return {
    totalSkuCount: toFinite(inventory.summary?.skuCount),
    shortageSkuCount: toFinite(inventory.summary?.shortageSkuCount),
    shortageRate: normalizeShortageRate(inventory.summary?.shortageRate),
    movementTotals,
    movementHistory,
    riskTop20,
    weeklySchedule,
    demandForecast,
    updatedAt: inventory.generatedAt ?? new Date().toISOString(),
  };
}

export const formatMovementRange = (value: number): string =>
  `${formatQty(value, { maximumFractionDigits: 0 })} EA`;

