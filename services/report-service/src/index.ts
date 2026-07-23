import 'dotenv/config';
import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { z } from 'zod';
import { and, eq, between, sql } from 'drizzle-orm';
import { createDb, requireFeature } from '@ipos-cloud/shared';
import {
  pos_orders, pos_order_items, menus,
  recipe_items, ingredients, operational_expenses, ingredient_waste_logs,
} from '@ipos-cloud/drizzle-schema';
import { parseRange } from './date-range.js';
import { bucketLabel, type Granularity } from './timeseries.js';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info' } });
app.register(cors, { origin: process.env.CORS_ORIGIN || true, credentials: true });
app.register(jwt, {
  secret: { public: process.env.JWT_PUBLIC_KEY!.replace(/\\n/g, '\n') },
});

const db = createDb(process.env.DATABASE_URL!);

async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
  }
}

type JwtUser = { sub: string; tenant_id: string; plan: string | null; role: string };
const jwtUser = (req: FastifyRequest) => (req as unknown as { user: JwtUser }).user;

app.get('/health', async () => ({ status: 'ok', service: 'report-service', version: '0.1.0' }));

// ── Shared date-range parsing ─────────────────────────────────────────────────

const dateRangeQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

// ── GET /api/v1/reports/sales-summary ─────────────────────────────────────────

app.get('/api/v1/reports/sales-summary', { preHandler: requireAuth }, async (req) => {
  const { from, to } = dateRangeQuery.parse(req.query);
  const user = jwtUser(req);
  const { fromDate, toDate, prevFrom, prevTo } = parseRange(from, to);

  async function summarize(start: Date, end: Date) {
    const [row] = await db
      .select({
        total_omzet: sql<number>`coalesce(sum(${pos_orders.total}), 0)`,
        total_transactions: sql<number>`count(*)`,
      })
      .from(pos_orders)
      .where(
        and(
          eq(pos_orders.tenant_id, user.tenant_id),
          eq(pos_orders.status, 'paid'),
          between(pos_orders.created_at, start, end)
        )
      );
    return {
      total_omzet: Number(row?.total_omzet ?? 0),
      total_transactions: Number(row?.total_transactions ?? 0),
    };
  }

  const current = await summarize(fromDate, toDate);
  const previous = await summarize(prevFrom, prevTo);
  const avg_transaction = current.total_transactions > 0 ? Math.round(current.total_omzet / current.total_transactions) : 0;
  const change_percent =
    previous.total_omzet > 0
      ? Math.round(((current.total_omzet - previous.total_omzet) / previous.total_omzet) * 100)
      : current.total_omzet > 0
        ? 100
        : 0;

  return {
    total_omzet: current.total_omzet,
    total_transactions: current.total_transactions,
    avg_transaction,
    previous_period: previous,
    change_percent,
  };
});

// ── GET /api/v1/reports/top-menu / bottom-menu ────────────────────────────────

const menuRankQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

app.get('/api/v1/reports/top-menu', { preHandler: requireAuth }, async (req) => {
  const { from, to, limit } = menuRankQuery.parse(req.query);
  const user = jwtUser(req);
  const { fromDate, toDate } = parseRange(from, to);

  return db
    .select({
      menu_id: pos_order_items.menu_id,
      product_name: pos_order_items.product_name,
      total_qty: sql<number>`sum(${pos_order_items.qty})`,
      total_revenue: sql<number>`sum(${pos_order_items.price} * ${pos_order_items.qty})`,
    })
    .from(pos_order_items)
    .innerJoin(pos_orders, eq(pos_order_items.order_id, pos_orders.id))
    .where(
      and(
        eq(pos_orders.tenant_id, user.tenant_id),
        eq(pos_orders.status, 'paid'),
        between(pos_orders.created_at, fromDate, toDate)
      )
    )
    .groupBy(pos_order_items.menu_id, pos_order_items.product_name)
    .orderBy(sql`sum(${pos_order_items.qty}) desc`)
    .limit(limit);
});

