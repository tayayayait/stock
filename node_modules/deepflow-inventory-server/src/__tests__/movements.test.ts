import assert from 'node:assert/strict';

import { buildServer } from '../app.js';
import { __resetMovementStore } from '../routes/movements.js';
import { __resetProductStore } from '../routes/products.js';
import { __resetInventoryStore } from '../stores/inventoryStore.js';
import { __resetWarehouseStore } from '../stores/warehousesStore.js';
import { __resetLocationStore } from '../stores/locationsStore.js';

async function main() {
  __resetMovementStore();
  __resetProductStore(false);
  __resetInventoryStore();
  __resetWarehouseStore();
  __resetLocationStore();

  const server = await buildServer();

  try {
    const trackedSku = 'SYNC-PROD-001';
    const productResponse = await server.inject({
      method: 'POST',
      url: '/api/products',
      payload: {
        sku: trackedSku,
        name: '?¬ê³  ?™ê¸°???€???í’ˆ',
        category: '?ŒìŠ¤??ì¹´í…Œê³ ë¦¬',
        abcGrade: 'A',
        xyzGrade: 'X',
        dailyAvg: 10,
        dailyStd: 3,
        totalInbound: 0,
        totalOutbound: 0,
        avgOutbound7d: 0,
        inventory: [
          {
            warehouseCode: 'WH-SEOUL',
            locationCode: 'SEOUL-A1',
            onHand: 0,
            reserved: 0,
          },
        ],
      },
    });
    assert.equal(productResponse.statusCode, 201);

    const receiptPayload = {
      type: 'RECEIPT',
      sku: 'SKU-01',
      qty: 100,
      toWarehouse: 'WH-SEOUL',
      toLocation: 'SEOUL-A1',
      occurredAt: '2024-05-01T10:00:00.000Z',
      userId: 'user-1',
      memo: 'ì²??…ê³ ',
    } as const;

    const receiptResponse = await server.inject({
      method: 'POST',
      url: '/api/movements',
      payload: receiptPayload,
    });
    assert.equal(receiptResponse.statusCode, 201);
    const receiptBody = receiptResponse.json() as any;
    assert.equal(receiptBody.movement.type, 'RECEIPT');
    assert.equal(receiptBody.movement.qty, receiptPayload.qty);
    assert.equal(receiptBody.balances.length, 1);
    assert.equal(receiptBody.balances[0].qty, 100);
    assert.equal(receiptBody.balances[0].warehouse, receiptPayload.toWarehouse);
    assert.equal(receiptBody.inventory.totalOnHand, 100);

    const issuePayload = {
      type: 'ISSUE',
      sku: 'SKU-01',
      qty: 40,
      fromWarehouse: 'WH-SEOUL',
      fromLocation: 'SEOUL-A1',
      occurredAt: '2024-05-02T08:00:00.000Z',
      userId: 'user-2',
      refNo: 'ORDER-1',
    } as const;

    const issueResponse = await server.inject({
      method: 'POST',
      url: '/api/movements',
      payload: issuePayload,
    });
    assert.equal(issueResponse.statusCode, 201);
    const issueBody = issueResponse.json() as any;
    assert.equal(issueBody.movement.type, 'ISSUE');
    assert.equal(issueBody.balances[0].qty, 60);

    const transferPayload = {
      type: 'TRANSFER',
      sku: 'SKU-01',
      qty: 20,
      fromWarehouse: 'WH-SEOUL',
      fromLocation: 'SEOUL-A1',
      toWarehouse: 'WH-BUSAN',
      toLocation: 'BUSAN-A1',
      occurredAt: '2024-05-03T09:00:00.000Z',
      userId: 'user-3',
      partnerId: '3PL-01',
    } as const;

    const transferResponse = await server.inject({
      method: 'POST',
      url: '/api/movements',
      payload: transferPayload,
    });
    assert.equal(transferResponse.statusCode, 201);
    const transferBody = transferResponse.json() as any;
    assert.equal(transferBody.balances.length, 2);
    assert.equal(transferBody.balances[0].qty, 40);
    assert.equal(transferBody.balances[1].qty, 20);

    const adjustPayload = {
      type: 'ADJUST',
      sku: 'SKU-01',
      qty: 15,
      toWarehouse: 'WH-BUSAN',
      toLocation: 'BUSAN-A1',
      occurredAt: '2024-05-04T11:30:00.000Z',
      userId: 'auditor',
    } as const;

    const adjustResponse = await server.inject({
      method: 'POST',
      url: '/api/movements',
      payload: adjustPayload,
    });
    assert.equal(adjustResponse.statusCode, 201);
    const adjustBody = adjustResponse.json() as any;
    assert.equal(adjustBody.balances[0].qty, 15);

    const insufficientResponse = await server.inject({
      method: 'POST',
      url: '/api/movements',
      payload: {
        type: 'ISSUE',
        sku: 'SKU-01',
        qty: 999,
        fromWarehouse: 'WH-SEOUL',
        userId: 'user-4',
      },
    });
    assert.equal(insufficientResponse.statusCode, 409);

    const transferList = await server.inject({ method: 'GET', url: '/api/movements?type=TRANSFER' });
    assert.equal(transferList.statusCode, 200);
    const transferListBody = transferList.json() as any;
    assert.equal(transferListBody.count, 1);
    assert.equal(transferListBody.items[0].type, 'TRANSFER');

    const warehouseList = await server.inject({ method: 'GET', url: '/api/movements?warehouse=WH-BUSAN' });
    assert.equal(warehouseList.statusCode, 200);
    const warehouseBody = warehouseList.json() as any;
    assert.ok(warehouseBody.items.length >= 2);
    assert.ok(warehouseBody.balances.length >= 2);
    const whB = warehouseBody.balances.find((item: any) => item.warehouse === 'WH-BUSAN');
    assert.ok(whB);
    assert.equal(whB.qty, 15);

    const initialProduct = await server.inject({ method: 'GET', url: `/api/products/${trackedSku}` });
    assert.equal(initialProduct.statusCode, 200);
    const initialProductBody = initialProduct.json() as any;
    const initialOnHand = initialProductBody.item.onHand;
    const initialInbound = initialProductBody.item.totalInbound;
    const initialLocation = initialProductBody.item.inventory.find(
      (entry: any) => entry.locationCode === 'SEOUL-A1',
    );
    assert.ok(initialLocation);

    const productMovement = await server.inject({
      method: 'POST',
      url: '/api/movements',
      payload: {
        type: 'RECEIPT',
        sku: trackedSku,
        qty: 75,
        toWarehouse: 'WH-SEOUL',
        toLocation: 'SEOUL-A1',
        userId: 'inventory-sync-test',
      },
    });
    assert.equal(productMovement.statusCode, 201);
    const productMovementBody = productMovement.json() as any;
    assert.equal(productMovementBody.inventory.totalOnHand, initialOnHand + 75);

    const refreshedProduct = await server.inject({
      method: 'GET',
      url: `/api/products/${trackedSku}`,
    });
    assert.equal(refreshedProduct.statusCode, 200);
    const refreshedBody = refreshedProduct.json() as any;
    assert.equal(refreshedBody.item.onHand, initialOnHand + 75);
    const refreshedLocation = refreshedBody.item.inventory.find(
      (entry: any) => entry.locationCode === 'SEOUL-A1',
    );
    assert.ok(refreshedLocation);
    assert.equal(refreshedLocation.onHand, initialLocation.onHand + 75);
    assert.equal(refreshedBody.item.totalInbound, initialInbound + 75);
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


