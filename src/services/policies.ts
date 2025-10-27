import { post } from './api';

export interface PolicyRecommendationPatch {
  z?: number;
  L?: number;
  R?: number;
  moq?: number;
  pack?: number;
  casePack?: number;
  includeLTVar?: boolean;
  sigmaL?: number;
  forecastDemand?: number;
  demandStdDev?: number;
  leadTimeDays?: number;
  serviceLevelPercent?: number;
}

export interface PolicyRecommendationPayload {
  product: {
    sku: string;
    name: string;
    segment?: string;
    abc?: string;
    xyz?: string;
    avgDaily?: number;
    onHand?: number;
    pack?: number;
    casePack?: number;
  };
  policy: {
    z: number;
    L: number;
    R: number;
    moq: number;
    pack: number;
    casePack?: number;
    includeLTVar: boolean;
    sigmaL: number;
  };
  metrics?: {
    safetyStock?: number;
    target?: number;
    shortage?: number;
    recommendedOrder?: number;
  };
  userNote?: string;
}

export interface PolicyRecommendationResponse {
  patch: PolicyRecommendationPatch;
  notes: string[];
  rawText?: string;
}

export interface PolicyDraft {
  sku: string;
  forecastDemand: number | null;
  demandStdDev: number | null;
  leadTimeDays: number | null;
  serviceLevelPercent: number | null;
}

interface PolicyBulkSaveResponse {
  success: boolean;
  message?: string;
}

export type SafetyPolicyMethod = 'bufferRatio' | 'kFactor' | 'base';

export interface SafetyPolicyRecord {
  sku: string;
  warehouse: string;
  leadTimeDays: number;
  bufferRatio?: number;
  kFactor?: number;
}

export interface ReplenishmentCalculationInput {
  dailyAvg: number;
  dailyStd: number;
  onHand: number;
  leadTimeDays: number;
  bufferRatio?: number;
  kFactor?: number;
  method?: SafetyPolicyMethod;
}

export interface ReplenishmentCalculationResult {
  method: SafetyPolicyMethod;
  leadTimeDays: number;
  baseDemand: number;
  safetyStock: number;
  recommended: number;
  shortage: number;
  etaDays: number | null;
  coverageDays: number | null;
  appliedBufferRatio?: number;
  appliedKFactor?: number;
}

const SAFETY_POLICY_DATA: SafetyPolicyRecord[] = [
  { sku: 'D1E2F3G', warehouse: 'ICN-DC', leadTimeDays: 5, bufferRatio: 0.28 },
  { sku: 'H4I5J6K', warehouse: 'ICN-DC', leadTimeDays: 12, kFactor: 1.9 },
  { sku: 'L7M8N9O', warehouse: 'BS-FTZ', leadTimeDays: 7, bufferRatio: 0.2 },
];

const normalizeSku = (value: string): string => value.trim().toUpperCase();
const normalizeWarehouse = (value?: string): string => (value ? value.trim().toUpperCase() : 'DEFAULT');

export function listSafetyPolicies(): SafetyPolicyRecord[] {
  return SAFETY_POLICY_DATA.map((policy) => ({ ...policy }));
}

export function getSafetyPolicy(sku: string, warehouse?: string): SafetyPolicyRecord | null {
  if (!sku || typeof sku !== 'string') {
    return null;
  }

  const normalizedSku = normalizeSku(sku);
  const normalizedWarehouse = warehouse ? normalizeWarehouse(warehouse) : null;

  const directMatch = normalizedWarehouse
    ? SAFETY_POLICY_DATA.find(
        (policy) =>
          normalizeSku(policy.sku) === normalizedSku && normalizeWarehouse(policy.warehouse) === normalizedWarehouse,
      )
    : undefined;

  if (directMatch) {
    return { ...directMatch };
  }

  const fallback = SAFETY_POLICY_DATA.find((policy) => normalizeSku(policy.sku) === normalizedSku);
  return fallback ? { ...fallback } : null;
}

const sanitizePositiveNumber = (value: number | undefined, fallback = 0): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  if (value < 0) {
    return fallback;
  }
  return value;
};

