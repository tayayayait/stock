import assert from 'node:assert/strict';

import { buildServer } from '../app.js';
import { __resetWarehouseStore } from '../stores/warehousesStore.js';
import { __resetLocationStore } from '../stores/locationsStore.js';
import { __resetInventoryStore } from '../stores/inventoryStore.js';
import { __resetProductStore } from '../routes/products.js';

async function main() {
  __resetInventoryStore();
  __resetProductStore(false);
  __resetLocationStore(false);
  __resetWarehouseStore(false);

  const server = await buildServer();

  try {
    await server.inject({
      method: 'POST',
      url: '/api/warehouses',
      payload: { code: 'WH-A', name: '테스트 A', address: '서울시 A로 1' },
    });
    await server.inject({
      method: 'POST',
      url: '/api/warehouses',
      payload: { code: 'WH-B', name: '테스트 B', address: '부산시 B로 2' },
    });

    const initialList = await server.inject({ method: 'GET', url: '/api/locations' });
    assert.equal(initialList.statusCode, 200);
    const initialBody = initialList.json() as any;
    assert.equal(initialBody.count, 0);

    const invalidCreate = await server.inject({
      method: 'POST',
      url: '/api/locations',
      payload: { code: 'LOC-INVALID', warehouseCode: 'WH-X', description: '잘못된 창고' },
    });
    assert.equal(invalidCreate.statusCode, 400);

    const createResponse = await server.inject({
      method: 'POST',
      url: '/api/locations',
      payload: { code: 'LOC-A1', warehouseCode: 'WH-A', description: 'A 존 1' },
    });
    assert.equal(createResponse.statusCode, 201);

    const duplicateResponse = await server.inject({
      method: 'POST',
      url: '/api/locations',
      payload: { code: 'LOC-A1', warehouseCode: 'WH-A', description: '중복' },
    });
    assert.equal(duplicateResponse.statusCode, 409);

    const productCreate = await server.inject({
      method: 'POST',
      url: '/api/products',
      payload: {
        sku: 'LOC-PROD',
        name: '로케이션 테스트 상품',
        category: '카테고리',
        subCategory: '소분류',
        unit: 'EA',
        packCase: '1/1',
        pack: 1,
        casePack: 1,
        abcGrade: 'A',
        xyzGrade: 'X',
        bufferRatio: 0.1,
        dailyAvg: 5,
        dailyStd: 2,
        isActive: true,
        risk: '정상',
        inventory: [{ warehouseCode: 'WH-A', locationCode: 'LOC-A1', onHand: 50, reserved: 5 }],
      },
    });
    assert.equal(productCreate.statusCode, 201);

    const getResponse = await server.inject({ method: 'GET', url: '/api/locations/LOC-A1' });
    assert.equal(getResponse.statusCode, 200);
    const getBody = getResponse.json() as any;
    assert.equal(getBody.item.warehouseCode, 'WH-A');

    const filteredList = await server.inject({ method: 'GET', url: '/api/locations?warehouseCode=WH-A' });
    assert.equal(filteredList.statusCode, 200);
    const filteredBody = filteredList.json() as any;
    assert.equal(filteredBody.count, 1);

    const updateResponse = await server.inject({
      method: 'PUT',
      url: '/api/locations/LOC-A1',
      payload: { code: 'LOC-A1', warehouseCode: 'WH-B', description: 'B 존으로 이동' },
    });
    assert.equal(updateResponse.statusCode, 200);
    const updateBody = updateResponse.json() as any;
    assert.equal(updateBody.item.warehouseCode, 'WH-B');

    const productAfterMove = await server.inject({ method: 'GET', url: '/api/products/LOC-PROD' });
    assert.equal(productAfterMove.statusCode, 200);
    const productBody = productAfterMove.json() as any;
    assert.equal(productBody.item.inventory[0].warehouseCode, 'WH-B');

    const renameResponse = await server.inject({
      method: 'PUT',
      url: '/api/locations/LOC-A1',
      payload: { code: 'LOC-B1', warehouseCode: 'WH-B', description: 'B 존 코드 변경' },
    });
    assert.equal(renameResponse.statusCode, 200);
    const renameBody = renameResponse.json() as any;
    assert.equal(renameBody.item.code, 'LOC-B1');
    assert.equal(renameBody.item.description, 'B 존 코드 변경');

    const oldLocation = await server.inject({ method: 'GET', url: '/api/locations/LOC-A1' });
    assert.equal(oldLocation.statusCode, 404);

    const newLocation = await server.inject({ method: 'GET', url: '/api/locations/LOC-B1' });
    assert.equal(newLocation.statusCode, 200);
    const newLocationBody = newLocation.json() as any;
    assert.equal(newLocationBody.item.warehouseCode, 'WH-B');

    const productAfterRename = await server.inject({ method: 'GET', url: '/api/products/LOC-PROD' });
    assert.equal(productAfterRename.statusCode, 200);
    const productAfterRenameBody = productAfterRename.json() as any;
    assert.equal(productAfterRenameBody.item.inventory[0].locationCode, 'LOC-B1');
    assert.equal(productAfterRenameBody.item.inventory[0].warehouseCode, 'WH-B');

    const deleteResponse = await server.inject({
      method: 'DELETE',
      url: '/api/locations/LOC-B1',
    });
    assert.equal(deleteResponse.statusCode, 204);

    const afterDelete = await server.inject({ method: 'GET', url: '/api/locations' });
    assert.equal(afterDelete.statusCode, 200);
    const afterDeleteBody = afterDelete.json() as any;
    assert.equal(afterDeleteBody.count, 0);

    const productAfterDelete = await server.inject({ method: 'GET', url: '/api/products/LOC-PROD' });
    assert.equal(productAfterDelete.statusCode, 200);
    const productAfterDeleteBody = productAfterDelete.json() as any;
    assert.equal(productAfterDeleteBody.item.onHand, 0);
    assert.equal(productAfterDeleteBody.item.inventory.length, 0);
  } finally {
    await server.close();
    __resetProductStore();
    __resetInventoryStore();
    __resetLocationStore();
    __resetWarehouseStore();
  }
}

await main();
