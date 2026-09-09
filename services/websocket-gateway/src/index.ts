import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import jwt from '@fastify/jwt';
import { createRedis } from '@ipos-cloud/shared';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info' } });
app.register(cors, { origin: process.env.CORS_ORIGIN?.split(',') || true, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] });
app.register(jwt, {
  secret: { public: process.env.JWT_PUBLIC_KEY!.replace(/\\n/g, '\n') },
});
app.register(websocket);

const redisSub = createRedis(process.env.REDIS_URL || 'redis://localhost:6379');

// Socket browser tidak bisa kirim header saat handshake — token lewat query string.
type JwtUser = { tenant_id: string };
const socketsByTenant = new Map<string, Set<{ send: (data: string) => void }>>();

app.get('/health', async () => ({ status: 'ok', service: 'websocket-gateway', version: '0.1.0' }));

app.register(async function (app) {
  app.get('/ws', { websocket: true }, async (socket, req) => {
    const { token } = req.query as { token?: string };
    let user: JwtUser;
    try {
      user = (await app.jwt.verify(token || '')) as JwtUser;
    } catch {
      socket.close(4001, 'Unauthorized');
      return;
    }
    const tid = user.tenant_id;
    if (!socketsByTenant.has(tid)) socketsByTenant.set(tid, new Set());
    socketsByTenant.get(tid)!.add(socket);

    socket.on('close', () => {
      socketsByTenant.get(tid)?.delete(socket);
    });
  });
});

// Satu pola Redis channel per tenant di publisher side (packages/shared/realtime.ts);
// di sini kita subscribe ke semua lewat psubscribe supaya tidak perlu resubscribe per tenant baru.
redisSub.psubscribe('tenant:*:events');
redisSub.on('pmessage', (_pattern, channel, message) => {
  const tenantId = channel.split(':')[1];
  const sockets = socketsByTenant.get(tenantId);
  if (!sockets?.size) return;
  for (const socket of sockets) socket.send(message);
});

app.setErrorHandler((error: Error & { statusCode?: number; code?: string }, _req, reply) => {
  app.log.error(error);
  reply.code(error.statusCode ?? 500).send({ error: error.message, code: error.code || 'INTERNAL_ERROR' });
});

const port = parseInt(process.env.PORT || '3011');
app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) { app.log.error(err); process.exit(1); }
});
