import type { FastifyInstance } from 'fastify';
import OpenAI from 'openai';
import { APIError, APIConnectionError, APIConnectionTimeoutError } from 'openai/error';
import { savePolicyDrafts, listPolicyDrafts, type PolicyDraftRecord } from '../stores/policiesStore.js';

const apiKey = process.env.OPENAI_API_KEY;
const openaiClient = apiKey ? new OpenAI({ apiKey }) : null;

interface PolicyRecommendationRequestBody {
  product?: {
    sku?: string;
    name?: string;
    segment?: string;
    abc?: string;
    xyz?: string;
    avgDaily?: number;
    onHand?: number;
    risk?: string;
    expiryDays?: number;
    pack?: number;
    casePack?: number;
  };
  policy?: {
    z?: number;
    L?: number;
    R?: number;
    moq?: number;
    pack?: number;
    casePack?: number;
    includeLTVar?: boolean;
    sigmaL?: number;
  };
  metrics?: {
    safetyStock?: number;
    target?: number;
    shortage?: number;
    recommendedOrder?: number;
  };
  userNote?: string;
}

interface PolicyPatch {
  z?: number;
  L?: number;
  R?: number;
  moq?: number;
  pack?: number;
  casePack?: number;
  includeLTVar?: boolean;
  sigmaL?: number;
}

interface PolicyRecommendation {
  patch: PolicyPatch;
  notes: string[];
  rawText: string;
}

interface PolicyDraftInput {
  sku?: unknown;
  forecastDemand?: unknown;
  demandStdDev?: unknown;
  leadTimeDays?: unknown;
  serviceLevelPercent?: unknown;
}

interface PolicyBulkSaveRequestBody {
  items?: PolicyDraftInput[];
}

interface ForecastRecommendationRequestBody {
  product?: {
    sku?: string;
    name?: string;
    category?: string;
  };
  metrics?: {
    dailyAvg?: number;
    dailyStd?: number;
    avgOutbound7d?: number;
    onHand?: number;
    leadTimeDays?: number;
    serviceLevelPercent?: number;
  };
  history?: Array<{
    date?: string;
    actual?: number | null;
    forecast?: number | null;
  }>;
}

interface ForecastRecommendationResult {
  forecastDemand: number | null;
  demandStdDev: number | null;
  leadTimeDays: number | null;
  serviceLevelPercent: number | null;
  notes: string[];
  rawText: string;
}

const POLICY_SYSTEM_PROMPT = `당신은 재고관리 20년 경력 전문가로서 유통·리테일 수요 기획 팀을 돕는 재고 정책 컨설턴트입니다.
- SKU의 수요 패턴, ABC/XYZ 클래스, 재고 상태를 참고해 주기검토(R,S) 정책 조정안을 제안하세요.
- 실무에서 축적한 보수적 위험 관리 관점을 적용해 재고 과부족을 예방하는 현실적인 개선안을 강조하세요.
- 응답은 JSON으로만 작성하고, 키는 patch, notes, rawText 로 제한합니다.
- patch 에는 조정이 필요한 필드만 포함하며, z, L, R, moq, pack, casePack, includeLTVar, sigmaL 중 필요한 값만 제공합니다.
- notes 는 2~4개의 한국어 문장으로 구성된 배열이며, 각 항목은 데이터를 근거로 조정 이유를 설명합니다.
- rawText 는 1~2문장으로 요약된 참고 설명을 제공합니다.
- 정보가 부족하면 합리적 추정임을 명시하고, 사실과 추정을 구분하세요.`;

const FORECAST_SYSTEM_PROMPT = `You are a supply and inventory planning analyst. Provided with SKU context and recent demand history, suggest realistic values for daily forecast demand, demand standard deviation, lead time (days), and service level percentage that will support healthy safety stock. Respond in JSON with keys forecastDemand, demandStdDev, leadTimeDays, serviceLevelPercent, and notes (array of short rationale strings). Use numeric values only (no units) and round to sensible whole numbers except serviceLevelPercent, which may include one decimal place when appropriate.`;

