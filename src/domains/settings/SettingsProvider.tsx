import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { ProductClassification, SupplyRiskIndicator, WarehouseLocationDetail } from '../../../types';
import { getEnvVar } from '../../../utils/env';
import { DEFAULT_HISTORY_REPORT_COLUMNS } from '../../../utils/reportHelpers';
import type {
  HistoryReportAction,
  HistoryReportColumnKey,
  HistoryReportFormat,
} from '../../../utils/reportHelpers';

export interface ProductTemplateDefaults {
  classification?: ProductClassification;
  unitOfMeasure?: string;
  warehouseLocation?: string;
  storageHierarchy?: WarehouseLocationDetail;
  supplier?: string;
  supplierCode?: string;
  costPerUnit?: number;
  leadTimeDays?: number;
  contractLeadTimeDays?: number;
  minimumOrderQuantity?: number;
  isMultiSourced?: boolean;
  riskIndicator?: SupplyRiskIndicator;
  averageDailyDemand?: number;
  inboundUnits?: number;
  openWorkOrders?: number;
  supplierRiskScore?: number;            // 0..1
  supplierDeliverySlaDays?: number;
  supplierSlaBreachRate?: number;        // 0..1
  supplierPriceVolatility?: number;      // 0..1
  hasAlternateSupplier?: boolean;
  procurementOwner?: string;
  reorderPoint?: number;
  currentStock?: number;
  safetyStock?: number;
  notes?: string;
}

export interface ProductTemplate {
  id: string;
  name: string;
  description?: string;
  defaults: ProductTemplateDefaults;
}

export interface HistoryReportPreferences {
  defaultFormat: HistoryReportFormat;
  defaultAction: HistoryReportAction;
  filenamePattern: string;
  enabledColumns: HistoryReportColumnKey[];
  title?: string;
}

export interface ReportPreferencesState {
  history: HistoryReportPreferences;
}

export interface SettingsState {
  // Core
  useServer: boolean;
  lowStockWarningThreshold: number;
  criticalStockWarningThreshold: number;

  // Notifications
  slackNotificationsEnabled: boolean;
  slackWebhookUrl: string;
  webhookNotificationsEnabled: boolean;
  webhookUrl: string;

  // Inventory policy
  safetyStockMultiplier: number;
  minimumDaysOfCover: number;
  autoRefreshCadenceMinutes: number;

  // Product templates (codex branch)
  productTemplates: ProductTemplate[];
  defaultProductTemplateId: string;

  // Procurement (main branch)
  procurementServiceLevelOptions: number[]; // e.g., [90,95,99]
  procurementDefaultServiceLevel: number;   // must be a member of options
  procurementLeadTimeAdjustment: number;    // days, can be negative
  procurementSafetyDaysAdjustment: number;  // days, can be negative
  procurementDefaultCategory: string;
  procurementDefaultSupplier: string;

  // Reports / exports
  reportPreferences: ReportPreferencesState;
}