const sanitizeRatio = (value: number | undefined): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  if (value < 0) {
    return 0;
  }
  return value;
};

export function calculateReplenishmentRecommendation(
  input: ReplenishmentCalculationInput,
): ReplenishmentCalculationResult {
  const dailyAvg = sanitizePositiveNumber(input.dailyAvg);
  const dailyStd = sanitizePositiveNumber(input.dailyStd);
  const onHand = sanitizePositiveNumber(input.onHand);
  const leadTimeDays = sanitizePositiveNumber(input.leadTimeDays);

  const bufferRatio = sanitizeRatio(input.bufferRatio);
  const kFactor = sanitizeRatio(input.kFactor);

  let method: SafetyPolicyMethod = 'base';
  if (input.method === 'bufferRatio' && bufferRatio !== undefined) {
    method = 'bufferRatio';
  } else if (input.method === 'kFactor' && kFactor !== undefined) {
    method = 'kFactor';
  } else if (bufferRatio !== undefined) {
    method = 'bufferRatio';
  } else if (kFactor !== undefined) {
    method = 'kFactor';
  }

  const baseDemandRaw = dailyAvg * leadTimeDays;
  let recommended = baseDemandRaw;
  let safetyStock = 0;
  let appliedBufferRatio: number | undefined;
  let appliedKFactor: number | undefined;

  if (method === 'bufferRatio') {
    appliedBufferRatio = bufferRatio ?? 0;
    recommended = baseDemandRaw * (1 + appliedBufferRatio);
    safetyStock = recommended - baseDemandRaw;
  } else if (method === 'kFactor') {
    appliedKFactor = kFactor ?? 0;
    safetyStock = appliedKFactor * dailyStd * Math.sqrt(leadTimeDays);
    recommended = baseDemandRaw + safetyStock;
  }

  const recommendedRounded = Math.max(0, Math.round(recommended));
  const baseRounded = Math.max(0, Math.round(baseDemandRaw));
  const safetyRounded = Math.max(0, Math.round(safetyStock));
  const availableRounded = Math.max(0, Math.round(onHand));
  const shortage = Math.max(0, recommendedRounded - availableRounded);

  const coverageRaw = dailyAvg > 0 ? availableRounded / dailyAvg : null;
  const etaDays = coverageRaw !== null ? Math.max(0, Math.floor(coverageRaw)) : null;

  return {
    method,
    leadTimeDays: Math.max(0, Math.round(leadTimeDays)),
    baseDemand: baseRounded,
    safetyStock: safetyRounded,
    recommended: recommendedRounded,
    shortage,
    etaDays,
    coverageDays: coverageRaw,
    appliedBufferRatio,
    appliedKFactor,
  };
}

interface PolicyRecommendationApiResponse {
  success: boolean;
  recommendation?: PolicyRecommendationResponse;
  error?: string;
}

const normalizeNotes = (notes?: unknown): string[] => {
  if (!notes) {
    return [];
  }
  if (Array.isArray(notes)) {
    return notes
      .filter((note): note is string => typeof note === 'string' && note.trim().length > 0)
      .map((note) => note.trim());
  }
  if (typeof notes === 'string' && notes.trim().length > 0) {
    return [notes.trim()];
  }
  return [];
};

export async function requestPolicyRecommendation(
  payload: PolicyRecommendationPayload,
): Promise<PolicyRecommendationResponse> {
  const response = await post<PolicyRecommendationApiResponse>('/policies/recommend', payload);

  if (!response.success || !response.recommendation) {
    const message = response.error?.trim() || 'LLM 정책 추천을 생성하지 못했습니다.';
    throw new Error(message);
  }

  const patch = response.recommendation.patch ?? {};
  const notes = normalizeNotes(response.recommendation.notes);

  return {
    patch,
    notes,
    rawText: response.recommendation.rawText,
  };
}

export async function savePolicies(policies: PolicyDraft[]): Promise<void> {
  const response = await post<PolicyBulkSaveResponse>('/policies/bulk-save', {
    items: policies ?? [],
  });

  if (!response.success) {
    const message = response.message?.trim() || '정책을 저장하지 못했습니다.';
    throw new Error(message);
  }
}