const pickJsonBlock = (content: string): string => {
  const codeBlockMatch = content.match(/```json([\s\S]*?)```/i);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }
  const looseMatch = content.match(/\{[\s\S]*\}/);
  if (looseMatch) {
    return looseMatch[0];
  }
  return content;
};

const parseBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return undefined;
};

const parseNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

const toNullableNumber = (value: unknown): number | null => {
  const parsed = parseNumber(value);
  if (parsed === undefined || Number.isNaN(parsed)) {
    return null;
  }
  if (parsed < 0) {
    return 0;
  }
  return parsed;
};

const clampServiceLevelPercent = (value: number | null): number | null => {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  const clamped = Math.max(50, Math.min(99.9, value));
  return Math.round(clamped * 10) / 10;
};

const normalizePolicyDraft = (input: PolicyDraftInput): PolicyDraftRecord | null => {
  const skuText = typeof input.sku === 'string' ? input.sku.trim() : String(input.sku ?? '').trim();
  if (!skuText) {
    return null;
  }

  return {
    sku: skuText,
    forecastDemand: toNullableNumber(input.forecastDemand),
    demandStdDev: toNullableNumber(input.demandStdDev),
    leadTimeDays: toNullableNumber(input.leadTimeDays),
    serviceLevelPercent: clampServiceLevelPercent(toNullableNumber(input.serviceLevelPercent)),
  };
};

const parsePolicyRecommendation = (content: string): PolicyRecommendation => {
  const normalized = content.trim();
  if (!normalized) {
    throw new Error('LLM 응답이 비어 있습니다.');
  }

  const jsonBlock = pickJsonBlock(normalized);

  const allowedKeys = new Set<keyof PolicyPatch>([
    'z',
    'L',
    'R',
    'moq',
    'pack',
    'casePack',
    'includeLTVar',
    'sigmaL',
  ]);

  try {
    const parsed = JSON.parse(jsonBlock) as Partial<PolicyRecommendation> & {
      patch?: Record<string, unknown>;
      notes?: unknown;
      rawText?: unknown;
    };

    const patch: PolicyPatch = {};
    const rawPatch = parsed.patch ?? {};
    if (rawPatch && typeof rawPatch === 'object') {
      (Object.keys(rawPatch) as (keyof PolicyPatch)[]).forEach((key) => {
        if (!allowedKeys.has(key)) {
          return;
        }
        if (key === 'includeLTVar') {
          const boolValue = parseBoolean((rawPatch as Record<string, unknown>)[key]);
          if (typeof boolValue === 'boolean') {
            patch.includeLTVar = boolValue;
          }
          return;
        }
        const numberValue = parseNumber((rawPatch as Record<string, unknown>)[key]);
        if (numberValue !== undefined) {
          patch[key] = numberValue as never;
        }
      });
    }

    const rawNotes = parsed.notes;
    const notes: string[] = Array.isArray(rawNotes)
      ? rawNotes
          .filter((note): note is string => typeof note === 'string' && note.trim().length > 0)
          .map((note) => note.trim())
      : typeof rawNotes === 'string' && rawNotes.trim().length > 0
        ? [rawNotes.trim()]
        : [];

    const rawText =
      typeof parsed.rawText === 'string' && parsed.rawText.trim().length > 0
        ? parsed.rawText.trim()
        : normalized;

    return { patch, notes, rawText };
  } catch (error) {
    throw new Error('LLM 응답을 JSON으로 해석하지 못했습니다.');
  }
};