interface SettingsContextValue extends SettingsState {
  updateSettings: (changes: Partial<SettingsState>) => void;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

const getDefaultUseServer = (): boolean => {
  const flag = getEnvVar('VITE_USE_SERVER');
  return typeof flag === 'string' && flag.toLowerCase() === 'true';
};

export const SETTINGS_STORAGE_KEY = 'stockwise.settings';

/** ---------- Product Template Defaults ---------- */

const PRODUCT_CLASSIFICATIONS: readonly ProductClassification[] = [
  'RAW_MATERIAL',
  'WIP',
  'FINISHED_GOOD',
];

const SUPPLY_RISK_LEVELS: readonly SupplyRiskIndicator[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

const createDefaultProductTemplates = (): ProductTemplate[] => [
  {
    id: 'raw-material-standard',
    name: '원자재 표준',
    description: '공용 원자재 규격과 기본 공급사, 리드타임을 미리 채워둡니다.',
    defaults: {
      classification: 'RAW_MATERIAL',
      unitOfMeasure: 'kg',
      supplier: '기본 자재 공급사',
      warehouseLocation: '자재창고-입고존',
      storageHierarchy: {
        site: '본사',
        warehouse: '자재창고',
        zone: '입고',
        aisle: 'A1',
        rack: 'R1',
      },
      leadTimeDays: 14,
      minimumOrderQuantity: 100,
      costPerUnit: 12.5,
      reorderPoint: 200,
      safetyStock: 80,
      currentStock: 0,
      isMultiSourced: true,
      riskIndicator: 'MEDIUM',
      supplierDeliverySlaDays: 10,
      supplierSlaBreachRate: 0.05,
      procurementOwner: '조달팀',
      notes: '계약 단가 기준. 안전재고 하향 불가.',
    },
  },
  {
    id: 'finished-good-standard',
    name: '완제품 표준',
    description: '주요 완제품 품번을 위한 출하 기준과 재주문점을 제공합니다.',
    defaults: {
      classification: 'FINISHED_GOOD',
      unitOfMeasure: 'EA',
      supplier: '사내 조립라인',
      warehouseLocation: '완제품-출하대기',
      storageHierarchy: {
        site: '본사',
        warehouse: '완제품창고',
        zone: '출하',
        aisle: 'S2',
        rack: 'FG-1',
      },
      leadTimeDays: 5,
      costPerUnit: 0,
      reorderPoint: 50,
      safetyStock: 30,
      currentStock: 0,
      minimumOrderQuantity: 20,
      isMultiSourced: false,
      riskIndicator: 'LOW',
      supplierDeliverySlaDays: 3,
      supplierSlaBreachRate: 0.02,
      notes: '출하 검수 완료 후 재고 반영',
    },
  },
];

/** ---------- Defaults ---------- */

const defaultSettings = (): SettingsState => {
  const slackWebhook = getEnvVar('VITE_SLACK_WEBHOOK_URL') ?? '';
  const genericWebhook = getEnvVar('VITE_WEBHOOK_URL') ?? '';
  const templates = createDefaultProductTemplates();
  const defaultHistoryColumns: HistoryReportColumnKey[] = Array.from(DEFAULT_HISTORY_REPORT_COLUMNS);

  return {
    useServer: getDefaultUseServer(),
    lowStockWarningThreshold: 10,
    criticalStockWarningThreshold: 3,

    slackNotificationsEnabled: Boolean(slackWebhook),
    slackWebhookUrl: slackWebhook,
    webhookNotificationsEnabled: Boolean(genericWebhook),
    webhookUrl: genericWebhook,

    safetyStockMultiplier: 1.2,
    minimumDaysOfCover: 3,
    autoRefreshCadenceMinutes: 15,

    // Product templates
    productTemplates: templates,
    defaultProductTemplateId: templates[0]?.id ?? 'raw-material-standard',

    // Procurement defaults
    procurementServiceLevelOptions: [90, 95, 99],
    procurementDefaultServiceLevel: 95,
    procurementLeadTimeAdjustment: 0,
    procurementSafetyDaysAdjustment: 0,
    procurementDefaultCategory: '전체',
    procurementDefaultSupplier: '전체',

    reportPreferences: {
      history: {
        defaultFormat: 'pdf',
        defaultAction: 'download',
        filenamePattern: 'history-{productName}-{timestamp}',
        enabledColumns: defaultHistoryColumns,
        title: '재고 내역 리포트',
      },
    },
  };
};

/** ---------- Storage Types ---------- */

type StoredSettings = Partial<SettingsState> & {
  // Legacy keys (for migration from older schemas)
  notificationsEnabled?: boolean;
  notificationEndpoint?: string;
  slackEnabled?: boolean;
  slackWebhook?: string;
  webhookEnabled?: boolean;
  webhookEndpoint?: string;
};

/** ---------- Helpers ---------- */

interface NormalizeNumberOptions {
  min?: number;
  max?: number;
  round?: boolean;
}

const coerceBoolean = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;

const coerceString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value.trim() : undefined;

const normalizeTemplateString = (value: unknown): string | undefined => {
  const result = coerceString(value);
  return result && result.length > 0 ? result : undefined;
};

const sanitizeString = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
};

const sanitizeOptionalString = (value: unknown, fallback?: string): string | undefined => {
  const trimmed = coerceString(value);
  if (!trimmed || trimmed.length === 0) return fallback;
  return trimmed;
};

const parseNumericValue = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (!Number.isNaN(parsed) && Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const normalizeNumber = (
  value: unknown,
  fallback: number,
  options: NormalizeNumberOptions = {},
): number => {
  const { min = 0, max = Number.POSITIVE_INFINITY, round = false } = options;
  const parsed = parseNumericValue(value);
  if (typeof parsed !== 'number') return fallback;

  const adjusted = Math.max(min, Math.min(max, parsed));
  return round ? Math.round(adjusted) : adjusted;
};

const HISTORY_REPORT_FORMATS: readonly HistoryReportFormat[] = ['csv', 'pdf'];
const HISTORY_REPORT_ACTIONS: readonly HistoryReportAction[] = ['download', 'share'];

const sanitizeHistoryReportColumns = (
  candidate: unknown,
  fallback: HistoryReportColumnKey[],
): HistoryReportColumnKey[] => {
  if (!Array.isArray(candidate)) return [...fallback];

  const valid = new Set<HistoryReportColumnKey>(DEFAULT_HISTORY_REPORT_COLUMNS);
  const sanitized = candidate
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry): entry is HistoryReportColumnKey => valid.has(entry as HistoryReportColumnKey));

