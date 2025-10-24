import { http, HttpResponse } from 'msw';

import collections from './index';
import { productCatalog } from './products';

const resources = [
  { path: '/api/sales', key: 'sales', label: '판매', data: collections.sales },
  { path: '/api/packages', key: 'packages', label: '패키지', data: collections.packages },
  { path: '/api/reports', key: 'reports', label: '리포트', data: collections.reports },
] as const;

function shouldInjectError(request: Request): boolean {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get('error') !== '1') {
      return false;
    }

    return Math.random() < 0.1;
  } catch {
    return false;
  }
}

function buildErrorResponse(label: string) {
  return HttpResponse.json(
    {
      message: `${label} 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.`,
    },
    { status: 500 },
  );
}

function buildSuccessResponse(key: string, data: unknown) {
  if (Array.isArray(data)) {
    return HttpResponse.json({ [key]: data, total: data.length });
  }

  return HttpResponse.json({ [key]: data });
}

const resourceHandlers = resources.map(({ path, key, label, data }) =>
  http.get(path, ({ request }) => {
    if (shouldInjectError(request)) {
      return buildErrorResponse(label);
    }

    return buildSuccessResponse(key, data);
  }),
);

export const handlers = [
  ...resourceHandlers,
  http.get('/api/products', ({ request }) => {
    if (shouldInjectError(request)) {
      return buildErrorResponse('상품');
    }

    return HttpResponse.json(productCatalog);
  }),
];

export default handlers;