app.get(
  '/api/v1/reports/bottom-menu',
  { preHandler: [requireAuth, requireFeature('advanced_report')] },
  async (req) => {
    const { from, to, limit } = menuRankQuery.parse(req.query);
    const user = jwtUser(req);
    const { fromDate, toDate } = parseRange(from, to);

    return db
      .select({
        menu_id: pos_order_items.menu_id,
        product_name: pos_order_items.product_name,
        total_qty: sql<number>`sum(${pos_order_items.qty})`,
        total_revenue: sql<number>`sum(${pos_order_items.price} * ${pos_order_items.qty})`,
      })
      .from(pos_order_items)
      .innerJoin(pos_orders, eq(pos_order_items.order_id, pos_orders.id))
      .innerJoin(menus, eq(pos_order_items.menu_id, menus.id))
      .where(
        and(
          eq(pos_orders.tenant_id, user.tenant_id),
          eq(pos_orders.status, 'paid'),
          eq(menus.is_active, true),
          between(pos_orders.created_at, fromDate, toDate)
        )
      )
      .groupBy(pos_order_items.menu_id, pos_order_items.product_name)
      .orderBy(sql`sum(${pos_order_items.qty}) asc`)
      .limit(limit);
  }
);

// ── GET /api/v1/reports/peak-hours ────────────────────────────────────────────

app.get(
  '/api/v1/reports/peak-hours',
  { preHandler: [requireAuth, requireFeature('advanced_report')] },
  async (req) => {
    const { from, to } = dateRangeQuery.parse(req.query);
    const user = jwtUser(req);
    const { fromDate, toDate } = parseRange(from, to);

    const byHour = await db
      .select({
        hour: sql<number>`extract(hour from ${pos_orders.created_at})`,
        transaction_count: sql<number>`count(*)`,
      })
      .from(pos_orders)
      .where(
        and(
          eq(pos_orders.tenant_id, user.tenant_id),
          eq(pos_orders.status, 'paid'),
          between(pos_orders.created_at, fromDate, toDate)
        )
      )
      .groupBy(sql`extract(hour from ${pos_orders.created_at})`)
      .orderBy(sql`extract(hour from ${pos_orders.created_at})`);

    const byDay = await db
      .select({
        day_of_week: sql<number>`extract(dow from ${pos_orders.created_at})`,
        transaction_count: sql<number>`count(*)`,
      })
      .from(pos_orders)
      .where(
        and(
          eq(pos_orders.tenant_id, user.tenant_id),
          eq(pos_orders.status, 'paid'),
          between(pos_orders.created_at, fromDate, toDate)
        )
      )
      .groupBy(sql`extract(dow from ${pos_orders.created_at})`)
      .orderBy(sql`extract(dow from ${pos_orders.created_at})`);

    return {
      by_hour: byHour.map((r) => ({ hour: Number(r.hour), transaction_count: Number(r.transaction_count) })),
      by_day: byDay.map((r) => ({ day_of_week: Number(r.day_of_week), transaction_count: Number(r.transaction_count) })),
    };
  }
);

// ── GET /api/v1/reports/timeseries ────────────────────────────────────────────

const timeseriesQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  granularity: z.enum(['hour', 'day', 'week', 'month']),
});

app.get('/api/v1/reports/timeseries', { preHandler: requireAuth }, async (req) => {
  const { from, to, granularity } = timeseriesQuery.parse(req.query);
  const user = jwtUser(req);
  const { fromDate, toDate } = parseRange(from, to);

  const rows = await db
    .select({
      created_at: pos_orders.created_at,
      total: pos_orders.total,
    })
    .from(pos_orders)
    .where(
      and(
        eq(pos_orders.tenant_id, user.tenant_id),
        eq(pos_orders.status, 'paid'),
        between(pos_orders.created_at, fromDate, toDate)
      )
    );

  const buckets = new Map<string, { omzet: number; transaction_count: number }>();
  for (const row of rows) {
    const label = bucketLabel(row.created_at, granularity as Granularity);
    const entry = buckets.get(label) ?? { omzet: 0, transaction_count: 0 };
    entry.omzet += Number(row.total);
    entry.transaction_count += 1;
    buckets.set(label, entry);
  }

  return Array.from(buckets.entries())
    .map(([bucket, v]) => ({ bucket, ...v }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket));
});

// ── GET /api/v1/reports/food-cost (Resto Pro & Business) ─────────────────────
// HPP per menu = sum(qty_used * cost_per_unit) dari resep — menu tanpa resep di-skip (belum di-BOM-kan).

