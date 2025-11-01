import assert from 'node:assert/strict';

import { buildServer } from '../app.js';

async function main() {
  const server = await buildServer();

  try {
    const success = await server.inject({ method: 'GET', url: '/api/forecast/101' });
    assert.equal(success.statusCode, 200);
    const body = success.json() as any;
    assert.ok(body.product?.sku === 'D1E2F3G');
    assert.ok(Array.isArray(body.timeline));
    assert.ok(body.timeline.length > 6);
    assert.ok(body.timeline.some((point: any) => point.phase === 'forecast'));
    assert.ok(body.explanation?.summary);

    const notFound = await server.inject({ method: 'GET', url: '/api/forecast/9999' });
    assert.equal(notFound.statusCode, 404);
  } finally {
    await server.close();
  }
}

await main();
