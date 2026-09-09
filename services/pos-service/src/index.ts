import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { z } from 'zod';
import { and, eq, between, inArray } from 'drizzle-orm';
import { createDb, requireFeature, hasFeature, type TenantPlan } from '@ipos-cloud/shared';
import { pos_shifts, pos_orders, pos_order_items, tenants } from '@ipos-cloud/drizzle-schema';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info' } });
app.register(cors, { origin: process.env.CORS_ORIGIN?.split(',') || true, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] });
app.register(jwt, {
  secret: { public: process.env.JWT_PUBLIC_KEY!.replace(/\\n/g, '\n') },
});

const db = createDb(process.env.DATABASE_URL!);
app.decorate('db', db);
const KITCHEN_SERVICE_URL = process.env.KITCHEN_SERVICE_URL || 'http://localhost:3006';
const INVENTORY_SERVICE_URL = process.env.INVENTORY_SERVICE_URL || 'http://localhost:3005';
const CATALOG_SERVICE_URL = process.env.CATALOG_SERVICE_URL || 'http://localhost:3004';
const TABLE_SERVICE_URL = process.env.TABLE_SERVICE_URL || 'http://localhost:3007';
const TENANT_SERVICE_URL = process.env.TENANT_SERVICE_URL || 'http://localhost:3002';

async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
  }
}

type JwtUser = { sub: string; tenant_id: string; outlet_id: string | null; role: string; plan: TenantPlan | null };
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
  loyalty_member_id: z.string().uuid().nullable().optional(),
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
  await notifyKitchenIfEnabled(user, order.id, req.headers.authorization);
  await deductIngredientsIfEnabled(user, items, req.headers.authorization);
  if (body.loyalty_member_id) await earnLoyaltyPointsIfEnabled(user, body.loyalty_member_id, order.id, body.total, req.headers.authorization);
  return reply.code(201).send(order);
});

// Best-effort: order tetap berhasil walau tenant-service down atau tenant tidak punya loyalty_program.
async function earnLoyaltyPointsIfEnabled(user: JwtUser, memberId: string, orderId: string, orderTotal: number, authHeader?: string) {
  try {
    const enabled = await hasFeature(db, user.tenant_id, user.plan, 'loyalty_program');
    if (!enabled) return;
    await fetch(`${TENANT_SERVICE_URL}/api/v1/tenants/loyalty/points/earn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(authHeader ? { Authorization: authHeader } : {}) },
      body: JSON.stringify({ member_id: memberId, order_id: orderId, order_total: orderTotal }),
    });
  } catch (err) {
    app.log.warn({ err, orderId }, 'loyalty points earn failed');
  }
}

// Best-effort: order tetap berhasil walau kitchen-service down atau tenant tidak punya fitur ini.
async function notifyKitchenIfEnabled(user: JwtUser, orderId: string, authHeader?: string) {
  try {
    const enabled = await hasFeature(db, user.tenant_id, user.plan, 'kitchen_display');
    if (!enabled) return;
    await fetch(`${KITCHEN_SERVICE_URL}/api/v1/kitchen/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(authHeader ? { Authorization: authHeader } : {}) },
      body: JSON.stringify({ order_id: orderId }),
    });
  } catch (err) {
    app.log.warn({ err, orderId }, 'kitchen ticket notify failed');
  }
}

