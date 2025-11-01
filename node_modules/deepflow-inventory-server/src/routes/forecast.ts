import type { FastifyInstance } from 'fastify';

import {
  findForecastProduct,
  type ForecastProduct,
} from '../data/forecastSources.js';
import {
  buildSeasonalForecast,
  estimateStockoutDate,
  type ForecastPoint,
} from '../services/seasonalForecast.js';

const monthLabels = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

const toUtcDate = (value: string): Date => {
  const normalized = value.includes('T') ? value : `${value}T00:00:00Z`;
  return new Date(normalized);
};

const formatDateLabel = (value: string): string => {
  const date = toUtcDate(value);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const toPromotionMap = (product: ForecastProduct): Record<string, string> => {
  const result: Record<string, string> = {};
  product.futurePromotions?.forEach((promo) => {
    const key = promo.month.includes('-01') ? promo.month : `${promo.month}-01`;
    result[key] = promo.note;
  });
  return result;
};

const sliceTimeline = (timeline: ForecastPoint[], maxHistoryPoints = 18): ForecastPoint[] => {
  const history = timeline.filter((point) => point.phase === 'history');
  const forecast = timeline.filter((point) => point.phase === 'forecast');
  const trimmedHistory = history.slice(-maxHistoryPoints);
  return [...trimmedHistory, ...forecast];
};

const sum = (values: number[]): number => values.reduce((acc, value) => acc + value, 0);

const formatNumber = (value: number): string => Math.round(value).toLocaleString();

const buildExplanation = (
  product: ForecastProduct,
  trimmedTimeline: ForecastPoint[],
  mape: number | null,
  seasonalFactors: number[],
  trainingStart: string,
  trainingEnd: string,
): {
  summary: string;
  drivers: string[];
  details: string;
  model: {
    name: string;
    seasonalPeriod: number;
    trainingWindow: string;
    generatedAt: string;
    mape: number | null;
  };
} => {
  const historyPoints = trimmedTimeline.filter((point) => point.phase === 'history');
  const forecastPoints = trimmedTimeline.filter((point) => point.phase === 'forecast');

  const months = historyPoints.length;
  const totalHistory = sum(historyPoints.map((point) => point.actual ?? 0));
  const averageHistory = months > 0 ? totalHistory / months : 0;

  const firstActual = historyPoints[0]?.actual ?? 0;
  const lastActual = historyPoints[historyPoints.length - 1]?.actual ?? 0;
  const trendChange = firstActual > 0 ? ((lastActual - firstActual) / firstActual) * 100 : 0;
  const trendDescription =
    trendChange > 7
      ? `최근 ${months}개월 동안 약 ${Math.round(trendChange)}% 증가했습니다`
      : trendChange < -7
        ? `최근 ${months}개월 동안 약 ${Math.abs(Math.round(trendChange))}% 감소했습니다`
        : '최근 수요가 안정적으로 유지되고 있습니다';

  const nextForecast = forecastPoints[0]?.forecast ?? lastActual;
  const promoShare = totalHistory > 0
    ? (sum(historyPoints.filter((point) => point.promo).map((point) => point.actual ?? 0)) / totalHistory) * 100
    : 0;

  const peakFactor = Math.max(...seasonalFactors);
  const peakMonthIndex = seasonalFactors.indexOf(peakFactor);
  const peakMonthLabel = peakMonthIndex >= 0 ? monthLabels[peakMonthIndex] : null;

  const summary = `${product.name} 월평균 출고는 약 ${formatNumber(averageHistory)}개이며 ${trendDescription}. 다음 달 예측치는 ${formatNumber(nextForecast)}개 수준입니다.`;

  const drivers: string[] = [];
  if (peakMonthLabel) {
    drivers.push(`${peakMonthLabel} 시즌이 평균 대비 ${(peakFactor * 100 - 100).toFixed(1)}% 높은 패턴으로 나타납니다.`);
  }
  drivers.push(
    mape !== null
      ? `MAPE ${mape.toFixed(1)}% 기반 계절-추세 모델(학습 구간 ${formatDateLabel(trainingStart)} ~ ${formatDateLabel(trainingEnd)})`
      : `계절-추세 모델(학습 구간 ${formatDateLabel(trainingStart)} ~ ${formatDateLabel(trainingEnd)})`,
  );
  if (promoShare > 0) {
    drivers.push(`히스토리 출고 중 프로모션 비중 ${promoShare.toFixed(1)}% 반영됨.`);
  }

  const promoForecastNotes = forecastPoints
    .filter((point) => point.promo)
    .map((point) => `${formatDateLabel(point.date)} 예정 프로모션 반영`);
  drivers.push(...promoForecastNotes);

  const details = `${product.category} · 평균 ${formatNumber(averageHistory)}개/월 · 다음 달 ${formatNumber(nextForecast)}개 예측`;

  return {
    summary,
    drivers,
    details,
    model: {
      name: 'Seasonal trend regression',
      seasonalPeriod: seasonalFactors.length,
      trainingWindow: `${formatDateLabel(trainingStart)} ~ ${formatDateLabel(trainingEnd)} (${historyPoints.length}개월)`,
      generatedAt: new Date().toISOString(),
      mape,
    },
  };
};

export default async function forecastRoutes(server: FastifyInstance) {
  server.get('/:productId', async (request, reply) => {
    const productIdParam = (request.params as { productId: string }).productId;
    const productId = Number(productIdParam);

    if (!Number.isFinite(productId)) {
      return reply.code(400).send({ error: 'productId 파라미터가 올바르지 않습니다.' });
    }

    const product = findForecastProduct(productId);
    if (!product) {
      return reply.code(404).send({ error: '요청한 상품의 예측 데이터를 찾지 못했습니다.' });
    }

    if (!product.history || product.history.length < 6) {
      return reply
        .code(404)
        .send({ error: '예측을 생성하기에 충분한 히스토리 데이터가 없습니다.' });
    }

    try {
      const promoMap = toPromotionMap(product);
      const model = buildSeasonalForecast(product.history, {
        horizon: 6,
        upcomingPromotions: promoMap,
      });

      const timeline = sliceTimeline(model.timeline);
      const historyPoints = timeline.filter((point) => point.phase === 'history');
      const forecastPoints = timeline.filter((point) => point.phase === 'forecast');

      const windowStart = historyPoints[0]?.date ?? model.trainingStart;
      const windowEnd = historyPoints[historyPoints.length - 1]?.date ?? model.trainingEnd;
      const outboundTotal = sum(historyPoints.map((point) => point.actual ?? 0));
      const promoOutbound = sum(historyPoints.filter((point) => point.promo).map((point) => point.actual ?? 0));
      const regularOutbound = outboundTotal - promoOutbound;
      const avgDailyDemand = historyPoints.length > 0 ? Math.round(outboundTotal / (historyPoints.length * 30)) : 0;
      const availableStock = Math.max(product.onHand - product.reserved, 0);

      const reorderPointBase = Math.round(avgDailyDemand * (product.leadTimeDays + 7) + product.safetyStock);
      const reorderPoint = Math.max(product.configuredReorderPoint, reorderPointBase);
      const recommendedOrderQty = Math.max(reorderPoint - availableStock, 0);
      const stockoutDate = estimateStockoutDate(availableStock, forecastPoints);

      const explanation = buildExplanation(
        product,
        timeline,
        model.mape,
        model.seasonalFactors,
        model.trainingStart,
        model.trainingEnd,
      );

      const response = {
        product: {
          id: product.id,
          sku: product.sku,
          name: product.name,
          safetyStock: product.safetyStock,
          leadTimeDays: product.leadTimeDays,
          configuredReorderPoint: product.configuredReorderPoint,
          onHand: product.onHand,
          reserved: product.reserved,
          availableStock,
        },
        metrics: {
          windowStart,
          windowEnd,
          outboundTotal,
          outboundReasons: {
            regular: regularOutbound,
            promo: promoOutbound,
          },
          avgDailyDemand,
          currentTotalStock: availableStock,
          reorderPoint,
          recommendedOrderQty,
          projectedStockoutDate: stockoutDate,
        },
        sampleCalculation: {
          reorderPoint: `평균 일수요 ${avgDailyDemand} × (리드타임 ${product.leadTimeDays}일 + 검토주기 7일) + 안전재고 ${product.safetyStock} ≈ ${reorderPoint}`,
          recommendedOrderQty: `max(ROP ${reorderPoint} - 가용 ${availableStock}, 0) = ${recommendedOrderQty}`,
        },
        timeline,
        explanation,
      };

      return reply.send(response);
    } catch (error) {
      request.log.error(error, 'Failed to build forecast response');
      return reply.code(500).send({ error: '수요예측 데이터를 생성하지 못했습니다.' });
    }
  });
}
