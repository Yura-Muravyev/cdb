import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { config } from './config.js';
import { catalogRoutes } from './routes/catalog.js';
import { adminRoutes } from './routes/admin.js';
import { syncRoutes } from './routes/sync.js';

const app = Fastify({ logger: true });

await app.register(cors);
await app.register(multipart, {
  limits: {
    fileSize: 10 * 1024 * 1024 * 1024, // 10 GB
  },
});

await app.register(catalogRoutes);
await app.register(adminRoutes);
await app.register(syncRoutes);

app.listen({ port: config.port, host: config.host }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});
