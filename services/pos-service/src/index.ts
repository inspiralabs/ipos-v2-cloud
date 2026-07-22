import 'dotenv/config';
import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { z } from 'zod';
import { and, eq, between } from 'drizzle-orm';
import { createDb, requireFeature } from '@ipos-cloud/shared';
import { pos_shifts, pos_orders, pos_order_items } from '@ipos-cloud/drizzle-schema';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info' } });
app.register(cors, { origin: process.env.CORS_ORIGIN || true, credentials: true });
app.register(jwt, {
  secret: { public: process.env.JWT_PUBLIC_KEY!.replace(/\\n/g, '\n') },
});

const db = createDb(process.env.DATABASE_URL!);
app.decorate('db', db);

async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
  }
}

type JwtUser = { sub: string; tenant_id: string; outlet_id: string | null; role: string };
const jwtUser = (req: FastifyRequest) => (req as unknown as { user: JwtUser }).user;

app.get('/health', async () => ({ status: 'ok', service: 'pos-service', version: '0.1.0' }));

// ── Shifts ────────────────────────────────────────────────────────────────────

const openShiftBody = z.object({
  cashier_name: z.string().min(1).max(255),
  opening_cash: z.number().int().min(0).default(0),
});

app.post('/api/v1/pos/shifts', { preHandler: [requireAuth, requireFeature('shift_management')] }, async (req, reply) => {
  const body = openShiftBody.parse(req.body);
  const user = jwtUser(req);
  const [existing] = await db.select({ id: pos_shifts.id })
    .from(pos_shifts)
    .where(and(eq(pos_shifts.tenant_id, user.tenant_id), eq(pos_shifts.status, 'open')))
    .limit(1);
  if (existing) return reply.code(409).send({ error: 'Shift sudah terbuka', code: 'SHIFT_ALREADY_OPEN' });
  const [row] = await db.insert(pos_shifts).values({
    tenant_id: user.tenant_id,
    outlet_id: user.outlet_id,
    cashier_id: user.sub,
    cashier_name: body.cashier_name,
    opening_cash: body.opening_cash,
  }).returning();
  return reply.code(201).send(row);
});

app.get('/api/v1/pos/shifts/current', { preHandler: requireAuth }, async (req, reply) => {
  const user = jwtUser(req);
  const [row] = await db.select().from(pos_shifts)
    .where(and(eq(pos_shifts.tenant_id, user.tenant_id), eq(pos_shifts.status, 'open')))
    .limit(1);
  if (!row) return reply.code(404).send({ error: 'Tidak ada shift aktif', code: 'NO_OPEN_SHIFT' });
  return row;
});

app.put('/api/v1/pos/shifts/:id/close', { preHandler: [requireAuth, requireFeature('shift_management')] }, async (req, reply) => {
  const { id } = req.params as { id: string };
  const { closing_cash, notes } = z.object({
    closing_cash: z.number().int().min(0).default(0),
    notes: z.string().optional(),
  }).parse(req.body);
  const user = jwtUser(req);
  const [row] = await db.update(pos_shifts)
    .set({ status: 'closed', closing_cash, notes, closed_at: new Date() })
    .where(and(eq(pos_shifts.id, id), eq(pos_shifts.tenant_id, user.tenant_id)))
    .returning();
  if (!row) return reply.code(404).send({ error: 'Not found' });
  return row;
});

// ── Orders ────────────────────────────────────────────────────────────────────

const orderItemSchema = z.object({
  menu_id: z.string().uuid().nullable().optional(),
  product_name: z.string().min(1),
  variant_summary: z.string().nullable().optional(), // "Level 3, Extra Keju"
  price: z.number().int().min(0), // sudah termasuk selisih variasi & diskon menu
  qty: z.number().int().min(1),
  notes: z.string().nullable().optional(),
});

const createOrderBody = z.object({
  id: z.string().uuid(),
  shift_id: z.string().uuid().nullable().optional(),
  status: z.enum(['paid', 'void']).default('paid'),
  subtotal: z.number().int().min(0),
  discount: z.number().int().min(0).default(0),
  total: z.number().int().min(0),
  payment_method: z.enum(['cash', 'qris', 'transfer']),
  cash_received: z.number().int().nullable().optional(),
  change_amount: z.number().int().nullable().optional(),
  cashier_name: z.string().optional(),
  customer_id: z.string().uuid().nullable().optional(),
  customer_name: z.string().nullable().optional(),
  table_number: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  created_at: z.string().datetime(),
  items: z.array(orderItemSchema).min(1),
});

app.post('/api/v1/pos/orders', { preHandler: requireAuth }, async (req, reply) => {
  const body = createOrderBody.parse(req.body);
  const user = jwtUser(req);
  const { items, ...orderData } = body;
  const [order] = await db.insert(pos_orders).values({
    ...orderData,
    tenant_id: user.tenant_id,
    outlet_id: user.outlet_id,
    created_at: new Date(orderData.created_at),
  }).returning();
  if (items.length) {
    await db.insert(pos_order_items).values(
      items.map((item) => ({ ...item, order_id: order.id }))
    );
  }
  return reply.code(201).send(order);
});

app.get('/api/v1/pos/orders', { preHandler: requireAuth }, async (req) => {
  const user = jwtUser(req);
  const { date } = req.query as { date?: string };
  if (date) {
    const from = new Date(date + 'T00:00:00Z');
    const to = new Date(date + 'T23:59:59Z');
    return db.select().from(pos_orders)
      .where(and(eq(pos_orders.tenant_id, user.tenant_id), between(pos_orders.created_at, from, to)));
  }
  return db.select().from(pos_orders).where(eq(pos_orders.tenant_id, user.tenant_id));
});

app.post('/api/v1/pos/orders/:id/void', { preHandler: [requireAuth, requireFeature('void_transaction')] }, async (req, reply) => {
  const { id } = req.params as { id: string };
  const user = jwtUser(req);
  const [row] = await db.update(pos_orders)
    .set({ status: 'void' })
    .where(and(eq(pos_orders.id, id), eq(pos_orders.tenant_id, user.tenant_id)))
    .returning();
  if (!row) return reply.code(404).send({ error: 'Not found' });
  return row;
});

// Offline sync — idempotent bulk upsert
const syncBatchBody = z.object({ orders: z.array(createOrderBody) });

app.post('/api/v1/pos/orders/sync-batch', { preHandler: requireAuth }, async (req, reply) => {
  const { orders } = syncBatchBody.parse(req.body);
  const user = jwtUser(req);
  const results: string[] = [];
  for (const body of orders) {
    const { items, ...orderData } = body;
    await db.insert(pos_orders).values({
      ...orderData,
      tenant_id: user.tenant_id,
      outlet_id: user.outlet_id,
      created_at: new Date(orderData.created_at),
    }).onConflictDoNothing();
    if (items.length) {
      await db.insert(pos_order_items)
        .values(items.map((item) => ({ ...item, order_id: orderData.id })))
        .onConflictDoNothing();
    }
    results.push(orderData.id);
  }
  return reply.code(200).send({ synced: results.length, ids: results });
});

app.setErrorHandler((error: Error & { statusCode?: number; code?: string }, _req, reply) => {
  app.log.error(error);
  reply.code(error.statusCode ?? 500).send({ error: error.message, code: error.code || 'INTERNAL_ERROR' });
});

const port = parseInt(process.env.PORT || '3003');
app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) { app.log.error(err); process.exit(1); }
});