  if (sanitized.length === 0) return [...fallback];

  return Array.from(new Set(sanitized));
};

const sanitizeHistoryReportPreferences = (
  candidate: unknown,
  fallback: HistoryReportPreferences,
): HistoryReportPreferences => {
  const source = (candidate && typeof candidate === 'object') ? (candidate as Record<string, unknown>) : {};

  const defaultFormat = HISTORY_REPORT_FORMATS.includes(source.defaultFormat as HistoryReportFormat)
    ? (source.defaultFormat as HistoryReportFormat)
    : fallback.defaultFormat;

  const defaultAction = HISTORY_REPORT_ACTIONS.includes(source.defaultAction as HistoryReportAction)
    ? (source.defaultAction as HistoryReportAction)
    : fallback.defaultAction;

  const filenamePattern = sanitizeString(source.filenamePattern, fallback.filenamePattern);
  const enabledColumns = sanitizeHistoryReportColumns(source.enabledColumns, fallback.enabledColumns);
  const title = sanitizeOptionalString(source.title, fallback.title);

  return {
    defaultFormat,
    defaultAction,
    filenamePattern,
    enabledColumns,
    title,
  };
};

const sanitizeReportPreferences = (
  candidate: unknown,
  fallback: ReportPreferencesState,
): ReportPreferencesState => {
  const source = (candidate && typeof candidate === 'object') ? (candidate as Record<string, unknown>) : {};
  return {
    history: sanitizeHistoryReportPreferences(source.history, fallback.history),
  };
};

/** ---------- Product Template Sanitizers ---------- */

