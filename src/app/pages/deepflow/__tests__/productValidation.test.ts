import { describe, expect, it } from 'vitest';

import { createEmptyProduct } from '../../../../domains/products';
import { extractFirstDetail, validateProductDraft } from '../productValidation';

const buildProduct = () => ({
  ...createEmptyProduct(),
  sku: 'SKU-VALID',
  name: '테스트 상품',
  category: '가공식품',
  unit: 'EA',
});

describe('validateProductDraft', () => {
  it('returns null when required fields are present', () => {
    const product = buildProduct();
    expect(validateProductDraft(product)).toBeNull();
  });

  it('requires a category', () => {
    const product = buildProduct();
    product.category = '   ';
    expect(validateProductDraft(product)).toBe('카테고리를 선택해 주세요.');
  });

  it('requires a valid unit', () => {
    const product = buildProduct();
    product.unit = ' '; // blank
    expect(validateProductDraft(product)).toBe('유효한 단위를 선택해 주세요.');

    product.unit = 'ZZ';
    expect(validateProductDraft(product)).toBe('유효한 단위를 선택해 주세요.');
  });

});

describe('extractFirstDetail', () => {
  it('returns the first detail string when available', () => {
    expect(extractFirstDetail({ details: ['첫 번째 오류', '두 번째 오류'] })).toBe('첫 번째 오류');
  });

  it('ignores empty values and trims the message', () => {
    expect(extractFirstDetail({ details: ['  ', ' 상세 오류 '] })).toBe('상세 오류');
  });

  it('returns null when no usable detail is found', () => {
    expect(extractFirstDetail({})).toBeNull();
    expect(extractFirstDetail({ details: [] })).toBeNull();
    expect(extractFirstDetail(null)).toBeNull();
  });
});
