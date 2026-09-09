import 'dotenv/config';
import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import QRCode from 'qrcode';
import { createDb, createRedis, requireFeature, publishTenantEvent } from '@ipos-cloud/shared';
import { restaurant_tables } from '@ipos-cloud/drizzle-schema';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info' } });
app.register(cors, { origin: process.env.CORS_ORIGIN?.split(',') || true, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] });
app.register(jwt, {
  secret: { public: process.env.JWT_PUBLIC_KEY!.replace(/\\n/g, '\n') },
});

const db = createDb(process.env.DATABASE_URL!);
const redis = createRedis(process.env.REDIS_URL || 'redis://localhost:6379');
const PUBLIC_ORDER_URL = process.env.PUBLIC_ORDER_URL || 'http://localhost:3012/order';

async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
  }
}

const tenantId = (req: FastifyRequest) =>
  (req as unknown as { user: { tenant_id: string } }).user.tenant_id;

app.get('/health', async () => ({ status: 'ok', service: 'table-service', version: '0.1.0' }));

// ── Tables (dashboard kasir/waiter) ─────────────────────────────────────────

const tableBody = z.object({
  label: z.string().min(1).max(50),
  seats: z.number().int().min(1).default(2),
  outlet_id: z.string().uuid().nullable().optional(),
  zone: z.enum(['indoor', 'outdoor', 'vip']).default('indoor'),
  shape: z.enum(['persegi', 'bundar', 'oval']).default('persegi'),
  position_x: z.number().int().min(0).max(100).default(0),
  position_y: z.number().int().min(0).max(100).default(0),
});

app.get(
  '/api/v1/tables',
  { preHandler: [requireAuth, requireFeature('table_management')] },
  async (req) => db.select().from(restaurant_tables).where(eq(restaurant_tables.tenant_id, tenantId(req)))
);

app.post(
  '/api/v1/tables',
  { preHandler: [requireAuth, requireFeature('table_management')] },
  async (req, reply) => {
    const body = tableBody.parse(req.body);
    const [row] = await db.insert(restaurant_tables).values({
      ...body,
      tenant_id: tenantId(req),
      qr_token: randomBytes(12).toString('hex'),
    }).returning();
    return reply.code(201).send(row);
  }
);

app.put(
  '/api/v1/tables/:id',
  { preHandler: [requireAuth, requireFeature('table_management')] },
  async (req, reply) => {
    const body = tableBody.partial().parse(req.body);
    const { id } = req.params as { id: string };
    const [row] = await db.update(restaurant_tables)
      .set({ ...body, updated_at: new Date() })
      .where(and(eq(restaurant_tables.id, id), eq(restaurant_tables.tenant_id, tenantId(req))))
      .returning();
    if (!row) return reply.code(404).send({ error: 'Not found' });
    return row;
  }
);

app.delete(
  '/api/v1/tables/:id',
  { preHandler: [requireAuth, requireFeature('table_management')] },
  async (req, reply) => {
    const { id } = req.params as { id: string };
    await db.delete(restaurant_tables)
      .where(and(eq(restaurant_tables.id, id), eq(restaurant_tables.tenant_id, tenantId(req))));
    return reply.code(204).send();
  }
);

// Waiter update status meja (available/occupied/reserved/cleaning) dari floor map.
app.post(
  '/api/v1/tables/:id/status',
  { preHandler: [requireAuth, requireFeature('table_management')] },
  async (req, reply) => {
    const { id } = req.params as { id: string };
    const { status } = z.object({ status: z.enum(['available', 'occupied', 'reserved', 'cleaning']) }).parse(req.body);
    const tid = tenantId(req);
    const [row] = await db.update(restaurant_tables)
      .set({ status, updated_at: new Date() })
      .where(and(eq(restaurant_tables.id, id), eq(restaurant_tables.tenant_id, tid)))
      .returning();
    if (!row) return reply.code(404).send({ error: 'Not found' });
    await publishTenantEvent(redis, tid, { type: 'table.updated', table_id: row.id, status: row.status });
    return row;
  }
);

// Simpan posisi tile setelah drag di canvas floor map editor (bulk, satu request per sesi drag).
app.put(
  '/api/v1/tables/positions',
  { preHandler: [requireAuth, requireFeature('table_management')] },
  async (req, reply) => {
    const { positions } = z.object({
      positions: z.array(z.object({ id: z.string().uuid(), position_x: z.number().int().min(0).max(100), position_y: z.number().int().min(0).max(100) })),
    }).parse(req.body);
    const tid = tenantId(req);
    for (const p of positions) {
      await db.update(restaurant_tables)
        .set({ position_x: p.position_x, position_y: p.position_y, updated_at: new Date() })
        .where(and(eq(restaurant_tables.id, p.id), eq(restaurant_tables.tenant_id, tid)));
    }
    return reply.code(200).send({ ok: true });
  }
);

// Generate gambar QR (PNG) untuk ditempel di meja / dikasih ke pelanggan — kasir/waiter/owner
// yang login bisa print ini. Encode URL order publik, bukan cuma qr_token mentah.
app.get(
  '/api/v1/tables/:id/qr-code',
  { preHandler: [requireAuth, requireFeature('table_management')] },
  async (req, reply) => {
    const { id } = req.params as { id: string };
    const [row] = await db.select().from(restaurant_tables)
      .where(and(eq(restaurant_tables.id, id), eq(restaurant_tables.tenant_id, tenantId(req))));
    if (!row) return reply.code(404).send({ error: 'Not found' });

    const png = await QRCode.toBuffer(`${PUBLIC_ORDER_URL}/${row.qr_token}`, { width: 400, margin: 2 });
    reply.header('Content-Type', 'image/png');
    return reply.send(png);
  }
);

// ── QR self-order (publik, tanpa auth — pelanggan scan QR di meja) ─────────

app.get('/api/v1/tables/qr/:qr_token', async (req, reply) => {
  const { qr_token } = req.params as { qr_token: string };
  const [row] = await db.select().from(restaurant_tables).where(eq(restaurant_tables.qr_token, qr_token));
  if (!row) return reply.code(404).send({ error: 'Meja tidak ditemukan', code: 'NOT_FOUND' });
  return { id: row.id, label: row.label, tenant_id: row.tenant_id, status: row.status };
});

app.setErrorHandler((error: Error & { statusCode?: number; code?: string }, _req, reply) => {
  app.log.error(error);
  reply.code(error.statusCode ?? 500).send({ error: error.message, code: error.code || 'INTERNAL_ERROR' });
});

const port = parseInt(process.env.PORT || '3007');
app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) { app.log.error(err); process.exit(1); }
});