const sanitizeWarehouseLocationDetail = (
  value: unknown,
  fallback: WarehouseLocationDetail | undefined,
): WarehouseLocationDetail | undefined => {
  const candidate = typeof value === 'object' && value !== null ? (value as WarehouseLocationDetail) : undefined;
  const sanitized: WarehouseLocationDetail = {
    site: normalizeTemplateString(candidate?.site) ?? normalizeTemplateString(fallback?.site),
    warehouse: normalizeTemplateString(candidate?.warehouse) ?? normalizeTemplateString(fallback?.warehouse),
    zone: normalizeTemplateString(candidate?.zone) ?? normalizeTemplateString(fallback?.zone),
    aisle: normalizeTemplateString(candidate?.aisle) ?? normalizeTemplateString(fallback?.aisle),
    rack: normalizeTemplateString(candidate?.rack) ?? normalizeTemplateString(fallback?.rack),
    shelf: normalizeTemplateString(candidate?.shelf) ?? normalizeTemplateString(fallback?.shelf),
    bin: normalizeTemplateString(candidate?.bin) ?? normalizeTemplateString(fallback?.bin),
  };

  const hasAnyValue = Object.values(sanitized).some((entry) => typeof entry === 'string' && entry.length > 0);
  return hasAnyValue ? sanitized : undefined;
};

const sanitizeNumberValue = (
  value: unknown,
  fallback: number | undefined,
  options: NormalizeNumberOptions & { clampMax?: number } = {},
): number | undefined => {
  const parsed = parseNumericValue(value);
  if (typeof parsed !== 'number') return fallback;

  const { min, round, clampMax } = options;
  let adjusted = typeof min === 'number' ? Math.max(min, parsed) : parsed;
  if (typeof clampMax === 'number') adjusted = Math.min(clampMax, adjusted);

  return round ? Math.round(adjusted) : adjusted;
};

const sanitizeProductTemplateDefaults = (
  candidate: unknown,
  fallback: ProductTemplateDefaults,
): ProductTemplateDefaults => {
  const source = (candidate && typeof candidate === 'object') ? (candidate as Record<string, unknown>) : {};
  const sanitized: ProductTemplateDefaults = { ...fallback };

  if ('classification' in source) {
    const classification = source.classification;
    if (PRODUCT_CLASSIFICATIONS.includes(classification as ProductClassification)) {
      sanitized.classification = classification as ProductClassification;
    } else if (fallback.classification) {
      sanitized.classification = fallback.classification;
    } else {
      delete sanitized.classification;
    }
  }

  if ('riskIndicator' in source) {
    const risk = source.riskIndicator;
    if (SUPPLY_RISK_LEVELS.includes(risk as SupplyRiskIndicator)) {
      sanitized.riskIndicator = risk as SupplyRiskIndicator;
    } else {
      delete sanitized.riskIndicator;
    }
  }

  if ('unitOfMeasure' in source) {
    const unit = normalizeTemplateString(source.unitOfMeasure);
    if (unit !== undefined) sanitized.unitOfMeasure = unit; else delete sanitized.unitOfMeasure;
  }

  if ('warehouseLocation' in source) {
    const warehouseLocation = normalizeTemplateString(source.warehouseLocation);
    if (warehouseLocation !== undefined) sanitized.warehouseLocation = warehouseLocation; else delete sanitized.warehouseLocation;
  }

  if ('supplier' in source) {
    const supplier = normalizeTemplateString(source.supplier);
    if (supplier !== undefined) sanitized.supplier = supplier; else delete sanitized.supplier;
  }

  if ('supplierCode' in source) {
    const supplierCode = normalizeTemplateString(source.supplierCode);
    if (supplierCode !== undefined) sanitized.supplierCode = supplierCode; else delete sanitized.supplierCode;
  }

  if ('procurementOwner' in source) {
    const procurementOwner = normalizeTemplateString(source.procurementOwner);
    if (procurementOwner !== undefined) sanitized.procurementOwner = procurementOwner; else delete sanitized.procurementOwner;
  }

  if ('notes' in source) {
    const notes = normalizeTemplateString(source.notes);
    if (notes !== undefined) sanitized.notes = notes; else delete sanitized.notes;
  }

  if ('storageHierarchy' in source) {
    const storageHierarchy = sanitizeWarehouseLocationDetail(source.storageHierarchy, fallback.storageHierarchy);
    if (storageHierarchy) sanitized.storageHierarchy = storageHierarchy; else delete sanitized.storageHierarchy;
  }

  const booleanFields: Array<keyof ProductTemplateDefaults> = ['isMultiSourced', 'hasAlternateSupplier'];
  booleanFields.forEach((field) => {
    if (field in source) {
      const value = source[field];
      if (typeof value === 'boolean') sanitized[field] = value; else delete sanitized[field];
    }
  });

  const assignNumericField = <K extends keyof ProductTemplateDefaults>(
    key: K,
    value: unknown,
    options?: NormalizeNumberOptions & { clampMax?: number },
  ) => {
    if (!(key in source)) return;
    if (value === null || value === '') {
      delete sanitized[key];
      return;
    }
    const parsed = sanitizeNumberValue(value, fallback[key] as number | undefined, options ?? {});
    if (parsed === undefined) delete sanitized[key]; else (sanitized as Record<string, unknown>)[key] = parsed;
  };

  assignNumericField('costPerUnit', source.costPerUnit, { min: 0 });
  assignNumericField('leadTimeDays', source.leadTimeDays, { min: 0, round: true });
  assignNumericField('contractLeadTimeDays', source.contractLeadTimeDays, { min: 0, round: true });
  assignNumericField('minimumOrderQuantity', source.minimumOrderQuantity, { min: 0, round: true });
  assignNumericField('averageDailyDemand', source.averageDailyDemand, { min: 0 });
  assignNumericField('inboundUnits', source.inboundUnits, { min: 0, round: true });
  assignNumericField('openWorkOrders', source.openWorkOrders, { min: 0, round: true });
  assignNumericField('supplierRiskScore', source.supplierRiskScore, { min: 0, clampMax: 1 });
  assignNumericField('supplierDeliverySlaDays', source.supplierDeliverySlaDays, { min: 0, round: true });
  assignNumericField('supplierSlaBreachRate', source.supplierSlaBreachRate, { min: 0, clampMax: 1 });
  assignNumericField('supplierPriceVolatility', source.supplierPriceVolatility, { min: 0, clampMax: 1 });
  assignNumericField('reorderPoint', source.reorderPoint, { min: 0, round: true });
  assignNumericField('currentStock', source.currentStock, { min: 0, round: true });
  assignNumericField('safetyStock', source.safetyStock, { min: 0, round: true });

  return sanitized;
};

