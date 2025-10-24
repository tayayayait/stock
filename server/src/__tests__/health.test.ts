import assert from 'node:assert/strict';

import { buildServer } from '../app.js';

async function main() {
  const server = await buildServer();

  try {
    const response = await server.inject({ method: 'GET', url: '/api/health' });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { status: 'ok' });
  } finally {
    await server.close();
  }
}

await main();