app.get(
  '/api/v1/reports/food-cost',
  { preHandler: [requireAuth, requireFeature('food_cost_report')] },
  async (req) => {
    const user = jwtUser(req);
    const recipeRows = await db
      .select({
        menu_id: recipe_items.menu_id,
        cost: sql<number>`sum(${recipe_items.qty_used} * ${ingredients.cost_per_unit})`,
      })
      .from(recipe_items)
      .innerJoin(ingredients, eq(recipe_items.ingredient_id, ingredients.id))
      .where(eq(recipe_items.tenant_id, user.tenant_id))
      .groupBy(recipe_items.menu_id);

    const menuRows = await db.select({ id: menus.id, name: menus.name, price: menus.price })
      .from(menus).where(and(eq(menus.tenant_id, user.tenant_id), eq(menus.is_active, true)));
    const costByMenu = new Map(recipeRows.map((r) => [r.menu_id, Number(r.cost)]));

    return menuRows
      .filter((m) => costByMenu.has(m.id))
      .map((m) => {
        const hpp = costByMenu.get(m.id)!;
        const ratio = m.price > 0 ? Math.round((hpp / m.price) * 100) : 0;
        return { menu_id: m.id, menu_name: m.name, hpp, price: m.price, ratio_percent: ratio, over_threshold: ratio > 35 };
      })
      .sort((a, b) => b.ratio_percent - a.ratio_percent);
  }
);

// ── GET /api/v1/reports/waste (Resto Pro & Business) ──────────────────────────

app.get(
  '/api/v1/reports/waste',
  { preHandler: [requireAuth, requireFeature('food_cost_report')] },
  async (req) => {
    const { from, to } = dateRangeQuery.parse(req.query);
    const user = jwtUser(req);
    const { fromDate, toDate } = parseRange(from, to);

    const rows = await db
      .select({
        id: ingredient_waste_logs.id,
        ingredient_name: ingredients.name,
        qty: ingredient_waste_logs.qty,
        unit: ingredients.unit,
        estimated_value: ingredient_waste_logs.estimated_value,
        reason: ingredient_waste_logs.reason,
        created_at: ingredient_waste_logs.created_at,
      })
      .from(ingredient_waste_logs)
      .innerJoin(ingredients, eq(ingredient_waste_logs.ingredient_id, ingredients.id))
      .where(and(eq(ingredient_waste_logs.tenant_id, user.tenant_id), between(ingredient_waste_logs.created_at, fromDate, toDate)))
      .orderBy(sql`${ingredient_waste_logs.created_at} desc`);

    return { items: rows, total_value: rows.reduce((sum, r) => sum + r.estimated_value, 0) };
  }
);

// ── GET /api/v1/reports/pnl (Resto Pro & Business) ─────────────────────────────
// Laba rugi sederhana: Pendapatan - COGS (HPP terjual) - Operasional = Laba Bersih.

app.get(
  '/api/v1/reports/pnl',
  { preHandler: [requireAuth, requireFeature('pnl_report')] },
  async (req) => {
    const { from, to } = dateRangeQuery.parse(req.query);
    const user = jwtUser(req);
    const { fromDate, toDate } = parseRange(from, to);

    const [{ revenue }] = await db
      .select({ revenue: sql<number>`coalesce(sum(${pos_orders.total}), 0)` })
      .from(pos_orders)
      .where(and(eq(pos_orders.tenant_id, user.tenant_id), eq(pos_orders.status, 'paid'), between(pos_orders.created_at, fromDate, toDate)));

    const soldItems = await db
      .select({ menu_id: pos_order_items.menu_id, qty: pos_order_items.qty })
      .from(pos_order_items)
      .innerJoin(pos_orders, eq(pos_order_items.order_id, pos_orders.id))
      .where(and(eq(pos_orders.tenant_id, user.tenant_id), eq(pos_orders.status, 'paid'), between(pos_orders.created_at, fromDate, toDate)));

    const hppByMenu = await db
      .select({ menu_id: recipe_items.menu_id, cost: sql<number>`sum(${recipe_items.qty_used} * ${ingredients.cost_per_unit})` })
      .from(recipe_items)
      .innerJoin(ingredients, eq(recipe_items.ingredient_id, ingredients.id))
      .where(eq(recipe_items.tenant_id, user.tenant_id))
      .groupBy(recipe_items.menu_id);
    const hppMap = new Map(hppByMenu.map((r) => [r.menu_id, Number(r.cost)]));
    const cogs = soldItems.reduce((sum, item) => sum + (item.menu_id ? (hppMap.get(item.menu_id) ?? 0) * item.qty : 0), 0);

    const [{ operational }] = await db
      .select({ operational: sql<number>`coalesce(sum(${operational_expenses.amount}), 0)` })
      .from(operational_expenses)
      .where(and(eq(operational_expenses.tenant_id, user.tenant_id), between(operational_expenses.spent_at, from, to)));

    const rev = Number(revenue);
    const op = Number(operational);
    return { revenue: rev, cogs, operational: op, net_profit: rev - cogs - op };
  }
);