const sanitizeProductTemplate = (
  candidate: unknown,
  fallback: ProductTemplate,
): ProductTemplate => {
  const source = (candidate && typeof candidate === 'object') ? (candidate as Record<string, unknown>) : {};

  const id = normalizeTemplateString(source.id) ?? fallback.id;
  const name = normalizeTemplateString(source.name) ?? fallback.name;
  const descriptionValue = coerceString(source.description);
  const description = descriptionValue !== undefined ? descriptionValue : fallback.description;

  const defaults = sanitizeProductTemplateDefaults(source.defaults, fallback.defaults);

  return { id, name, description, defaults };
};

const sanitizeProductTemplates = (
  candidate: unknown,
  fallback: ProductTemplate[],
): ProductTemplate[] => {
  if (!Array.isArray(candidate)) return fallback;

  const baseFallback: ProductTemplate = {
    id: '',
    name: '',
    description: '',
    defaults: {},
  };

  const sanitized = candidate
    .map((template, index) => sanitizeProductTemplate(template, fallback[index] ?? baseFallback))
    .filter((template) => template && template.id && template.name);

  if (sanitized.length === 0) return fallback;

  const seen = new Set<string>();
  return sanitized.filter((template) => {
    if (seen.has(template.id)) return false;
    seen.add(template.id);
    return true;
  });
};

const resolveDefaultProductTemplateId = (
  candidate: unknown,
  templates: ProductTemplate[],
  fallbackId: string,
): string => {
  const candidateId = normalizeTemplateString(candidate);
  if (candidateId && templates.some((t) => t.id === candidateId)) return candidateId;
  if (templates.some((t) => t.id === fallbackId)) return fallbackId;
  return templates[0]?.id ?? fallbackId;
};

