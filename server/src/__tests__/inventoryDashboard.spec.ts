import assert from 'node:assert/strict';

import { buildServer } from '../app.js';
import { __resetMovementStore } from '../routes/movements.js';
import { __resetProductStore } from '../routes/products.js';
import { __resetInventoryStore } from '../stores/inventoryStore.js';
import { __resetWarehouseStore } from '../stores/warehousesStore.js';
import { __resetLocationStore } from '../stores/locationsStore.js';

type DashboardResponse = {
  generatedAt: string;
  summary: {
    skuCount: number;
    totalOnHand: number;
    totalReserved: number;
    totalAvailable: number;
  };
  warehouseTotals: Array<{ warehouseCode: string; onHand: number; reserved: number; available: number }>;
  movementHistory: Array<{ date: string; inbound: number; outbound: number }>;
  insights: {
    shortages: Array<{
      sku: string;
      primaryLocation: string | null;
      trend: number[];
    }>;
  };
};

async function main() {
  __resetMovementStore();
  __resetProductStore(false);
  __resetInventoryStore();
  __resetWarehouseStore();
  __resetLocationStore();

  const server = await buildServer();

  try {
    const emptyResponse = await server.inject({
      method: 'GET',
      url: '/api/inventory/dashboard',
    });
    assert.equal(emptyResponse.statusCode, 200);

    const emptyBody = emptyResponse.json() as DashboardResponse;
    assert.equal(emptyBody.summary.skuCount, 0);
    assert.equal(emptyBody.summary.totalOnHand, 0);
    assert.equal(emptyBody.summary.totalReserved, 0);
    assert.equal(emptyBody.warehouseTotals.length, 0);
    assert.equal(emptyBody.movementHistory.length, 0);

    const productPayload = {
      sku: 'SKU-COFFEE',
      name: '콜드브루',
      category: '음료',
      subCategory: '콜드',
      unit: 'EA',
      packCase: '1/1',
      pack: 1,
      casePack: 1,
      abcGrade: 'A' as const,
      xyzGrade: 'X' as const,
      bufferRatio: 0.2,
      dailyAvg: 10,
      dailyStd: 4,
      totalInbound: 120,
      totalOutbound: 80,
      avgOutbound7d: 12,
      isActive: true,
      onHand: 0,
      reserved: 0,
      risk: '결품위험' as const,
      inventory: [
        { warehouseCode: 'WH-SEOUL', locationCode: 'SEOUL-A1', onHand: 50, reserved: 5 },
      ],
    };

    const createProductResponse = await server.inject({
      method: 'POST',
      url: '/api/products',
      payload: productPayload,
    });
    assert.equal(createProductResponse.statusCode, 201);

    const ghostMovementResponse = await server.inject({
      method: 'POST',
      url: '/api/movements',
      payload: {
        type: 'RECEIPT',
        sku: 'SKU-GHOST',
        qty: 20,
        toWarehouse: 'WH-BUSAN',
        toLocation: 'BUSAN-A1',
        userId: 'tester',
        occurredAt: new Date().toISOString(),
      },
    });
    assert.equal(ghostMovementResponse.statusCode, 201);

    const populatedResponse = await server.inject({
      method: 'GET',
      url: '/api/inventory/dashboard',
    });
    assert.equal(populatedResponse.statusCode, 200);

    const body = populatedResponse.json() as DashboardResponse;

    assert.equal(body.summary.skuCount, 1);
    assert.equal(body.summary.totalOnHand, 50);
    assert.equal(body.summary.totalReserved, 5);
    assert.ok(body.summary.totalAvailable <= body.summary.totalOnHand);

    const inboundSum = body.movementHistory.reduce((sum, point) => sum + point.inbound, 0);
    const outboundSum = body.movementHistory.reduce((sum, point) => sum + point.outbound, 0);
    assert.equal(inboundSum, 0);
    assert.equal(outboundSum, 0);

    assert.ok(body.warehouseTotals.length <= 1);
    if (body.warehouseTotals.length === 1) {
      const [warehouse] = body.warehouseTotals;
      assert.equal(warehouse.warehouseCode, 'WH-SEOUL');
      assert.equal(warehouse.onHand, 50);
      assert.equal(warehouse.reserved, 5);
    }

    assert.ok(Array.isArray(body.insights.shortages));
    assert.ok(body.insights.shortages.length > 0);
    const [shortage] = body.insights.shortages;
    assert.equal(shortage.sku, 'SKU-COFFEE');
    assert.equal(shortage.primaryLocation, 'SEOUL-A1');
    assert.ok(Array.isArray(shortage.trend));
    assert.ok(shortage.trend.length >= 2);

    assert.ok(
      body.warehouseTotals.every((entry) => entry.warehouseCode !== 'WH-BUSAN'),
      'Warehouse totals should not include SKUs without products',
    );

    const issueMovementResponse = await server.inject({
      method: 'POST',
      url: '/api/movements',
      payload: {
        type: 'ISSUE',
        sku: 'SKU-COFFEE',
        qty: 5,
        fromWarehouse: 'WH-SEOUL',
        fromLocation: 'SEOUL-A1',
        userId: 'tester',
        occurredAt: new Date().toISOString(),
      },
    });
    assert.equal(issueMovementResponse.statusCode, 201);

    const toDate = new Date();
    const toISO = toDate.toISOString().slice(0, 10);
    const fromDate = new Date(`${toISO}T00:00:00.000Z`);
    fromDate.setUTCDate(fromDate.getUTCDate() - 6);
    const fromISO = fromDate.toISOString().slice(0, 10);

    const analysisResponse = await server.inject({
      method: 'GET',
      url: `/api/inventory/analysis?from=${fromISO}&to=${toISO}&warehouseCode=WH-SEOUL`,
    });
    assert.equal(analysisResponse.statusCode, 200);

    const analysisBody = analysisResponse.json() as {
      range: { dayCount: number; groupBy: string };
      movementSeries: Array<{ date: string; inbound: number; outbound: number; adjustments: number }>;
      stockSeries: Array<{ date: string; onHand: number; available: number }>;
      periodSeries: Array<{ label: string }>;
      totals: { currentOnHand: number; stockoutEtaDays: number | null };
    };
    assert.ok(Array.isArray(analysisBody.movementSeries));
    assert.equal(analysisBody.movementSeries.length, analysisBody.range.dayCount);
    assert.equal(analysisBody.stockSeries.length, analysisBody.range.dayCount);
    assert.ok(analysisBody.periodSeries.length >= 1);
    assert.ok(
      analysisBody.range.groupBy === 'week' || analysisBody.range.groupBy === 'month',
      'groupBy should be week or month',
    );
    assert.ok(Number.isFinite(analysisBody.totals.currentOnHand));

    const analysisWithSkuResponse = await server.inject({
      method: 'GET',
      url: `/api/inventory/analysis?from=${fromISO}&to=${toISO}&warehouseCode=WH-SEOUL&sku=SKU-COFFEE`,
    });
    assert.equal(analysisWithSkuResponse.statusCode, 200);

    const analysisWithSkuBody = analysisWithSkuResponse.json() as {
      scope: { warehouseCode: string | null; sku: string | null };
      range: { dayCount: number };
      movementSeries: Array<{ date: string; inbound: number; outbound: number; adjustments: number }>;
      stockSeries: Array<{ date: string; onHand: number; available: number; safetyStock: number }>;
    };
    assert.equal(analysisWithSkuBody.scope.warehouseCode, 'WH-SEOUL');
    assert.equal(analysisWithSkuBody.scope.sku, 'SKU-COFFEE');
    assert.equal(analysisWithSkuBody.movementSeries.length, analysisWithSkuBody.range.dayCount);
    assert.equal(analysisWithSkuBody.stockSeries.length, analysisWithSkuBody.range.dayCount);
    assert.ok(
      analysisWithSkuBody.stockSeries.every(
        (point) =>
          Number.isFinite(point.onHand) &&
          Number.isFinite(point.available) &&
          Number.isFinite(point.safetyStock),
      ),
    );

    const warehouseItemsResponse = await server.inject({
      method: 'GET',
      url: `/api/inventory/warehouse-items?from=${fromISO}&to=${toISO}&warehouseCode=WH-SEOUL`,
    });
    assert.equal(warehouseItemsResponse.statusCode, 200);

    const warehouseItemsBody = warehouseItemsResponse.json() as {
      items: Array<{ sku: string }>;
      movementSeries: Array<unknown>;
    };
    assert.ok(Array.isArray(warehouseItemsBody.items));
    assert.equal(warehouseItemsBody.movementSeries.length, analysisBody.range.dayCount);
    assert.ok(
      warehouseItemsBody.items.some((item) => item.sku === 'SKU-COFFEE'),
      'warehouse items should include the seeded SKU',
    );
  } finally {
    await server.close();
    __resetMovementStore();
    __resetProductStore();
    __resetInventoryStore();
    __resetWarehouseStore();
    __resetLocationStore();
  }
}

await main();