const buildUserPrompt = (body: PolicyRecommendationRequestBody): string => {
  const product = body.product ?? {};
  const policy = body.policy ?? {};
  const metrics = body.metrics ?? {};

  const lines: string[] = [];
  lines.push(`SKU: ${product.sku ?? '미확인'}`);
  lines.push(`품명: ${product.name ?? '미확인'}`);
  lines.push(`세그먼트: ${product.segment ?? '--'}`);
  lines.push(`ABC/XYZ: ${(product.abc ?? '--')}/${product.xyz ?? '--'}`);
  lines.push(`평균 일수요: ${product.avgDaily ?? '미상'} EA`);
  lines.push(`현재 재고: ${product.onHand ?? '미상'} EA`);
  if (product.risk) {
    lines.push(`재고 리스크: ${product.risk}`);
  }
  if (typeof product.expiryDays === 'number') {
    lines.push(`유통기한 잔여일: ${product.expiryDays}`);
  }
  lines.push(
    `현재 정책: z=${policy.z ?? '미상'}, L=${policy.L ?? '미상'}, R=${policy.R ?? '미상'}, MOQ=${policy.moq ?? '미상'}, Pack=${policy.pack ?? '미상'}, CasePack=${policy.casePack ?? '미상'}, LT변동=${policy.includeLTVar ? '포함' : '미포함'}, sigmaL=${policy.sigmaL ?? '미상'}`,
  );

  const metricDetails: string[] = [];
  if (typeof metrics.safetyStock === 'number') {
    metricDetails.push(`안전재고=${metrics.safetyStock}`);
  }
  if (typeof metrics.target === 'number') {
    metricDetails.push(`목표재고=${metrics.target}`);
  }
  if (typeof metrics.shortage === 'number') {
    metricDetails.push(`부족분=${metrics.shortage}`);
  }
  if (typeof metrics.recommendedOrder === 'number') {
    metricDetails.push(`권장발주=${metrics.recommendedOrder}`);
  }
  if (metricDetails.length > 0) {
    lines.push(`추가 지표: ${metricDetails.join(', ')}`);
  }

  if (body.userNote && body.userNote.trim().length > 0) {
    lines.push(`기존 메모: ${body.userNote.trim()}`);
  }

  lines.push('목표: 한국어로 간결한 정책 조정 patch와 근거를 제시');

  return lines.join('\n');
};

const buildForecastUserPrompt = (body: ForecastRecommendationRequestBody): string => {
  const product = body.product ?? {};
  const metrics = body.metrics ?? {};
  const lines: string[] = [];

  lines.push(`SKU: ${product.sku ?? 'UNKNOWN'}`);
  lines.push(`Name: ${product.name ?? 'N/A'}`);
  if (product.category) {
    lines.push(`Category: ${product.category}`);
  }
  if (typeof metrics.dailyAvg === 'number') {
    lines.push(`Daily average outbound: ${metrics.dailyAvg}`);
  }
  if (typeof metrics.dailyStd === 'number') {
    lines.push(`Daily standard deviation: ${metrics.dailyStd}`);
  }
  if (typeof metrics.avgOutbound7d === 'number') {
    lines.push(`Average outbound (7d): ${metrics.avgOutbound7d}`);
  }
  if (typeof metrics.onHand === 'number') {
    lines.push(`On-hand inventory: ${metrics.onHand}`);
  }
  if (typeof metrics.leadTimeDays === 'number') {
    lines.push(`Current lead time (days): ${metrics.leadTimeDays}`);
  }
  if (typeof metrics.serviceLevelPercent === 'number') {
    lines.push(`Current service level (%): ${metrics.serviceLevelPercent}`);
  }

  const history = Array.isArray(body.history)
    ? body.history.filter((entry) => entry && (entry.actual !== null || entry.forecast !== null))
    : [];
  if (history.length > 0) {
    lines.push('Recent demand history (date, actual -> forecast):');
    history.slice(-8).forEach((entry) => {
      const actual = entry?.actual ?? 'N/A';
      const forecast = entry?.forecast ?? 'N/A';
      lines.push(`- ${entry?.date ?? 'unknown'}: ${actual} -> ${forecast}`);
    });
  }

  lines.push('Goal: Suggest values for forecastDemand (EA/day), demandStdDev (EA/day), leadTimeDays, serviceLevelPercent.');
  lines.push('Respond ONLY with JSON.');

  return lines.join('\n');
};