const isSameWarehouseLocationDetail = (
  a?: WarehouseLocationDetail,
  b?: WarehouseLocationDetail,
): boolean => {
  const fields: Array<keyof WarehouseLocationDetail> = ['site', 'warehouse', 'zone', 'aisle', 'rack', 'shelf', 'bin'];
  return fields.every((field) => (a?.[field] ?? undefined) === (b?.[field] ?? undefined));
};

const isSameProductTemplateDefaults = (
  a: ProductTemplateDefaults,
  b: ProductTemplateDefaults,
): boolean => {
  const keys: Array<keyof ProductTemplateDefaults> = [
    'classification',
    'unitOfMeasure',
    'warehouseLocation',
    'storageHierarchy',
    'supplier',
    'supplierCode',
    'costPerUnit',
    'leadTimeDays',
    'contractLeadTimeDays',
    'minimumOrderQuantity',
    'isMultiSourced',
    'riskIndicator',
    'averageDailyDemand',
    'inboundUnits',
    'openWorkOrders',
    'supplierRiskScore',
    'supplierDeliverySlaDays',
    'supplierSlaBreachRate',
    'supplierPriceVolatility',
    'hasAlternateSupplier',
    'procurementOwner',
    'reorderPoint',
    'currentStock',
    'safetyStock',
    'notes',
  ];

  return keys.every((key) => {
    if (key === 'storageHierarchy') return isSameWarehouseLocationDetail(a.storageHierarchy, b.storageHierarchy);
    return (a[key] ?? undefined) === (b[key] ?? undefined);
  });
};

const isSameProductTemplate = (a: ProductTemplate, b: ProductTemplate): boolean =>
  a.id === b.id &&
  a.name === b.name &&
  (a.description ?? undefined) === (b.description ?? undefined) &&
  isSameProductTemplateDefaults(a.defaults, b.defaults);

const isSameProductTemplates = (a: ProductTemplate[], b: ProductTemplate[]): boolean =>
  a.length === b.length && a.every((template, index) => isSameProductTemplate(template, b[index]));

/** ---------- Procurement Sanitizers ---------- */

const sanitizeServiceLevelOptions = (
  candidate: unknown,
  fallback: number[],
): number[] => {
  if (!Array.isArray(candidate)) return fallback;

  const sanitized = candidate
    .map((entry) => parseNumericValue(entry))
    .filter((value): value is number => typeof value === 'number')
    .map((value) => Math.round(Math.max(0, Math.min(100, value))));

  const uniqueSorted = Array.from(new Set(sanitized)).sort((a, b) => a - b);
  return uniqueSorted.length > 0 ? uniqueSorted : fallback;
};

/** ---------- Settings Sanitizer (combines both branches) ---------- */

