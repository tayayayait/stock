import 'dotenv/config';

import { buildServer } from './app.js';

const port = Number(process.env.PORT ?? 8787);

const server = await buildServer();

try {
  await server.listen({ port, host: '0.0.0.0' });
  server.log.info(`Server listening on port ${port}`);
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
