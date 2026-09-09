import 'dotenv/config';
import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { createDb, createRedis, requireFeature, publishTenantEvent } from '@ipos-cloud/shared';
import { kitchen_tickets, pos_orders, pos_order_items } from '@ipos-cloud/drizzle-schema';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info' } });
app.register(cors, { origin: process.env.CORS_ORIGIN?.split(',') || true, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] });
app.register(jwt, {
  secret: { public: process.env.JWT_PUBLIC_KEY!.replace(/\\n/g, '\n') },
});

const db = createDb(process.env.DATABASE_URL!);
const redis = createRedis(process.env.REDIS_URL || 'redis://localhost:6379');

async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
  }
}

// Dipakai pos-service untuk order dari QR self-order pelanggan (tidak ada JWT staff) —
// sama pola dengan notification-service. Body harus bawa tenant_id sendiri saat pakai ini.
async function requireStaffOrInternal(request: FastifyRequest, reply: FastifyReply) {
  const internalKey = request.headers['x-internal-api-key'];
  if (process.env.INTERNAL_API_KEY && internalKey === process.env.INTERNAL_API_KEY) return;
  await requireAuth(request, reply);
}

const tenantId = (req: FastifyRequest) => {
  const internalKey = req.headers['x-internal-api-key'];
  if (process.env.INTERNAL_API_KEY && internalKey === process.env.INTERNAL_API_KEY) {
    return (req.body as { tenant_id: string }).tenant_id;
  }
  return (req as unknown as { user: { tenant_id: string } }).user.tenant_id;
};

app.get('/health', async () => ({ status: 'ok', service: 'kitchen-service', version: '0.1.0' }));

// ── Tiket dapur (KDS) ────────────────────────────────────────────────────────

// Daftar tiket aktif buat layar dapur — join item order supaya KDS tidak perlu 2x call.
app.get(
  '/api/v1/kitchen/tickets',
  { preHandler: [requireAuth, requireFeature('kitchen_display')] },
  async (req) => {
    const tid = tenantId(req);
    const tickets = await db.select().from(kitchen_tickets)
      .where(and(eq(kitchen_tickets.tenant_id, tid)));
    const active = tickets.filter((t) => t.status !== 'served');
    const orderIds = active.map((t) => t.order_id);
    if (!orderIds.length) return [];

    const orders = await db.select().from(pos_orders).where(eq(pos_orders.tenant_id, tid));
    const items = await db.select().from(pos_order_items);
    const orderById = new Map(orders.map((o) => [o.id, o]));

    return active.map((t) => ({
      ...t,
      table_number: orderById.get(t.order_id)?.table_number ?? null,
      items: items.filter((i) => i.order_id === t.order_id)
        .map((i) => ({ product_name: i.product_name, variant_summary: i.variant_summary, qty: i.qty, notes: i.notes })),
    }));
  }
);

// Dipanggil pos-service setelah order dibuat — lewat JWT kasir (order manual) atau
// INTERNAL_API_KEY (order dari QR self-order pelanggan, lihat requireStaffOrInternal di atas).
// pos-service sudah cek hasFeature('kitchen_display') sendiri sebelum memanggil ini.
const createTicketBody = z.object({
  order_id: z.string().uuid(),
  tenant_id: z.string().uuid().optional(),
  station: z.enum(['dapur', 'bar']).default('dapur'),
});

app.post(
  '/api/v1/kitchen/tickets',
  { preHandler: requireStaffOrInternal },
  async (req, reply) => {
    const { order_id, station } = createTicketBody.parse(req.body);
    const tid = tenantId(req);
    const [row] = await db.insert(kitchen_tickets)
      .values({ tenant_id: tid, order_id, station })
      .onConflictDoNothing()
      .returning();
    if (row) await publishTenantEvent(redis, tid, { type: 'kitchen_ticket.updated', order_id, status: row.status });
    return reply.code(201).send(row ?? { order_id, status: 'pending' });
  }
);

const statusBody = z.object({ status: z.enum(['pending', 'cooking', 'ready', 'served']) });
const statusTimestampField = { cooking: 'started_at', ready: 'ready_at', served: 'served_at' } as const;

app.post(
  '/api/v1/kitchen/tickets/:id/status',
  { preHandler: [requireAuth, requireFeature('kitchen_display')] },
  async (req, reply) => {
    const { id } = req.params as { id: string };
    const { status } = statusBody.parse(req.body);
    const tid = tenantId(req);
    const field = statusTimestampField[status as keyof typeof statusTimestampField];
    const [row] = await db.update(kitchen_tickets)
      .set({ status, ...(field ? { [field]: new Date() } : {}) })
      .where(and(eq(kitchen_tickets.id, id), eq(kitchen_tickets.tenant_id, tid)))
      .returning();
    if (!row) return reply.code(404).send({ error: 'Not found' });
    await publishTenantEvent(redis, tid, { type: 'kitchen_ticket.updated', order_id: row.order_id, status: row.status });
    return row;
  }
);

app.setErrorHandler((error: Error & { statusCode?: number; code?: string }, _req, reply) => {
  app.log.error(error);
  reply.code(error.statusCode ?? 500).send({ error: error.message, code: error.code || 'INTERNAL_ERROR' });
});

const port = parseInt(process.env.PORT || '3006');
app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) { app.log.error(err); process.exit(1); }
});
