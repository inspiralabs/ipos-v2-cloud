import 'dotenv/config';
import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { z } from 'zod';
import { and, eq, between, sql } from 'drizzle-orm';
import { createDb, requireFeature } from '@ipos-cloud/shared';
import { pos_orders, pos_order_items, menus } from '@ipos-cloud/drizzle-schema';
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

app.setErrorHandler((error: Error & { statusCode?: number; code?: string }, _req, reply) => {
  app.log.error(error);
  reply.code(error.statusCode ?? 500).send({ error: error.message, code: error.code || 'INTERNAL_ERROR' });
});

const port = parseInt(process.env.PORT || '3008');
app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) { app.log.error(err); process.exit(1); }
});
