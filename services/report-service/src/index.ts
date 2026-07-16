import 'dotenv/config';
import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { z } from 'zod';
import { and, eq, between, sql } from 'drizzle-orm';
import { createDb } from '@ipos-cloud/shared';
import { pos_orders, pos_order_items, menus } from '@ipos-cloud/drizzle-schema';

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

function parseRange(from: string, to: string) {
  const fromDate = new Date(from + 'T00:00:00Z');
  const toDate = new Date(to + 'T23:59:59Z');
  const spanMs = toDate.getTime() - fromDate.getTime();
  const prevTo = new Date(fromDate.getTime() - 1000); // 1 second before current range starts
  const prevFrom = new Date(prevTo.getTime() - spanMs);
  return { fromDate, toDate, prevFrom, prevTo };
}

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

app.setErrorHandler((error: Error & { statusCode?: number; code?: string }, _req, reply) => {
  app.log.error(error);
  reply.code(error.statusCode ?? 500).send({ error: error.message, code: error.code || 'INTERNAL_ERROR' });
});

const port = parseInt(process.env.PORT || '3008');
app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) { app.log.error(err); process.exit(1); }
});