const sanitizeSettings = (
  candidate: Partial<SettingsState> | undefined,
  fallback: SettingsState,
): SettingsState => {
  // Support reading legacy keys from older persisted payloads
  const legacy = candidate as StoredSettings | undefined;

  // Product templates
  const fallbackTemplates = fallback.productTemplates ?? createDefaultProductTemplates();
  const templates = sanitizeProductTemplates(candidate?.productTemplates, fallbackTemplates);
  const defaultTemplateId = resolveDefaultProductTemplateId(
    candidate?.defaultProductTemplateId,
    templates,
    fallback.defaultProductTemplateId,
  );

  const reportPreferences = sanitizeReportPreferences(
    candidate?.reportPreferences,
    fallback.reportPreferences,
  );

  // Procurement: clean options and ensure default is a member of options
  const serviceLevelOptions = sanitizeServiceLevelOptions(
    candidate?.procurementServiceLevelOptions,
    fallback.procurementServiceLevelOptions,
  );

  const normalizedDefaultServiceLevel = normalizeNumber(
    candidate?.procurementDefaultServiceLevel,
    fallback.procurementDefaultServiceLevel,
    { min: 0, max: 100, round: true },
  );

  const fallbackServiceLevel = serviceLevelOptions.includes(fallback.procurementDefaultServiceLevel)
    ? fallback.procurementDefaultServiceLevel
    : serviceLevelOptions[0];

  const procurementDefaultServiceLevel = serviceLevelOptions.includes(normalizedDefaultServiceLevel)
    ? normalizedDefaultServiceLevel
    : fallbackServiceLevel;

  return {
    // Core
    useServer: typeof candidate?.useServer === 'boolean' ? candidate.useServer : fallback.useServer,
    lowStockWarningThreshold: normalizeNumber(
      candidate?.lowStockWarningThreshold,
      fallback.lowStockWarningThreshold,
      { round: true },
    ),
    criticalStockWarningThreshold: normalizeNumber(
      candidate?.criticalStockWarningThreshold,
      fallback.criticalStockWarningThreshold,
      { round: true },
    ),

    // Notifications (Slack)
    slackNotificationsEnabled:
      coerceBoolean(candidate?.slackNotificationsEnabled) ??
      coerceBoolean(legacy?.slackEnabled) ??
      coerceBoolean(legacy?.notificationsEnabled) ??
      fallback.slackNotificationsEnabled,
    slackWebhookUrl:
      coerceString(candidate?.slackWebhookUrl) ??
      coerceString(legacy?.slackWebhook) ??
      coerceString(legacy?.notificationEndpoint) ??
      fallback.slackWebhookUrl,

    // Notifications (Generic Webhook)
    webhookNotificationsEnabled:
      coerceBoolean(candidate?.webhookNotificationsEnabled) ??
      coerceBoolean(legacy?.webhookEnabled) ??
      coerceBoolean(legacy?.notificationsEnabled) ??
      fallback.webhookNotificationsEnabled,
    webhookUrl:
      coerceString(candidate?.webhookUrl) ??
      coerceString(legacy?.webhookEndpoint) ??
      coerceString(legacy?.notificationEndpoint) ??
      fallback.webhookUrl,

    // Inventory
    safetyStockMultiplier: normalizeNumber(
      candidate?.safetyStockMultiplier,
      fallback.safetyStockMultiplier,
      { min: 0 },
    ),
    minimumDaysOfCover: normalizeNumber(
      candidate?.minimumDaysOfCover,
      fallback.minimumDaysOfCover,
      { min: 0 },
    ),
    autoRefreshCadenceMinutes: normalizeNumber(
      candidate?.autoRefreshCadenceMinutes,
      fallback.autoRefreshCadenceMinutes,
      { min: 0, round: true },
    ),

    // Product templates
    productTemplates: templates,
    defaultProductTemplateId: defaultTemplateId,

    // Procurement
    procurementServiceLevelOptions: serviceLevelOptions,
    procurementDefaultServiceLevel,
    procurementLeadTimeAdjustment: normalizeNumber(
      candidate?.procurementLeadTimeAdjustment,
      fallback.procurementLeadTimeAdjustment,
      { min: -365, max: 365, round: true },
    ),
    procurementSafetyDaysAdjustment: normalizeNumber(
      candidate?.procurementSafetyDaysAdjustment,
      fallback.procurementSafetyDaysAdjustment,
      { min: -365, max: 365, round: true },
    ),
    procurementDefaultCategory: sanitizeString(
      candidate?.procurementDefaultCategory,
      fallback.procurementDefaultCategory,
    ),
    procurementDefaultSupplier: sanitizeString(
      candidate?.procurementDefaultSupplier,
      fallback.procurementDefaultSupplier,
    ),

    reportPreferences,
  };
};

/** ---------- Equality ---------- */

const areNumberArraysEqual = (a: number[], b: number[]): boolean => {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
};

const areStringArraysEqual = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
};