const parseForecastRecommendation = (content: string): ForecastRecommendationResult => {
  const normalized = content.trim();
  if (!normalized) {
    throw new Error('LLM 응답이 비어 있습니다.');
  }

  const jsonBlock = pickJsonBlock(normalized);

  try {
    const parsed = JSON.parse(jsonBlock) as Record<string, unknown> & {
      notes?: unknown;
      rawText?: unknown;
    };

    const forecastDemand = toNullableNumber(parsed.forecastDemand ?? (parsed as { demand?: unknown }).demand);
    const demandStdDev = toNullableNumber(parsed.demandStdDev ?? (parsed as { sigma?: unknown }).sigma);
    const leadTimeDays = toNullableNumber(parsed.leadTimeDays ?? (parsed as { leadTime?: unknown }).leadTime);
    const serviceLevelPercent = clampServiceLevelPercent(
      toNullableNumber(parsed.serviceLevelPercent ?? (parsed as { serviceLevel?: unknown }).serviceLevel),
    );

    const rawNotes = parsed.notes;
    const notes: string[] = Array.isArray(rawNotes)
      ? rawNotes
          .filter((note): note is string => typeof note === 'string' && note.trim().length > 0)
          .map((note) => note.trim())
      : typeof rawNotes === 'string' && rawNotes.trim().length > 0
        ? [rawNotes.trim()]
        : [];

    const rawText =
      typeof parsed.rawText === 'string' && parsed.rawText.trim().length > 0
        ? parsed.rawText.trim()
        : normalized;

    return {
      forecastDemand,
      demandStdDev,
      leadTimeDays,
      serviceLevelPercent,
      notes,
      rawText,
    };
  } catch (error) {
    throw new Error('LLM 응답을 JSON으로 해석하지 못했습니다.');
  }
};

