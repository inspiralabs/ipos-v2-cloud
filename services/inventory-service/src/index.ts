import 'dotenv/config';
import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { createDb, requireFeature } from '@ipos-cloud/shared';
import { menus, stock_levels } from '@ipos-cloud/drizzle-schema';

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

app.get('/health', async () => ({ status: 'ok', service: 'inventory-service', version: '0.1.0' }));

// ── GET /api/v1/inventory/stock-levels ────────────────────────────────────────

app.get(
  '/api/v1/inventory/stock-levels',
  { preHandler: [requireAuth, requireFeature('stock_management')] },
  async (req) => {
    const user = jwtUser(req);
    const rows = await db
      .select({
        menu_id: menus.id,
        menu_name: menus.name,
        stock_qty: stock_levels.stock_qty,
        low_stock_threshold: stock_levels.low_stock_threshold,
      })
      .from(menus)
      .innerJoin(stock_levels, eq(stock_levels.menu_id, menus.id))
      .where(and(eq(menus.tenant_id, user.tenant_id), eq(menus.is_active, true)));

    return rows.map((r) => ({
      menu_id: r.menu_id,
      menu_name: r.menu_name,
      stock_qty: Number(r.stock_qty),
      low_stock_threshold: Number(r.low_stock_threshold),
    }));
  }
);

// ── POST /api/v1/inventory/stock-levels/:menu_id/restock ─────────────────────

const restockBody = z.object({ qty_added: z.number().int().positive() });

app.post(
  '/api/v1/inventory/stock-levels/:menu_id/restock',
  { preHandler: [requireAuth, requireFeature('stock_management')] },
  async (req, reply) => {
    const { qty_added } = restockBody.parse(req.body);
    const { menu_id } = req.params as { menu_id: string };
    const user = jwtUser(req);

    const [menu] = await db
      .select({ id: menus.id, name: menus.name })
      .from(menus)
      .where(and(eq(menus.id, menu_id), eq(menus.tenant_id, user.tenant_id)));
    if (!menu) return reply.code(404).send({ error: 'Menu tidak ditemukan', code: 'NOT_FOUND' });

    const [existing] = await db
      .select()
      .from(stock_levels)
      .where(and(eq(stock_levels.menu_id, menu_id), eq(stock_levels.tenant_id, user.tenant_id)));

    const row = existing
      ? (
          await db
            .update(stock_levels)
            .set({ stock_qty: existing.stock_qty + qty_added, updated_at: new Date() })
            .where(eq(stock_levels.id, existing.id))
            .returning()
        )[0]
      : (
          await db
            .insert(stock_levels)
            .values({ tenant_id: user.tenant_id, menu_id, stock_qty: qty_added })
            .returning()
        )[0];

    return {
      menu_id: menu.id,
      menu_name: menu.name,
      stock_qty: row.stock_qty,
      low_stock_threshold: row.low_stock_threshold,
    };
  }
);

app.setErrorHandler((error: Error & { statusCode?: number; code?: string }, _req, reply) => {
  app.log.error(error);
  reply.code(error.statusCode ?? 500).send({ error: error.message, code: error.code || 'INTERNAL_ERROR' });
});

const port = parseInt(process.env.PORT || '3005');
app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) { app.log.error(err); process.exit(1); }
});
