import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { buildServer } from '../app.js';
import { __resetProductStore } from '../routes/products.js';

const EXISTING_SKU = 'CSV-EXIST-001';
const PRODUCTS_CSV = `sku,name,category,abcGrade,xyzGrade,dailyAvg,dailyStd,onHand,reserved\nNEW-001,신규 상품,스낵,A,X,12,3,0,0\n${EXISTING_SKU},CSV 업데이트 상품,간편식품,B,Y,24,6,480,30`;
const LOCALIZED_PRODUCTS_CSV = `상품코드,상품명,카테고리,ABC등급,XYZ등급,월평균출고,수요표준편차,현재고,예약\nAUTO-001,현지 상품,즉석식품,A,X,30,5,120,10`;

describe('CSV upload routes', () => {
  let server: Awaited<ReturnType<typeof buildServer>>;

  beforeEach(async () => {
    __resetProductStore(false);
    server = await buildServer();

    const createResponse = await server.inject({
      method: 'POST',
      url: '/api/products',
      payload: {
        sku: EXISTING_SKU,
        name: 'CSV 업데이트 상품',
        category: '간편식품',
        abcGrade: 'B',
        xyzGrade: 'Y',
        dailyAvg: 18,
        dailyStd: 4,
        totalInbound: 480,
        totalOutbound: 420,
        avgOutbound7d: 16,
        inventory: [
          { warehouseCode: 'WH-SEOUL', locationCode: 'SEOUL-A1', onHand: 240, reserved: 20 },
        ],
      },
    });
    expect(createResponse.statusCode).toBe(201);
  });

  afterEach(async () => {
    await server.close();
    __resetProductStore(true);
  });

  test('returns preview summary for product CSV', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/csv/upload?type=products',
      payload: { stage: 'preview', content: PRODUCTS_CSV },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json();

    expect(payload).toHaveProperty('previewId');
    expect(payload.summary).toMatchObject({
      total: 2,
      newCount: 1,
      updateCount: 1,
      errorCount: 0,
    });
  });

  test('auto-detects product CSV headers with localized labels', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/csv/upload',
      payload: { stage: 'preview', content: LOCALIZED_PRODUCTS_CSV },
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json() as {
      type: string;
      columnMappings: Array<{ original: string; canonical: string | null }>;
      warnings?: string[];
    };

    expect(payload.type).toBe('products');
    expect(Array.isArray(payload.columnMappings)).toBe(true);
    const canonicalFields = payload.columnMappings?.map((mapping) => mapping.canonical).filter(Boolean) ?? [];
    expect(canonicalFields).toEqual(
      expect.arrayContaining(['sku', 'name', 'category', 'abcGrade', 'xyzGrade', 'dailyAvg', 'dailyStd', 'onHand', 'reserved']),
    );
    expect(payload.warnings ?? []).toEqual([]);
  });

  test('queues a job for commit and processes rows', async () => {
    const previewResponse = await server.inject({
      method: 'POST',
      url: '/api/csv/upload?type=products',
      payload: { stage: 'preview', content: PRODUCTS_CSV },
    });

    const { previewId } = previewResponse.json();
    expect(typeof previewId).toBe('string');

    const commitResponse = await server.inject({
      method: 'POST',
      url: '/api/csv/upload?type=products',
      payload: { stage: 'commit', previewId },
    });

    expect(commitResponse.statusCode).toBe(200);
    const commitPayload = commitResponse.json();
    expect(commitPayload).toHaveProperty('job');
    const { job } = commitPayload as { job: { id: string } };

    let attempts = 0;
    let statusPayload: any = null;
    while (attempts < 40) {
      // eslint-disable-next-line no-await-in-loop -- intentional polling
      const statusResponse = await server.inject({
        method: 'GET',
        url: `/api/csv/jobs/${job.id}`,
      });
      statusPayload = statusResponse.json();
      if (statusPayload.job.status === 'completed') {
        break;
      }
      attempts += 1;
      // eslint-disable-next-line no-await-in-loop -- intentional polling delay
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    expect(statusPayload.job.status).toBe('completed');
    expect(statusPayload.job.summary).toMatchObject({ newCount: 1, updateCount: 1, errorCount: 0 });

    const errorDownload = await server.inject({
      method: 'GET',
      url: `/api/csv/jobs/${job.id}/errors`,
    });

    expect(errorDownload.statusCode === 204 || errorDownload.statusCode === 200).toBe(true);
  });
});
