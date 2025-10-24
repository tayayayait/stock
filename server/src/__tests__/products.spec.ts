import assert from 'node:assert/strict';

import { buildServer } from '../app.js';
import { __resetProductStore } from '../routes/products.js';
import { __resetWarehouseStore } from '../stores/warehousesStore.js';
import { __resetLocationStore } from '../stores/locationsStore.js';
import { __resetInventoryStore } from '../stores/inventoryStore.js';

async function main() {
  __resetWarehouseStore(false);
  __resetLocationStore(false);
  __resetInventoryStore();
  __resetProductStore(false);

  const server = await buildServer();

  try {
    const wh1 = await server.inject({
      method: 'POST',
      url: '/api/warehouses',
      payload: { code: 'WH-T1', name: '테스트 물류센터 1', address: '서울시 테스트로 1' },
    });
    assert.equal(wh1.statusCode, 201);

    const wh2 = await server.inject({
      method: 'POST',
      url: '/api/warehouses',
      payload: { code: 'WH-T2', name: '테스트 물류센터 2', address: '부산시 테스트로 2' },
    });
    assert.equal(wh2.statusCode, 201);

    const loc1 = await server.inject({
      method: 'POST',
      url: '/api/locations',
      payload: { code: 'LOC-T1-A', warehouseCode: 'WH-T1', description: '테스트 존 A' },
    });
    assert.equal(loc1.statusCode, 201);

    const loc2 = await server.inject({
      method: 'POST',
      url: '/api/locations',
      payload: { code: 'LOC-T2-B', warehouseCode: 'WH-T2', description: '테스트 존 B' },
    });
    assert.equal(loc2.statusCode, 201);

    const loc3 = await server.inject({
      method: 'POST',
      url: '/api/locations',
      payload: { code: 'LOC-T2-C', warehouseCode: 'WH-T2', description: '테스트 존 C' },
    });
    assert.equal(loc3.statusCode, 201);

    const payload = {
      sku: 'SKU-001',
      name: '테스트 제품',
      category: '테스트 카테고리',
      subCategory: '테스트 소분류',
      brand: '테스트 브랜드',
      unit: 'EA',
      packCase: '4/12',
      pack: 4,
      casePack: 12,
      abcGrade: 'A',
      xyzGrade: 'X',
      bufferRatio: 0.2,
      dailyAvg: 18,
      dailyStd: 5,
      totalInbound: 820,
      totalOutbound: 760,
      avgOutbound7d: 22,
      isActive: true,
      risk: '정상',
      expiryDays: 120,
      inventory: [
        { warehouseCode: 'WH-T1', locationCode: 'LOC-T1-A', onHand: 120, reserved: 20 },
        { warehouseCode: 'WH-T2', locationCode: 'LOC-T2-B', onHand: 80, reserved: 10 },
      ],
    } as const;

    const createResponse = await server.inject({
      method: 'POST',
      url: '/api/products',
      payload,
    });
    assert.equal(createResponse.statusCode, 201);
    const createdBody = createResponse.json() as any;
    assert.equal(createdBody.item.sku, payload.sku);
    assert.equal(createdBody.item.onHand, 200);
    assert.equal(createdBody.item.reserved, 30);
    assert.equal(createdBody.item.inventory.length, 2);
    assert.equal(createdBody.item.brand, payload.brand);
    assert.equal(createdBody.item.expiryDays, payload.expiryDays);
    assert.equal(createdBody.item.totalInbound, payload.totalInbound);
    assert.equal(createdBody.item.totalOutbound, payload.totalOutbound);
    assert.equal(createdBody.item.avgOutbound7d, payload.avgOutbound7d);

    const listResponse = await server.inject({ method: 'GET', url: '/api/products' });
    assert.equal(listResponse.statusCode, 200);
    const listBody = listResponse.json() as any;
    assert.equal(listBody.count, 1);
    assert.equal(listBody.items[0].inventory.length, 2);

    const searchResponse = await server.inject({
      method: 'GET',
      url: `/api/products?q=${encodeURIComponent('테스트 카테고리')}`,
    });
    assert.equal(searchResponse.statusCode, 200);
    const searchBody = searchResponse.json() as any;
    assert.equal(searchBody.count, 1);
    assert.equal(searchBody.items[0].onHand, 200);

    const duplicateResponse = await server.inject({
      method: 'POST',
      url: '/api/products',
      payload,
    });
    assert.equal(duplicateResponse.statusCode, 409);

    const { brand: _brand, expiryDays: _expiryDays, ...baseUpdate } = payload;
    const updatePayload = {
      ...baseUpdate,
      bufferRatio: 0.35,
      totalInbound: 960,
      totalOutbound: 880,
      avgOutbound7d: 24,
      inventory: [
        { warehouseCode: 'WH-T1', locationCode: 'LOC-T1-A', onHand: 140, reserved: 30 },
        { warehouseCode: 'WH-T2', locationCode: 'LOC-T2-C', onHand: 60, reserved: 0 },
      ],
    } as const;

    const updateResponse = await server.inject({
      method: 'PUT',
      url: `/api/products/${payload.sku}`,
      payload: updatePayload,
    });
    assert.equal(updateResponse.statusCode, 200);
    const updatedBody = updateResponse.json() as any;
    assert.equal(updatedBody.item.brand, payload.brand);
    assert.equal(updatedBody.item.expiryDays, payload.expiryDays);
    assert.equal(updatedBody.item.onHand, 200);
    assert.equal(updatedBody.item.reserved, 30);
    assert.equal(updatedBody.item.inventory.length, 2);
    assert.equal(updatedBody.item.inventory[1].locationCode, 'LOC-T2-C');
    assert.equal(updatedBody.item.totalInbound, updatePayload.totalInbound);
    assert.equal(updatedBody.item.totalOutbound, updatePayload.totalOutbound);
    assert.equal(updatedBody.item.avgOutbound7d, updatePayload.avgOutbound7d);

    const getResponse = await server.inject({
      method: 'GET',
      url: `/api/products/${payload.sku}`,
    });
    assert.equal(getResponse.statusCode, 200);
    const getBody = getResponse.json() as any;
    assert.equal(getBody.item.inventory[0].onHand, 140);
    assert.equal(getBody.item.totalInbound, updatePayload.totalInbound);
    assert.equal(getBody.item.totalOutbound, updatePayload.totalOutbound);
    assert.equal(getBody.item.avgOutbound7d, updatePayload.avgOutbound7d);

    const deleteResponse = await server.inject({
      method: 'DELETE',
      url: `/api/products/${payload.sku}`,
    });
    assert.equal(deleteResponse.statusCode, 204);

    const afterDelete = await server.inject({ method: 'GET', url: '/api/products' });
    assert.equal(afterDelete.statusCode, 200);
    const afterDeleteBody = afterDelete.json() as any;
    assert.equal(afterDeleteBody.count, 0);
    assert.deepEqual(afterDeleteBody.items, []);
  } finally {
    await server.close();
    __resetProductStore();
    __resetInventoryStore();
    __resetLocationStore();
    __resetWarehouseStore();
  }
}

await main();