// ── GET /api/v1/reports/cashflow (Resto Pro & Business) ────────────────────────

app.get(
  '/api/v1/reports/cashflow',
  { preHandler: [requireAuth, requireFeature('pnl_report')] },
  async (req) => {
    const { from, to } = dateRangeQuery.parse(req.query);
    const user = jwtUser(req);
    const { fromDate, toDate } = parseRange(from, to);

    const cashIn = await db
      .select({ payment_method: pos_orders.payment_method, total: sql<number>`coalesce(sum(${pos_orders.total}), 0)` })
      .from(pos_orders)
      .where(and(eq(pos_orders.tenant_id, user.tenant_id), eq(pos_orders.status, 'paid'), between(pos_orders.created_at, fromDate, toDate)))
      .groupBy(pos_orders.payment_method);

    const cashOut = await db
      .select({ category: operational_expenses.category, total: sql<number>`coalesce(sum(${operational_expenses.amount}), 0)` })
      .from(operational_expenses)
      .where(and(eq(operational_expenses.tenant_id, user.tenant_id), between(operational_expenses.spent_at, from, to)))
      .groupBy(operational_expenses.category);

    const totalIn = cashIn.reduce((sum, r) => sum + Number(r.total), 0);
    const totalOut = cashOut.reduce((sum, r) => sum + Number(r.total), 0);
    return {
      cash_in: cashIn.map((r) => ({ payment_method: r.payment_method, total: Number(r.total) })),
      cash_out: cashOut.map((r) => ({ category: r.category, total: Number(r.total) })),
      total_in: totalIn,
      total_out: totalOut,
      saldo_akhir: totalIn - totalOut,
    };
  }
);

// Catat pengeluaran operasional manual (gaji, sewa, dll) — dasar untuk P&L & cashflow.
const expenseBody = z.object({
  category: z.enum(['gaji', 'sewa', 'listrik', 'bahan_baku', 'lainnya']),
  amount: z.number().int().positive(),
  note: z.string().nullable().optional(),
  spent_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  outlet_id: z.string().uuid().nullable().optional(),
});

app.post(
  '/api/v1/reports/expenses',
  { preHandler: [requireAuth, requireFeature('pnl_report')] },
  async (req, reply) => {
    const body = expenseBody.parse(req.body);
    const user = jwtUser(req);
    const [row] = await db.insert(operational_expenses).values({ ...body, tenant_id: user.tenant_id, created_by: user.sub }).returning();
    return reply.code(201).send(row);
  }
);

// Catat waste bahan baku (kadaluarsa/rusak/salah masak) — dipakai Laporan Waste.
const wasteBody = z.object({
  ingredient_id: z.string().uuid(),
  qty: z.number().int().positive(),
  estimated_value: z.number().int().min(0),
  reason: z.string().max(100).nullable().optional(),
});

app.post(
  '/api/v1/reports/waste',
  { preHandler: [requireAuth, requireFeature('food_cost_report')] },
  async (req, reply) => {
    const body = wasteBody.parse(req.body);
    const user = jwtUser(req);
    const [row] = await db.insert(ingredient_waste_logs).values({ ...body, tenant_id: user.tenant_id, recorded_by: user.sub }).returning();
    return reply.code(201).send(row);
  }
);

app.setErrorHandler((error: Error & { statusCode?: number; code?: string }, _req, reply) => {
  app.log.error(error);
  reply.code(error.statusCode ?? 500).send({ error: error.message, code: error.code || 'INTERNAL_ERROR' });
});

const port = parseInt(process.env.PORT || '3008');
app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) { app.log.error(err); process.exit(1); }
});