// Best-effort: order tetap berhasil walau inventory-service down atau tenant belum pakai BOM.
async function deductIngredientsIfEnabled(user: JwtUser, items: z.infer<typeof orderItemSchema>[], authHeader?: string) {
  try {
    const enabled = await hasFeature(db, user.tenant_id, user.plan, 'bom_recipe');
    if (!enabled) return;
    const deductItems = items.filter((i) => i.menu_id).map((i) => ({ menu_id: i.menu_id as string, qty: i.qty }));
    if (!deductItems.length) return;
    await fetch(`${INVENTORY_SERVICE_URL}/api/v1/inventory/deduct-for-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(authHeader ? { Authorization: authHeader } : {}) },
      body: JSON.stringify({ items: deductItems }),
    });
  } catch (err) {
    app.log.warn({ err }, 'ingredient deduction failed');
  }
}

app.get('/api/v1/pos/orders', { preHandler: requireAuth }, async (req) => {
  const user = jwtUser(req);
  const { date } = req.query as { date?: string };
  const orders = date
    ? await db.select().from(pos_orders).where(and(
        eq(pos_orders.tenant_id, user.tenant_id),
        between(pos_orders.created_at, new Date(date + 'T00:00:00Z'), new Date(date + 'T23:59:59Z')),
      ))
    : await db.select().from(pos_orders).where(eq(pos_orders.tenant_id, user.tenant_id));

  if (!orders.length) return orders;
  const items = await db.select().from(pos_order_items)
    .where(inArray(pos_order_items.order_id, orders.map((o) => o.id)));
  const itemsByOrder = new Map<string, typeof items>();
  for (const item of items) {
    const list = itemsByOrder.get(item.order_id) ?? [];
    list.push(item);
    itemsByOrder.set(item.order_id, list);
  }
  return orders.map((o) => ({
    ...o,
    items: (itemsByOrder.get(o.id) ?? []).map((i) => ({ product_name: i.product_name, qty: i.qty })),
  }));
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

// ── QR self-order (publik, tanpa auth — pelanggan scan QR di meja) ─────────
// Harga & ketersediaan menu dihitung ulang dari catalog-service, TIDAK dipercaya dari client
// (klien publik bisa dimanipulasi) — beda dengan POST /orders biasa yang dipakai kasir terpercaya.

const selfOrderBody = z.object({
  qr_token: z.string().min(1),
  items: z.array(z.object({
    menu_id: z.string().uuid(),
    qty: z.number().int().min(1),
    variant_option_ids: z.array(z.string().uuid()).default([]),
    notes: z.string().nullable().optional(),
  })).min(1),
  customer_name: z.string().nullable().optional(),
  payment_method: z.enum(['cash', 'qris']),
});

app.post('/api/v1/pos/orders/self-order', async (req, reply) => {
  const body = selfOrderBody.parse(req.body);

  const tableRes = await fetch(`${TABLE_SERVICE_URL}/api/v1/tables/qr/${body.qr_token}`);
  if (!tableRes.ok) return reply.code(404).send({ error: 'Meja tidak ditemukan', code: 'NOT_FOUND' });
  const table = (await tableRes.json()) as { id: string; label: string; tenant_id: string };

  const [tenant] = await db.select({ plan_code: tenants.plan_code, name: tenants.name, phone: tenants.phone, logo_url: tenants.logo_url })
    .from(tenants).where(eq(tenants.id, table.tenant_id));
  const plan = (tenant?.plan_code ?? null) as TenantPlan | null;
  if (!(await hasFeature(db, table.tenant_id, plan, 'qr_self_order'))) {
    return reply.code(403).send({ error: 'Self-order tidak tersedia untuk toko ini', code: 'FEATURE_GATED' });
  }

  const menuRes = await fetch(`${CATALOG_SERVICE_URL}/api/v1/menus/public/${body.qr_token}`);
  if (!menuRes.ok) return reply.code(502).send({ error: 'Gagal memuat menu', code: 'MENU_UNAVAILABLE' });
  const catalog = (await menuRes.json()) as {
    menus: { id: string; name: string; price: number; discount_price: number | null;
      variant_groups: { options: { id: string; name: string; price_delta: number }[] }[] }[];
  };
  const menuById = new Map(catalog.menus.map((m) => [m.id, m]));

  let subtotal = 0;
  const orderItems: { menu_id: string; product_name: string; variant_summary: string | null; price: number; qty: number; notes: string | null | undefined }[] = [];
  for (const item of body.items) {
    const menu = menuById.get(item.menu_id);
    if (!menu) return reply.code(400).send({ error: `Menu ${item.menu_id} tidak tersedia`, code: 'MENU_NOT_FOUND' });

    const allOptions = menu.variant_groups.flatMap((g) => g.options);
    const chosen = item.variant_option_ids.map((id) => {
      const opt = allOptions.find((o) => o.id === id);
      if (!opt) throw Object.assign(new Error(`Varian tidak valid untuk ${menu.name}`), { statusCode: 400, code: 'INVALID_VARIANT' });
      return opt;
    });
    const basePrice = menu.discount_price ?? menu.price;
    const unitPrice = basePrice + chosen.reduce((sum, o) => sum + o.price_delta, 0);
    subtotal += unitPrice * item.qty;
    orderItems.push({
      menu_id: menu.id,
      product_name: menu.name,
      variant_summary: chosen.length ? chosen.map((o) => o.name).join(', ') : null,
      price: unitPrice,
      qty: item.qty,
      notes: item.notes,
    });
  }

  const orderId = randomUUID();
  const [order] = await db.insert(pos_orders).values({
    id: orderId,
    tenant_id: table.tenant_id,
    status: 'pending', // menunggu konfirmasi kasir — beda dari order kasir yang langsung 'paid'
    subtotal,
    discount: 0,
    total: subtotal,
    payment_method: body.payment_method,
    customer_name: body.customer_name,
    table_number: table.label,
    created_at: new Date(),
  }).returning();
  await db.insert(pos_order_items).values(orderItems.map((item) => ({ ...item, order_id: orderId })));

  await notifyKitchenInternal(table.tenant_id, plan, orderId);
  await deductIngredientsInternal(table.tenant_id, plan, orderItems.map((i) => ({ menu_id: i.menu_id, qty: i.qty })));

  return reply.code(201).send({
    ...order,
    items: orderItems,
    store: { name: tenant?.name ?? 'Toko', phone: tenant?.phone ?? null, logo_url: tenant?.logo_url ?? null },
  });
});

// Sama seperti notifyKitchenIfEnabled/deductIngredientsIfEnabled, tapi lewat INTERNAL_API_KEY
// karena tidak ada JWT staff di jalur self-order — pos-service tetap yang cek hasFeature.
async function notifyKitchenInternal(tenantId: string, plan: TenantPlan | null, orderId: string) {
  try {
    if (!(await hasFeature(db, tenantId, plan, 'kitchen_display'))) return;
    await fetch(`${KITCHEN_SERVICE_URL}/api/v1/kitchen/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-api-key': process.env.INTERNAL_API_KEY || '' },
      body: JSON.stringify({ order_id: orderId, tenant_id: tenantId }),
    });
  } catch (err) {
    app.log.warn({ err, orderId }, 'kitchen ticket notify (self-order) failed');
  }
}

async function deductIngredientsInternal(tenantId: string, plan: TenantPlan | null, items: { menu_id: string; qty: number }[]) {
  try {
    if (!(await hasFeature(db, tenantId, plan, 'bom_recipe')) || !items.length) return;
    await fetch(`${INVENTORY_SERVICE_URL}/api/v1/inventory/deduct-for-order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-api-key': process.env.INTERNAL_API_KEY || '' },
      body: JSON.stringify({ tenant_id: tenantId, items }),
    });
  } catch (err) {
    app.log.warn({ err }, 'ingredient deduction (self-order) failed');
  }
}

app.setErrorHandler((error: Error & { statusCode?: number; code?: string }, _req, reply) => {
  app.log.error(error);
  reply.code(error.statusCode ?? 500).send({ error: error.message, code: error.code || 'INTERNAL_ERROR' });
});

const port = parseInt(process.env.PORT || '3003');
app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) { app.log.error(err); process.exit(1); }
});