const extractHttpStatus = (err: unknown): number | undefined => {
  if (!err) {
    return undefined;
  }
  if (err instanceof APIError) {
    return err.status ?? undefined;
  }
  const status = (err as { status?: unknown }).status;
  if (typeof status === 'number' && Number.isFinite(status)) {
    return status;
  }
  if (typeof status === 'string' && status.trim()) {
    const parsed = Number(status);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  const statusCode = (err as { statusCode?: unknown }).statusCode;
  if (typeof statusCode === 'number' && Number.isFinite(statusCode)) {
    return statusCode;
  }
  if (typeof statusCode === 'string' && statusCode.trim()) {
    const parsed = Number(statusCode);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return undefined;
};

const isLikelyNetworkError = (err: unknown): boolean => {
  if (!err) {
    return false;
  }
  if (err instanceof APIConnectionError || err instanceof APIConnectionTimeoutError) {
    return true;
  }
  const code = (err as { code?: unknown }).code;
  const normalized = typeof code === 'string' ? code.toUpperCase() : '';
  if (
    normalized.includes('ENOTFOUND') ||
    normalized.includes('ECONNRESET') ||
    normalized.includes('ETIMEDOUT') ||
    normalized.includes('ECONNREFUSED') ||
    normalized.includes('EAI_AGAIN') ||
    normalized.includes('CERT')
  ) {
    return true;
  }
  const message = (err as { message?: unknown }).message;
  if (typeof message === 'string') {
    const lower = message.toLowerCase();
    return (
      lower.includes('network') ||
      lower.includes('fetch') ||
      lower.includes('timeout') ||
      lower.includes('getaddrinfo') ||
      lower.includes('tls') ||
      lower.includes('connection')
    );
  }
  return false;
};

export default async function policyRoutes(server: FastifyInstance) {
  server.get('/', async (request, reply) => {
    const items = listPolicyDrafts();
    return reply.send({ success: true, items });
  });

  server.post('/bulk-save', async (request, reply) => {
    const body = (request.body as PolicyBulkSaveRequestBody | undefined) ?? {};
    const rawItems = Array.isArray(body.items) ? body.items : [];

    const drafts = rawItems
      .map((item) => normalizePolicyDraft(item))
      .filter((item): item is PolicyDraftRecord => item !== null);

    if (drafts.length === 0) {
      return reply.code(400).send({ success: false, message: '저장할 정책 데이터가 없습니다.' });
    }

    savePolicyDrafts(drafts);
    return reply.send({ success: true });
  });

  server.post('/recommend-forecast', async (request, reply) => {
    const body = (request.body as ForecastRecommendationRequestBody | undefined) ?? {};

    if (!openaiClient) {
      return reply
        .code(503)
        .send({ success: false, error: 'LLM 추천 기능이 활성화되지 않았습니다. OPENAI_API_KEY를 확인해주세요.' });
    }

    try {
      const completion = await openaiClient.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
          { role: 'system', content: FORECAST_SYSTEM_PROMPT },
          { role: 'user', content: buildForecastUserPrompt(body) },
        ],
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error('LLM에서 유효한 응답을 받지 못했습니다.');
      }

      const recommendation = parseForecastRecommendation(content);
      return reply.send({ success: true, recommendation });
    } catch (error) {
      request.log.error(error, 'Failed to generate forecast parameter recommendation');
      const statusFromError = extractHttpStatus(error);
      let status: number;
      if (statusFromError === 401 || statusFromError === 403) {
        status = 401;
      } else if (statusFromError === 429) {
        status = 429;
      } else if (statusFromError && statusFromError >= 500 && statusFromError < 600) {
        status = 503;
      } else if (isLikelyNetworkError(error)) {
        status = 503;
      } else {
        status = 500;
      }

      let message: string;
      if (status === 401) {
        message = 'LLM API 인증 정보가 유효하지 않습니다. 서버 환경 변수 OPENAI_API_KEY를 확인해주세요.';
      } else if (status === 429) {
        message = 'LLM 호출이 일시적으로 제한되었습니다. 잠시 후 다시 시도해주세요.';
      } else if (status === 503) {
        message = 'LLM 서비스와 통신하지 못했습니다. 네트워크 상태나 서비스 제공 상황을 확인해주세요.';
      } else {
        message = '추천값 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
      }

      return reply.code(status).send({ success: false, error: message });
    }
  });

  server.post('/recommend', async (request, reply) => {
    const body = (request.body as PolicyRecommendationRequestBody | undefined) ?? {};

    if (!body.product?.sku || !body.product?.name || !body.policy) {
      return reply.code(400).send({ success: false, error: 'product 정보와 policy 정보가 필요합니다.' });
    }

    if (!openaiClient) {
      return reply
        .code(503)
        .send({ success: false, error: 'LLM 연동이 설정되지 않았습니다. OPENAI_API_KEY를 확인해주세요.' });
    }

    try {
      const completion = await openaiClient.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        messages: [
          { role: 'system', content: POLICY_SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(body) },
        ],
      });

      const content = completion.choices[0]?.message?.content;
      if (!content) {
        throw new Error('LLM에서 유효한 응답을 받지 못했습니다.');
      }

      const recommendation = parsePolicyRecommendation(content);

      return reply.send({ success: true, recommendation });
    } catch (error) {
      request.log.error(error, 'Failed to generate policy recommendation');
      const statusFromError = extractHttpStatus(error);
      let status: number;
      if (statusFromError === 401 || statusFromError === 403) {
        status = 401;
      } else if (statusFromError === 429) {
        status = 429;
      } else if (statusFromError && statusFromError >= 500 && statusFromError < 600) {
        status = 503;
      } else if (isLikelyNetworkError(error)) {
        status = 503;
      } else {
        status = 500;
      }

      let message: string;
      if (status === 401) {
        message = 'LLM API 키가 유효하지 않습니다. 서버 환경 변수 OPENAI_API_KEY를 확인해 주세요.';
      } else if (status === 429) {
        message = 'LLM 호출이 일시적으로 제한되었습니다. 잠시 후 다시 시도해 주세요.';
      } else if (status === 503) {
        message = 'LLM 서비스에 연결할 수 없습니다. 네트워크 상태나 서비스 상태를 확인해 주세요.';
      } else {
        message = '정책 추천 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
      }

      return reply.code(status).send({ success: false, error: message });
    }
  });
}
