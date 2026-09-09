import 'dotenv/config';
import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { z } from 'zod';
import { eq, and, inArray, sql } from 'drizzle-orm';
import { createDb, requireFeature } from '@ipos-cloud/shared';
import { menus, stock_levels, ingredients, recipe_items } from '@ipos-cloud/drizzle-schema';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info' } });
app.register(cors, { origin: process.env.CORS_ORIGIN?.split(',') || true, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] });
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

// Dipakai pos-service untuk order dari QR self-order pelanggan (tidak ada JWT staff) —
// sama pola dengan notification-service. Body harus bawa tenant_id sendiri saat pakai ini.
async function requireStaffOrInternal(request: FastifyRequest, reply: FastifyReply) {
  const internalKey = request.headers['x-internal-api-key'];
  if (process.env.INTERNAL_API_KEY && internalKey === process.env.INTERNAL_API_KEY) return;
  await requireAuth(request, reply);
}

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

// ── BOM: bahan baku (Resto Starter+) ──────────────────────────────────────────

const ingredientBody = z.object({
  name: z.string().min(1).max(255),
  unit: z.string().min(1).max(20),
  stock_qty: z.number().int().min(0).default(0),
  low_stock_threshold: z.number().int().min(0).default(0),
});

app.get(
  '/api/v1/inventory/ingredients',
  { preHandler: [requireAuth, requireFeature('bom_recipe')] },
  async (req) => db.select().from(ingredients).where(eq(ingredients.tenant_id, jwtUser(req).tenant_id))
);

app.post(
  '/api/v1/inventory/ingredients',
  { preHandler: [requireAuth, requireFeature('bom_recipe')] },
  async (req, reply) => {
    const body = ingredientBody.parse(req.body);
    const [row] = await db.insert(ingredients).values({ ...body, tenant_id: jwtUser(req).tenant_id }).returning();
    return reply.code(201).send(row);
  }
);

app.put(
  '/api/v1/inventory/ingredients/:id',
  { preHandler: [requireAuth, requireFeature('bom_recipe')] },
  async (req, reply) => {
    const body = ingredientBody.partial().parse(req.body);
    const { id } = req.params as { id: string };
    const [row] = await db.update(ingredients)
      .set({ ...body, updated_at: new Date() })
      .where(and(eq(ingredients.id, id), eq(ingredients.tenant_id, jwtUser(req).tenant_id)))
      .returning();
    if (!row) return reply.code(404).send({ error: 'Not found' });
    return row;
  }
);

app.post(
  '/api/v1/inventory/ingredients/:id/restock',
  { preHandler: [requireAuth, requireFeature('bom_recipe')] },
  async (req, reply) => {
    const { qty_added } = restockBody.parse(req.body);
    const { id } = req.params as { id: string };
    const [row] = await db.update(ingredients)
      .set({ stock_qty: sql`${ingredients.stock_qty} + ${qty_added}`, updated_at: new Date() })
      .where(and(eq(ingredients.id, id), eq(ingredients.tenant_id, jwtUser(req).tenant_id)))
      .returning();
    if (!row) return reply.code(404).send({ error: 'Not found' });
    return row;
  }
);

// Resep satu menu: daftar bahan + qty per porsi. Replace-semua saat PUT (sama pola dengan variant-groups).
const recipeBody = z.object({
  items: z.array(z.object({ ingredient_id: z.string().uuid(), qty_used: z.number().int().positive() })),
});

app.get(
  '/api/v1/inventory/menus/:menu_id/recipe',
  { preHandler: [requireAuth, requireFeature('bom_recipe')] },
  async (req) => {
    const { menu_id } = req.params as { menu_id: string };
    return db.select().from(recipe_items)
      .where(and(eq(recipe_items.menu_id, menu_id), eq(recipe_items.tenant_id, jwtUser(req).tenant_id)));
  }
);

app.put(
  '/api/v1/inventory/menus/:menu_id/recipe',
  { preHandler: [requireAuth, requireFeature('bom_recipe')] },
  async (req, reply) => {
    const { menu_id } = req.params as { menu_id: string };
    const { items } = recipeBody.parse(req.body);
    const tid = jwtUser(req).tenant_id;

    const [menu] = await db.select({ id: menus.id }).from(menus)
      .where(and(eq(menus.id, menu_id), eq(menus.tenant_id, tid))).limit(1);
    if (!menu) return reply.code(404).send({ error: 'Menu tidak ditemukan', code: 'NOT_FOUND' });

    await db.delete(recipe_items).where(and(eq(recipe_items.menu_id, menu_id), eq(recipe_items.tenant_id, tid)));
    if (items.length) {
      await db.insert(recipe_items).values(
        items.map((i) => ({ tenant_id: tid, menu_id, ingredient_id: i.ingredient_id, qty_used: i.qty_used }))
      );
    }
    return { menu_id, items };
  }
);

// Dipanggil pos-service setelah order dibuat — kurangi stok bahan baku sesuai resep tiap item.
// Best-effort dari sisi caller: kalau bahan tidak cukup di sini, stok bisa negatif (tidak
// memblokir order yang sudah terjadi di kasir) — alert "bahan menipis" pakai low_stock_threshold.
// Lewat JWT kasir (order manual) atau INTERNAL_API_KEY (order dari QR self-order pelanggan) —
// pos-service sudah cek hasFeature('bom_recipe') sendiri sebelum memanggil ini.
const deductBody = z.object({
  tenant_id: z.string().uuid().optional(),
  items: z.array(z.object({ menu_id: z.string().uuid(), qty: z.number().int().positive() })),
});

app.post(
  '/api/v1/inventory/deduct-for-order',
  { preHandler: requireStaffOrInternal },
  async (req, reply) => {
    const { items, tenant_id } = deductBody.parse(req.body);
    const internalKey = req.headers['x-internal-api-key'];
    const tid = (process.env.INTERNAL_API_KEY && internalKey === process.env.INTERNAL_API_KEY)
      ? tenant_id!
      : jwtUser(req).tenant_id;
    const menuIds = items.map((i) => i.menu_id);
    if (!menuIds.length) return reply.code(200).send({ ok: true });

    const recipes = await db.select().from(recipe_items)
      .where(and(inArray(recipe_items.menu_id, menuIds), eq(recipe_items.tenant_id, tid)));

    const usageByIngredient = new Map<string, number>();
    for (const item of items) {
      for (const recipe of recipes.filter((r) => r.menu_id === item.menu_id)) {
        usageByIngredient.set(
          recipe.ingredient_id,
          (usageByIngredient.get(recipe.ingredient_id) ?? 0) + recipe.qty_used * item.qty
        );
      }
    }
    for (const [ingredientId, qty] of usageByIngredient) {
      await db.update(ingredients)
        .set({ stock_qty: sql`${ingredients.stock_qty} - ${qty}`, updated_at: new Date() })
        .where(and(eq(ingredients.id, ingredientId), eq(ingredients.tenant_id, tid)));
    }
    return reply.code(200).send({ ok: true, deducted: usageByIngredient.size });
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
