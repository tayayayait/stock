const LEVEL_LABEL = {
  info: 'INFO',
  warn: 'WARN',
  error: 'ERROR',
} as const;

export type LogLevel = keyof typeof LEVEL_LABEL;

export type OrderEventPayload = {
  orderId: number | string;
  orderNumber?: string;
  customerId?: number | string;
  totalAmount?: number | string;
  currency?: string;
  [key: string]: unknown;
};

export type PackageStatusEventPayload = {
  packageId: string;
  orderId?: number;
  trackingNumber?: string;
  fromStatus?: string;
  toStatus: string;
  [key: string]: unknown;
};

type BadgeTheme = {
  label: string;
  background: string;
};

const formatTimestamp = () => new Date().toISOString();

const resolveIsDevelopment = (): boolean => {
  const metaEnv = (import.meta as { env?: Record<string, unknown> }).env ?? {};

  if (typeof metaEnv.DEV === 'boolean') {
    return metaEnv.DEV;
  }

  if (typeof metaEnv.MODE === 'string') {
    return metaEnv.MODE.toLowerCase() === 'development';
  }

  const nodeEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.NODE_ENV;
  if (typeof nodeEnv === 'string') {
    return nodeEnv !== 'production';
  }

  return true;
};

const log = (level: LogLevel, message: string, ...args: unknown[]) => {
  const label = LEVEL_LABEL[level];
  const payload = args.length > 0 ? args : undefined;
  const entry = `[${formatTimestamp()}][${label}] ${message}`;

  switch (level) {
    case 'info':
      payload ? console.info(entry, ...args) : console.info(entry);
      break;
    case 'warn':
      payload ? console.warn(entry, ...args) : console.warn(entry);
      break;
    case 'error':
    default:
      payload ? console.error(entry, ...args) : console.error(entry);
      break;
  }
};

const BADGE_THEME: Record<'orderCreated' | 'orderDeleted' | 'packageStatusChanged', BadgeTheme> = {
  orderCreated: { label: '주문 생성', background: '#2563eb' },
  orderDeleted: { label: '주문 삭제', background: '#dc2626' },
  packageStatusChanged: { label: '패키지 상태 변경', background: '#16a34a' },
};

const formatBadgeMessage = (theme: BadgeTheme) => {
  const { label, background } = theme;
  const badge = `%c${label}`;
  const style = `background:${background};color:#fff;padding:2px 8px;border-radius:999px;font-weight:600;`; // Tailwind-inspired badge
  return { badge, style };
};

const logEventInDevelopment = (
  theme: BadgeTheme,
  details: string,
  payload: Record<string, unknown>,
) => {
  const { badge, style } = formatBadgeMessage(theme);
  const message = `${formatTimestamp()} ${details}`;
  console.log(`${badge}%c ${message}`, style, 'color:inherit;', payload);
};

const isDevelopmentEnvironment = resolveIsDevelopment();

const eventLogger = isDevelopmentEnvironment
  ? {
      orderCreated: (payload: OrderEventPayload) =>
        logEventInDevelopment(BADGE_THEME.orderCreated, '새 주문이 생성되었습니다.', payload),
      orderDeleted: (payload: OrderEventPayload) =>
        logEventInDevelopment(BADGE_THEME.orderDeleted, '주문이 삭제되었습니다.', payload),
      packageStatusChanged: (payload: PackageStatusEventPayload) =>
        logEventInDevelopment(
          BADGE_THEME.packageStatusChanged,
          `패키지 상태가 '${payload.fromStatus ?? '미확인'}' → '${payload.toStatus}'로 변경되었습니다.`,
          payload,
        ),
    }
  : {
      orderCreated: (payload: OrderEventPayload) => {
        void payload;
        // Production 이벤트 로깅은 비활성화되어 있습니다. 필요 시 Sentry breadcrumb 연동을 고려하세요.
      },
      orderDeleted: (payload: OrderEventPayload) => {
        void payload;
        // Production 이벤트 로깅은 비활성화되어 있습니다. 필요 시 Sentry breadcrumb 연동을 고려하세요.
      },
      packageStatusChanged: (payload: PackageStatusEventPayload) => {
        void payload;
        // Production 이벤트 로깅은 비활성화되어 있습니다. 필요 시 Sentry breadcrumb 연동을 고려하세요.
      },
    };

export const logger = {
  info: (message: string, ...args: unknown[]) => log('info', message, ...args),
  warn: (message: string, ...args: unknown[]) => log('warn', message, ...args),
  error: (message: string, ...args: unknown[]) => log('error', message, ...args),
  event: eventLogger,
};

export type EventLogger = typeof eventLogger;