const isSameHistoryReportPreferences = (
  a: HistoryReportPreferences,
  b: HistoryReportPreferences,
): boolean =>
  a.defaultFormat === b.defaultFormat &&
  a.defaultAction === b.defaultAction &&
  a.filenamePattern === b.filenamePattern &&
  areStringArraysEqual(a.enabledColumns, b.enabledColumns) &&
  (a.title ?? undefined) === (b.title ?? undefined);

const isSameReportPreferences = (a: ReportPreferencesState, b: ReportPreferencesState): boolean =>
  isSameHistoryReportPreferences(a.history, b.history);

const isSameSettings = (a: SettingsState, b: SettingsState): boolean =>
  a.useServer === b.useServer &&
  a.lowStockWarningThreshold === b.lowStockWarningThreshold &&
  a.criticalStockWarningThreshold === b.criticalStockWarningThreshold &&
  a.slackNotificationsEnabled === b.slackNotificationsEnabled &&
  a.slackWebhookUrl === b.slackWebhookUrl &&
  a.webhookNotificationsEnabled === b.webhookNotificationsEnabled &&
  a.webhookUrl === b.webhookUrl &&
  a.safetyStockMultiplier === b.safetyStockMultiplier &&
  a.minimumDaysOfCover === b.minimumDaysOfCover &&
  a.autoRefreshCadenceMinutes === b.autoRefreshCadenceMinutes &&
  // Product templates
  a.defaultProductTemplateId === b.defaultProductTemplateId &&
  isSameProductTemplates(a.productTemplates, b.productTemplates) &&
  // Procurement
  areNumberArraysEqual(a.procurementServiceLevelOptions, b.procurementServiceLevelOptions) &&
  a.procurementDefaultServiceLevel === b.procurementDefaultServiceLevel &&
  a.procurementLeadTimeAdjustment === b.procurementLeadTimeAdjustment &&
  a.procurementSafetyDaysAdjustment === b.procurementSafetyDaysAdjustment &&
  a.procurementDefaultCategory === b.procurementDefaultCategory &&
  a.procurementDefaultSupplier === b.procurementDefaultSupplier &&
  isSameReportPreferences(a.reportPreferences, b.reportPreferences);

/** ---------- Storage I/O ---------- */

const readStoredSettings = (): StoredSettings | undefined => {
  if (typeof window === 'undefined') return undefined;
  try {
    const stored = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!stored) return undefined;
    return JSON.parse(stored) as StoredSettings;
  } catch (error) {
    console.error('[settings] Failed to parse stored settings', error);
    return undefined;
  }
};

/** ---------- Provider / Hook ---------- */

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<SettingsState>(() => {
    const defaults = defaultSettings();
    const stored = readStoredSettings();
    return sanitizeSettings(stored, defaults);
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const payload: StoredSettings = { ...settings };
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.error('[settings] Failed to persist settings', error);
    }
  }, [settings]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleStorage = (event: StorageEvent) => {
      if (event.key && event.key !== SETTINGS_STORAGE_KEY) return;

      setSettings((prev) => {
        const defaults = defaultSettings();
        const fallback = sanitizeSettings(prev, defaults);
        const stored = readStoredSettings();
        const next = sanitizeSettings(stored, fallback);
        return isSameSettings(prev, next) ? prev : next;
      });
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const updateSettings = useCallback((changes: Partial<SettingsState>) => {
    setSettings((prev) => {
      const defaults = defaultSettings();
      const merged: Partial<SettingsState> = { ...prev, ...changes };
      const next = sanitizeSettings(merged, { ...defaults, ...prev });
      return isSameSettings(prev, next) ? prev : next;
    });
  }, []);

  const value = useMemo(
    () => ({ ...settings, updateSettings }),
    [settings, updateSettings],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};

export const useSettings = (): SettingsContextValue => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

export const loadPersistedSettings = (): SettingsState => {
  const defaults = defaultSettings();
  const stored = readStoredSettings();
  return sanitizeSettings(stored, defaults);
};
