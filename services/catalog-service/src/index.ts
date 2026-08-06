import 'dotenv/config';
import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { createDb, createR2Client, uploadToR2, extensionForMimeType } from '@ipos-cloud/shared';
import {
  categories, menus,
  variant_groups, variant_options, menu_variant_groups,
} from '@ipos-cloud/drizzle-schema';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info' } });
app.register(cors, { origin: process.env.CORS_ORIGIN || true, credentials: true });
app.register(jwt, {
  secret: { public: process.env.JWT_PUBLIC_KEY!.replace(/\\n/g, '\n') },
});
app.register(multipart, { limits: { fileSize: 2 * 1024 * 1024 } }); // 2MB, sama batasnya dengan LogoUploader di frontend

const r2 = createR2Client();

const db = createDb(process.env.DATABASE_URL!);
const TABLE_SERVICE_URL = process.env.TABLE_SERVICE_URL || 'http://localhost:3007';

async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
  }
}

// qr_token -> tenant_id, lewat table-service (satu-satunya pemilik data qr_token).
async function resolveTenantFromQrToken(qrToken: string): Promise<string | null> {
  const res = await fetch(`${TABLE_SERVICE_URL}/api/v1/tables/qr/${qrToken}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { tenant_id: string };
  return data.tenant_id;
}

const tenantId = (req: FastifyRequest) =>
  (req as unknown as { user: { tenant_id: string } }).user.tenant_id;

app.get('/health', async () => ({ status: 'ok', service: 'catalog-service', version: '0.1.0' }));

// ── Categories ──────────────────────────────────────────────────────────────

const categoryBody = z.object({
  name: z.string().min(1).max(255),
  sort_order: z.number().int().optional(),
});

app.get('/api/v1/catalog/categories', { preHandler: requireAuth }, async (req) =>
  db.select().from(categories).where(eq(categories.tenant_id, tenantId(req)))
);

app.post('/api/v1/catalog/categories', { preHandler: requireAuth }, async (req, reply) => {
  const body = categoryBody.parse(req.body);
  const [row] = await db.insert(categories).values({ ...body, tenant_id: tenantId(req) }).returning();
  return reply.code(201).send(row);
});

app.put('/api/v1/catalog/categories/:id', { preHandler: requireAuth }, async (req, reply) => {
  const body = categoryBody.partial().parse(req.body);
  const { id } = req.params as { id: string };
  const [row] = await db.update(categories)
    .set({ ...body, updated_at: new Date() })
    .where(and(eq(categories.id, id), eq(categories.tenant_id, tenantId(req))))
    .returning();
  if (!row) return reply.code(404).send({ error: 'Not found' });
  return row;
});

app.delete('/api/v1/catalog/categories/:id', { preHandler: requireAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  await db.delete(categories)
    .where(and(eq(categories.id, id), eq(categories.tenant_id, tenantId(req))));
  return reply.code(204).send();
});

// ── Menus ────────────────────────────────────────────────────────────────────

const menuBody = z.object({
  name: z.string().min(1).max(255),
  price: z.number().int().min(0),
  discount_price: z.number().int().min(0).nullable().optional(), // dihitung frontend dari discount_type/value — dipakai langsung di kasir & struk
  discount_type: z.enum(['nominal', 'percent']).nullable().optional(),
  discount_value: z.number().int().min(0).nullable().optional(),
  category_id: z.string().uuid().nullable().optional(),
  description: z.string().optional(),
  image_url: z.string().url().nullable().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

app.get('/api/v1/catalog/menus', { preHandler: requireAuth }, async (req) =>
  db.select().from(menus).where(eq(menus.tenant_id, tenantId(req)))
);

app.post('/api/v1/catalog/menus', { preHandler: requireAuth }, async (req, reply) => {
  const body = menuBody.parse(req.body);
  const [row] = await db.insert(menus).values({ ...body, tenant_id: tenantId(req) }).returning();
  return reply.code(201).send(row);
});

app.put('/api/v1/catalog/menus/:id', { preHandler: requireAuth }, async (req, reply) => {
  const body = menuBody.partial().parse(req.body);
  const { id } = req.params as { id: string };
  const [row] = await db.update(menus)
    .set({ ...body, updated_at: new Date() })
    .where(and(eq(menus.id, id), eq(menus.tenant_id, tenantId(req))))
    .returning();
  if (!row) return reply.code(404).send({ error: 'Not found' });
  return row;
});

app.delete('/api/v1/catalog/menus/:id', { preHandler: requireAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  await db.delete(menus)
    .where(and(eq(menus.id, id), eq(menus.tenant_id, tenantId(req))));
  return reply.code(204).send();
});

app.post('/api/v1/catalog/menus/:id/sold-out', { preHandler: requireAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  const { is_sold_out } = z.object({ is_sold_out: z.boolean() }).parse(req.body);
  const [row] = await db.update(menus)
    .set({ is_sold_out, updated_at: new Date() })
    .where(and(eq(menus.id, id), eq(menus.tenant_id, tenantId(req))))
    .returning();
  if (!row) return reply.code(404).send({ error: 'Not found' });
  return row;
});

// Upload foto menu ke Cloudflare R2 — key overwrite (ganti foto = upload ulang), jadi tidak menyisakan file lama.
app.post('/api/v1/catalog/menus/:id/photo', { preHandler: requireAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  const tid = tenantId(req);
  const [menu] = await db.select({ id: menus.id }).from(menus).where(and(eq(menus.id, id), eq(menus.tenant_id, tid)));
  if (!menu) return reply.code(404).send({ error: 'Not found' });

  const file = await req.file();
  if (!file) return reply.code(400).send({ error: 'File tidak ditemukan', code: 'NO_FILE' });
  const ext = extensionForMimeType(file.mimetype);
  if (!ext) return reply.code(400).send({ error: 'Format harus JPG, PNG, atau WEBP', code: 'INVALID_TYPE' });

  const buffer = await file.toBuffer();
  const image_url = await uploadToR2(r2, `tenants/${tid}/menus/${id}.${ext}`, buffer, file.mimetype);
  const [row] = await db.update(menus).set({ image_url, updated_at: new Date() }).where(eq(menus.id, id)).returning();
  return row;
});

// ── Variant Groups ────────────────────────────────────────────────────────────
// Grup variasi tersimpan (mis. "Level Pedas"), dibuat sekali & dipasang ke banyak menu.

const optionSchema = z.object({
  name: z.string().min(1).max(255),
  price_delta: z.number().int().default(0),
});
const groupBody = z.object({
  name: z.string().min(1).max(255),
  selection: z.enum(['single', 'multi']).default('single'),
  required: z.boolean().default(false),
  options: z.array(optionSchema).min(1),
});

// List grup + opsinya (buat halaman Menu & POS)
app.get('/api/v1/catalog/variant-groups', { preHandler: requireAuth }, async (req) => {
  const tid = tenantId(req);
  const groups = await db.select().from(variant_groups).where(eq(variant_groups.tenant_id, tid));
  const options = await db.select().from(variant_options).where(eq(variant_options.tenant_id, tid));
  return groups.map((g) => ({
    ...g,
    options: options.filter((o) => o.group_id === g.id).sort((a, b) => a.sort_order - b.sort_order),
  }));
});

app.post('/api/v1/catalog/variant-groups', { preHandler: requireAuth }, async (req, reply) => {
  const body = groupBody.parse(req.body);
  const tid = tenantId(req);
  const [group] = await db.insert(variant_groups)
    .values({ tenant_id: tid, name: body.name, selection: body.selection, required: body.required })
    .returning();
  await db.insert(variant_options).values(
    body.options.map((o, i) => ({ group_id: group.id, tenant_id: tid, name: o.name, price_delta: o.price_delta, sort_order: i }))
  );
  return reply.code(201).send({ ...group, options: body.options });
});

// Ganti isi grup: hapus opsi lama, isi baru (paling sederhana & aman untuk edit).
app.put('/api/v1/catalog/variant-groups/:id', { preHandler: requireAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  const body = groupBody.parse(req.body);
  const tid = tenantId(req);
  const [group] = await db.update(variant_groups)
    .set({ name: body.name, selection: body.selection, required: body.required })
    .where(and(eq(variant_groups.id, id), eq(variant_groups.tenant_id, tid)))
    .returning();
  if (!group) return reply.code(404).send({ error: 'Not found' });
  await db.delete(variant_options).where(and(eq(variant_options.group_id, id), eq(variant_options.tenant_id, tid)));
  await db.insert(variant_options).values(
    body.options.map((o, i) => ({ group_id: id, tenant_id: tid, name: o.name, price_delta: o.price_delta, sort_order: i }))
  );
  return { ...group, options: body.options };
});

app.delete('/api/v1/catalog/variant-groups/:id', { preHandler: requireAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  await db.delete(variant_groups).where(and(eq(variant_groups.id, id), eq(variant_groups.tenant_id, tenantId(req))));
  return reply.code(204).send();
});

// ── Pasang grup variasi ke menu ────────────────────────────────────────────────

// Ambil mapping menu -> grup (dipakai POS untuk tahu menu mana punya variasi apa)
app.get('/api/v1/catalog/menu-variant-groups', { preHandler: requireAuth }, async (req) =>
  db.select().from(menu_variant_groups).where(eq(menu_variant_groups.tenant_id, tenantId(req)))
);

// Set daftar grup untuk satu menu (replace semua).
app.put('/api/v1/catalog/menus/:id/variant-groups', { preHandler: requireAuth }, async (req, reply) => {
  const { id } = req.params as { id: string };
  const { group_ids } = z.object({ group_ids: z.array(z.string().uuid()) }).parse(req.body);
  const tid = tenantId(req);
  const [menu] = await db.select({ id: menus.id }).from(menus)
    .where(and(eq(menus.id, id), eq(menus.tenant_id, tid))).limit(1);
  if (!menu) return reply.code(404).send({ error: 'Menu not found' });

  await db.delete(menu_variant_groups).where(and(eq(menu_variant_groups.menu_id, id), eq(menu_variant_groups.tenant_id, tid)));
  if (group_ids.length) {
    await db.insert(menu_variant_groups).values(
      group_ids.map((gid) => ({ menu_id: id, variant_group_id: gid, tenant_id: tid }))
    );
  }
  return { ok: true, group_ids };
});

// ── Menu publik (QR self-order, tanpa auth — scoped lewat qr_token, bukan tenant_id) ──

app.get('/api/v1/menus/public/:qr_token', async (req, reply) => {
  const { qr_token } = req.params as { qr_token: string };
  const tid = await resolveTenantFromQrToken(qr_token);
  if (!tid) return reply.code(404).send({ error: 'Meja tidak ditemukan', code: 'NOT_FOUND' });

  const [menuRows, categoryRows, groups, options, mapping] = await Promise.all([
    db.select().from(menus).where(and(eq(menus.tenant_id, tid), eq(menus.is_active, true), eq(menus.is_sold_out, false))),
    db.select().from(categories).where(and(eq(categories.tenant_id, tid), eq(categories.is_active, true))),
    db.select().from(variant_groups).where(eq(variant_groups.tenant_id, tid)),
    db.select().from(variant_options).where(eq(variant_options.tenant_id, tid)),
    db.select().from(menu_variant_groups).where(eq(menu_variant_groups.tenant_id, tid)),
  ]);

  const groupsById = new Map(groups.map((g) => [g.id, { ...g, options: options.filter((o) => o.group_id === g.id) }]));
  return {
    categories: categoryRows,
    menus: menuRows.map((m) => ({
      ...m,
      variant_groups: mapping.filter((mp) => mp.menu_id === m.id).map((mp) => groupsById.get(mp.variant_group_id)).filter(Boolean),
    })),
  };
});

app.setErrorHandler((error: Error & { statusCode?: number; code?: string }, _req, reply) => {
  app.log.error(error);
  reply.code(error.statusCode ?? 500).send({ error: error.message, code: error.code || 'INTERNAL_ERROR' });
});

const port = parseInt(process.env.PORT || '3004');
app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) { app.log.error(err); process.exit(1); }
});
