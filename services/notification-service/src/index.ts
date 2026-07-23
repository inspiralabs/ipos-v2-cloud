import 'dotenv/config';
import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import { createDb } from '@ipos-cloud/shared';
import { sendRoutes } from './routes/send.js';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info' } });
app.register(cors, { origin: process.env.CORS_ORIGIN || true, credentials: true });

const db = createDb(process.env.DATABASE_URL!);
app.decorate('db', db);

app.get('/health', async () => ({ status: 'ok', service: 'notification-service', version: '0.1.0' }));

// Hanya dipanggil service lain lewat Docker network internal — bukan endpoint publik.
async function requireInternalAuth(request: FastifyRequest, reply: FastifyReply) {
  const key = request.headers['x-internal-api-key'];
  if (!process.env.INTERNAL_API_KEY || key !== process.env.INTERNAL_API_KEY) {
    reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
  }
}
app.addHook('preHandler', async (request, reply) => {
  if (request.url === '/health') return;
  await requireInternalAuth(request, reply);
});

app.register(sendRoutes, { prefix: '/api/v1/notify' });

app.setErrorHandler((error: Error & { statusCode?: number; code?: string }, _req, reply) => {
  app.log.error(error);
  reply.code(error.statusCode ?? 500).send({ error: error.message, code: error.code || 'INTERNAL_ERROR' });
});

const port = parseInt(process.env.PORT || '3009');
app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) { app.log.error(err); process.exit(1); }
});
