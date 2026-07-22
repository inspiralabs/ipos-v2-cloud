import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, desc, ilike, and, isNull, isNotNull, inArray, sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { tenants, users } from '@ipos-cloud/drizzle-schema';
import { logAdminAction } from '@ipos-cloud/shared';
import { adminGuard, superAdminGuard } from '../../middleware/admin-guard.js';

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// Fire-and-forget — kegagalan kirim email tidak boleh membatalkan pembuatan tenant
// (admin masih bisa salin password manual dari response). Lihat notification-service/src/routes/send.ts.
async function notifyTenantInvitation(vars: { name: string; tenant_name: string; email: string; password: string }) {
  const url = process.env.NOTIFICATION_SERVICE_URL;
  if (!url || !process.env.INTERNAL_API_KEY) return;
  try {
    await fetch(`${url}/api/v1/notify/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-api-key': process.env.INTERNAL_API_KEY },
      body: JSON.stringify({ template_key: 'tenant.invitation', to: vars.email, vars }),
    });
  } catch {
    // diamkan — admin tetap punya password dari response HTTP untuk dikirim manual
  }
}

export async function tenantsAdminRoutes(app: FastifyInstance) {
  // List tenants (+ email pemilik via join ke users, buat tampilan admin-app)
  app.get('/', { preHandler: adminGuard }, async (request: any) => {
    const { status, search, includeDeleted, page = '1', limit = '20' } = request.query as Record<string, string>;
    const db = (app as any).db;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const conditions = [];
    if (!includeDeleted) conditions.push(isNull(tenants.deleted_at));
    if (status) conditions.push(eq(tenants.status, status));
    if (search) conditions.push(ilike(tenants.name, `%${search}%`));

    const where = conditions.length ? and(...conditions) : undefined;
    const [rows, [{ count }]] = await Promise.all([
      db.select({
        id: tenants.id,
        name: tenants.name,
        slug: tenants.slug,
        plan: tenants.plan_code,
        status: tenants.status,
        email: users.email,
        trial_ends_at: tenants.trial_ends_at,
        created_at: tenants.created_at,
      }).from(tenants)
        .leftJoin(users, eq(users.id, tenants.owner_id))
        .where(where)
        .orderBy(desc(tenants.created_at))
        .limit(parseInt(limit))
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(tenants).where(where),
    ]);

    return { data: rows, total: count, page: parseInt(page), limit: parseInt(limit) };
  });

  // Create tenant
  app.post('/', { preHandler: adminGuard }, async (request: any, reply) => {
    const body = z.object({
      name: z.string().min(2),
      email: z.string().email(),
      phone: z.string().optional(),
      plan_code: z.enum(['umkm_lite', 'umkm_pro', 'resto_basic', 'resto_starter', 'resto_pro', 'resto_business']).default('umkm_lite'),
      mode: z.enum(['trial', 'active']).default('trial'),
      trial_days: z.number().default(14),
      notes: z.string().optional(),
    }).parse(request.body);

    const db = (app as any).db;
    const slug = slugify(body.name);
    const trial_ends_at = body.mode === 'trial' ? new Date(Date.now() + body.trial_days * 86400000) : null;

    const [tenant] = await db.insert(tenants).values({
      name: body.name,
      slug,
      plan_code: body.plan_code,
      status: body.mode,
      trial_ends_at,
      notes: body.notes,
    }).returning();

    // Create owner user
    const tempPassword = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    const password_hash = await bcrypt.hash(tempPassword, 10);
    await db.insert(users).values({
      tenant_id: tenant.id,
      name: body.name,
      email: body.email,
      phone: body.phone,
      password_hash,
      role: 'owner',
    });

    await logAdminAction(db, {
      adminId: (request.user as any).sub,
      action: 'tenant.created',
      targetType: 'tenant',
      targetId: tenant.id,
      targetName: tenant.name,
      // ponytail: password TIDAK dicatat di audit log (plaintext permanen di tabel
      // audit itu buruk) — cuma dikembalikan sekali di response HTTP di bawah.
      after: { slug, plan_code: body.plan_code, status: body.mode },
      ipAddress: request.ip,
    });

    // owner_temp_password cuma muncul SEKALI di sini — tidak disimpan plaintext di mana
    // pun, tidak bisa diambil ulang. Email undangan dikirim otomatis; response tetap
    // menyertakan password sebagai fallback kalau pengiriman email gagal.
    await notifyTenantInvitation({ name: body.name, tenant_name: tenant.name, email: body.email, password: tempPassword });
    return reply.code(201).send({ ...tenant, owner_temp_password: tempPassword });
  });

  // Get tenant
  app.get('/:id', { preHandler: adminGuard }, async (request: any, reply) => {
    const db = (app as any).db;
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, request.params.id)).limit(1);
    if (!tenant) return reply.code(404).send({ error: 'Tenant not found', code: 'NOT_FOUND' });
    return tenant;
  });

  // Update tenant
  app.patch('/:id', { preHandler: adminGuard }, async (request: any, reply) => {
    const body = z.object({
      name: z.string().optional(),
      timezone: z.string().optional(),
      logo_url: z.string().optional(),
      notes: z.string().optional(),
    }).parse(request.body);

    const db = (app as any).db;
    const [before] = await db.select().from(tenants).where(eq(tenants.id, request.params.id)).limit(1);
    if (!before) return reply.code(404).send({ error: 'Not found', code: 'NOT_FOUND' });

    const [after] = await db.update(tenants)
      .set({ ...body, updated_at: new Date() })
      .where(eq(tenants.id, request.params.id))
      .returning();

    await logAdminAction(db, { adminId: (request.user as any).sub, action: 'tenant.updated', targetType: 'tenant', targetId: request.params.id, targetName: before.name, before, after, ipAddress: request.ip });
    return after;
  });

  // Lifecycle actions
  app.post('/:id/activate', { preHandler: adminGuard }, async (request: any) => {
    const db = (app as any).db;
    await db.update(tenants).set({ status: 'active', activated_at: new Date(), updated_at: new Date() }).where(eq(tenants.id, request.params.id));
    await logAdminAction(db, { adminId: (request.user as any).sub, action: 'tenant.activated', targetType: 'tenant', targetId: request.params.id, ipAddress: request.ip });
    return { ok: true };
  });

  app.post('/:id/suspend', { preHandler: adminGuard }, async (request: any) => {
    const { reason } = z.object({ reason: z.string().min(3) }).parse(request.body);
    const db = (app as any).db;
    const [before] = await db.select().from(tenants).where(eq(tenants.id, request.params.id)).limit(1);
    await db.update(tenants).set({ status: 'suspended', notes: reason, updated_at: new Date() }).where(eq(tenants.id, request.params.id));
    await logAdminAction(db, { adminId: (request.user as any).sub, action: 'tenant.suspended', targetType: 'tenant', targetId: request.params.id, targetName: before?.name, after: { reason }, ipAddress: request.ip });
    return { ok: true };
  });

  app.post('/:id/unsuspend', { preHandler: adminGuard }, async (request: any) => {
    const db = (app as any).db;
    await db.update(tenants).set({ status: 'active', updated_at: new Date() }).where(eq(tenants.id, request.params.id));
    await logAdminAction(db, { adminId: (request.user as any).sub, action: 'tenant.unsuspended', targetType: 'tenant', targetId: request.params.id, ipAddress: request.ip });
    return { ok: true };
  });

  // Jaring pengaman terakhir — kalau owner tenant lupa password DAN tidak akses email
  // (jalur self-service forgot-password gagal). Generate password acak, sama seperti
  // saat create tenant, dikembalikan sekali di response — bukan dari input admin.
  app.post('/:id/reset-owner-password', { preHandler: adminGuard }, async (request: any, reply) => {
    const db = (app as any).db;
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, request.params.id)).limit(1);
    if (!tenant?.owner_id) return reply.code(404).send({ error: 'Tenant atau pemilik toko tidak ditemukan', code: 'NOT_FOUND' });

    const tempPassword = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    const password_hash = await bcrypt.hash(tempPassword, 10);
    await db.update(users).set({ password_hash, updated_at: new Date() }).where(eq(users.id, tenant.owner_id));

    // ponytail: password TIDAK dicatat di audit log — sama seperti tenant.created di atas.
    await logAdminAction(db, {
      adminId: (request.user as any).sub, action: 'tenant.owner_password_reset',
      targetType: 'tenant', targetId: tenant.id, targetName: tenant.name, ipAddress: request.ip,
    });

    return { ok: true, owner_temp_password: tempPassword };
  });

  app.post('/:id/change-plan', { preHandler: adminGuard }, async (request: any) => {
    const { plan_code } = z.object({
      plan_code: z.enum(['umkm_lite', 'umkm_pro', 'resto_basic', 'resto_starter', 'resto_pro', 'resto_business']),
    }).parse(request.body);
    const db = (app as any).db;
    const [before] = await db.select().from(tenants).where(eq(tenants.id, request.params.id)).limit(1);
    await db.update(tenants).set({ plan_code, updated_at: new Date() }).where(eq(tenants.id, request.params.id));
    await logAdminAction(db, { adminId: (request.user as any).sub, action: 'tenant.plan_changed', targetType: 'tenant', targetId: request.params.id, targetName: before?.name, before: { plan: before?.plan_code }, after: { plan: plan_code }, ipAddress: request.ip });
    return { ok: true };
  });

  app.post('/:id/extend-trial', { preHandler: adminGuard }, async (request: any) => {
    const { days } = z.object({ days: z.number().int().min(1) }).parse(request.body);
    const db = (app as any).db;
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, request.params.id)).limit(1);
    const current = tenant?.trial_ends_at ?? new Date();
    const new_ends_at = new Date(Math.max(current.getTime(), Date.now()) + days * 86400000);
    await db.update(tenants).set({ trial_ends_at: new_ends_at, updated_at: new Date() }).where(eq(tenants.id, request.params.id));
    return { ok: true, trial_ends_at: new_ends_at };
  });

  // Terminate (super_admin only)
  app.delete('/:id', { preHandler: superAdminGuard }, async (request: any) => {
    const { confirm_slug } = z.object({ confirm_slug: z.string() }).parse(request.body);
    const db = (app as any).db;
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, request.params.id)).limit(1);
    if (!tenant) throw Object.assign(new Error('Not found'), { statusCode: 404 });
    if (confirm_slug !== tenant.slug) throw Object.assign(new Error('Slug confirmation mismatch'), { statusCode: 400, code: 'SLUG_MISMATCH' });

    await db.update(tenants).set({ status: 'expired', updated_at: new Date() }).where(eq(tenants.id, request.params.id));
    await logAdminAction(db, { adminId: (request.user as any).sub, action: 'tenant.terminated', targetType: 'tenant', targetId: request.params.id, targetName: tenant.name, ipAddress: request.ip });
    return { ok: true };
  });

  // Bulk soft-delete — dipakai action bar "N terpilih" di admin-app.
  app.post('/bulk-delete', { preHandler: adminGuard }, async (request: any) => {
    const { ids } = z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(request.body);
    const db = (app as any).db;
    const rows = await db.update(tenants).set({ deleted_at: new Date() })
      .where(and(inArray(tenants.id, ids), isNull(tenants.deleted_at))).returning({ id: tenants.id, name: tenants.name });

    await logAdminAction(db, { adminId: (request.user as any).sub, action: 'tenant.bulk_deleted', targetType: 'tenant', targetName: rows.map((r: any) => r.name).join(', '), after: { ids: rows.map((r: any) => r.id) }, ipAddress: request.ip });
    return { ok: true, count: rows.length };
  });

  // Bulk hard-delete — super_admin only. Konfirmasi ketik "HAPUS PERMANEN" (bukan slug per
  // tenant seperti hard-delete satuan — tidak realistis menyuruh ketik N slug sekaligus).
  app.post('/bulk-delete/hard', { preHandler: superAdminGuard }, async (request: any, reply) => {
    const { ids, confirm_text } = z.object({ ids: z.array(z.string().uuid()).min(1), confirm_text: z.string() }).parse(request.body);
    if (confirm_text !== 'HAPUS PERMANEN') {
      return reply.code(400).send({ error: 'Teks konfirmasi tidak sesuai', code: 'CONFIRM_MISMATCH' });
    }
    const db = (app as any).db;
    const rows = await db.delete(tenants).where(inArray(tenants.id, ids)).returning({ id: tenants.id, name: tenants.name });

    await logAdminAction(db, { adminId: (request.user as any).sub, action: 'tenant.bulk_hard_deleted', targetType: 'tenant', targetName: rows.map((r: any) => r.name).join(', '), after: { ids: rows.map((r: any) => r.id) }, ipAddress: request.ip });
    return { ok: true, count: rows.length };
  });

  // Hapus sementara — hilang dari daftar default, masih ada di DB, bisa dipulihkan.
  // Beda dari Terminate: ini murni visibilitas di admin panel, tidak mengubah status bisnis tenant.
  app.delete('/:id/soft', { preHandler: adminGuard }, async (request: any, reply) => {
    const db = (app as any).db;
    const [deleted] = await db.update(tenants).set({ deleted_at: new Date() })
      .where(and(eq(tenants.id, request.params.id), isNull(tenants.deleted_at))).returning();
    if (!deleted) return reply.code(404).send({ error: 'Tenant not found', code: 'NOT_FOUND' });

    await logAdminAction(db, { adminId: (request.user as any).sub, action: 'tenant.deleted', targetType: 'tenant', targetId: request.params.id, targetName: deleted.name, ipAddress: request.ip });
    return { ok: true };
  });

  app.post('/:id/restore', { preHandler: adminGuard }, async (request: any, reply) => {
    const db = (app as any).db;
    const [restored] = await db.update(tenants).set({ deleted_at: null })
      .where(and(eq(tenants.id, request.params.id), isNotNull(tenants.deleted_at))).returning();
    if (!restored) return reply.code(404).send({ error: 'Tenant not found or not deleted', code: 'NOT_FOUND' });

    await logAdminAction(db, { adminId: (request.user as any).sub, action: 'tenant.restored', targetType: 'tenant', targetId: request.params.id, targetName: restored.name, ipAddress: request.ip });
    return { ok: true };
  });

  // Hapus permanen — cascade menghapus outlets, feature overrides, dan seluruh data
  // catalog/pos tenant ini (FK onDelete: cascade). Blast radius besar, wajib konfirmasi
  // slug sama seperti Terminate, super_admin only.
  app.delete('/:id/hard', { preHandler: superAdminGuard }, async (request: any, reply) => {
    const { confirm_slug } = z.object({ confirm_slug: z.string() }).parse(request.body);
    const db = (app as any).db;
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, request.params.id)).limit(1);
    if (!tenant) return reply.code(404).send({ error: 'Tenant not found', code: 'NOT_FOUND' });
    if (confirm_slug !== tenant.slug) return reply.code(400).send({ error: 'Slug confirmation mismatch', code: 'SLUG_MISMATCH' });

    await db.delete(tenants).where(eq(tenants.id, request.params.id));
    await logAdminAction(db, { adminId: (request.user as any).sub, action: 'tenant.hard_deleted', targetType: 'tenant', targetId: tenant.id, targetName: tenant.name, ipAddress: request.ip });
    return { ok: true };
  });
}
