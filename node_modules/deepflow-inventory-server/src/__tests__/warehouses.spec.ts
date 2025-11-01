import assert from 'node:assert/strict';

import { buildServer } from '../app.js';
import { __resetWarehouseStore } from '../stores/warehousesStore.js';
import { __resetLocationStore } from '../stores/locationsStore.js';
import { __resetInventoryStore } from '../stores/inventoryStore.js';

async function main() {
  __resetInventoryStore();
  __resetLocationStore(false);
  __resetWarehouseStore(false);

  const server = await buildServer();

  try {
    const initialList = await server.inject({ method: 'GET', url: '/api/warehouses' });
    assert.equal(initialList.statusCode, 200);
    const initialBody = initialList.json() as any;
    assert.equal(initialBody.count, 0);

    const createResponse = await server.inject({
      method: 'POST',
      url: '/api/warehouses',
      payload: { code: 'WH-TEST', name: '테스트 센터', address: '서울시 테스트로 10' },
    });
    assert.equal(createResponse.statusCode, 201);

    const duplicateResponse = await server.inject({
      method: 'POST',
      url: '/api/warehouses',
      payload: { code: 'WH-TEST', name: '중복 센터', address: '서울시 다른로 11' },
    });
    assert.equal(duplicateResponse.statusCode, 409);

    const getResponse = await server.inject({ method: 'GET', url: '/api/warehouses/WH-TEST' });
    assert.equal(getResponse.statusCode, 200);
    const getBody = getResponse.json() as any;
    assert.equal(getBody.item.name, '테스트 센터');

    const mismatchUpdate = await server.inject({
      method: 'PUT',
      url: '/api/warehouses/WH-TEST',
      payload: { code: 'WH-OTHER', name: '변경', address: '서울시 1' },
    });
    assert.equal(mismatchUpdate.statusCode, 400);

    const updateResponse = await server.inject({
      method: 'PUT',
      url: '/api/warehouses/WH-TEST',
      payload: { code: 'WH-TEST', name: '업데이트된 센터', address: '서울시 수정로 20' },
    });
    assert.equal(updateResponse.statusCode, 200);
    const updateBody = updateResponse.json() as any;
    assert.equal(updateBody.item.name, '업데이트된 센터');

    const createWithoutAddress = await server.inject({
      method: 'POST',
      url: '/api/warehouses',
      payload: { code: 'WH-OPTIONAL', name: '옵션 센터', notes: '비고 메모' },
    });
    assert.equal(createWithoutAddress.statusCode, 201);
    const createWithoutAddressBody = createWithoutAddress.json() as any;
    assert.equal(createWithoutAddressBody.item.notes, '비고 메모');
    assert.ok(!('address' in createWithoutAddressBody.item));

    const updateWithoutAddress = await server.inject({
      method: 'PUT',
      url: '/api/warehouses/WH-OPTIONAL',
      payload: { code: 'WH-OPTIONAL', name: '옵션 센터 업데이트', notes: '수정된 메모' },
    });
    assert.equal(updateWithoutAddress.statusCode, 200);
    const updateWithoutAddressBody = updateWithoutAddress.json() as any;
    assert.equal(updateWithoutAddressBody.item.name, '옵션 센터 업데이트');
    assert.equal(updateWithoutAddressBody.item.notes, '수정된 메모');
    assert.ok(!('address' in updateWithoutAddressBody.item));

    const getWithoutAddress = await server.inject({
      method: 'GET',
      url: '/api/warehouses/WH-OPTIONAL',
    });
    assert.equal(getWithoutAddress.statusCode, 200);
    const getWithoutAddressBody = getWithoutAddress.json() as any;
    assert.equal(getWithoutAddressBody.item.notes, '수정된 메모');
    assert.ok(!('address' in getWithoutAddressBody.item));

    const locationCreate = await server.inject({
      method: 'POST',
      url: '/api/locations',
      payload: { code: 'LOC-TEST-1', warehouseCode: 'WH-TEST', description: '임시 존' },
    });
    assert.equal(locationCreate.statusCode, 201);

    const deleteResponse = await server.inject({
      method: 'DELETE',
      url: '/api/warehouses/WH-TEST',
    });
    assert.equal(deleteResponse.statusCode, 204);

    const afterDeleteWarehouse = await server.inject({ method: 'GET', url: '/api/warehouses' });
    assert.equal(afterDeleteWarehouse.statusCode, 200);
    const afterDeleteBody = afterDeleteWarehouse.json() as any;
    assert.equal(afterDeleteBody.count, 1);
    assert.equal(afterDeleteBody.items[0].code, 'WH-OPTIONAL');

    const locationCheck = await server.inject({
      method: 'GET',
      url: '/api/locations/LOC-TEST-1',
    });
    assert.equal(locationCheck.statusCode, 404);
  } finally {
    await server.close();
    __resetInventoryStore();
    __resetLocationStore();
    __resetWarehouseStore();
  }
}

await main();
