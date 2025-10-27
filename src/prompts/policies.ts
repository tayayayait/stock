import { type Product } from '../domains/products';
import { type PolicyDraft } from '../services/policies';

interface PolicyPromptContext {
  product: Product;
  policy: Pick<PolicyDraft, 'forecastDemand' | 'demandStdDev' | 'leadTimeDays' | 'serviceLevelPercent'>;
}

const formatValue = (value: number | null | undefined): string => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'N/A';
  }
  return Number(value).toString();
};

export const buildPolicyRecommendationPrompt = ({ product, policy }: PolicyPromptContext): string => {
  const lines: string[] = [
    `SKU: ${product.sku}`,
    `상품명: ${product.name}`,
    `카테고리: ${product.category || '미지정'}`,
    `하위 카테고리: ${product.subCategory || '미지정'}`,
    `일 평균 판매량: ${formatValue(product.dailyAvg)}`,
    `일별 수요 표준편차: ${formatValue(product.dailyStd)}`,
    `가용 재고: ${formatValue(product.onHand)}`,
    '',
    '[현재 정책]',
    `예측 수요량: ${formatValue(policy.forecastDemand)}`,
    `수요 표준편차: ${formatValue(policy.demandStdDev)}`,
    `리드타임(일): ${formatValue(policy.leadTimeDays)}`,
    `서비스 수준(%): ${formatValue(policy.serviceLevelPercent)}`,
    '',
    'LLM이 제공된 데이터를 참고해 예측 수요량, 수요 표준편차, 리드타임, 서비스 수준에 대한 추천 값을 제시하고, 필요한 경우 안전재고와 재주문점 계산을 함께 고려해주세요.',
    '추천 결과는 JSON 형태로 제공하며 필드는 forecastDemand, demandStdDev, leadTimeDays, serviceLevelPercent, sigmaL 입니다.',
  ];

  return lines.join('\n');
};

