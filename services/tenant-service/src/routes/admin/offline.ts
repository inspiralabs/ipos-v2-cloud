import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, desc, and, isNull, isNotNull, inArray, sql } from 'drizzle-orm';
import { offline_clients, offline_licenses } from '@ipos-cloud/drizzle-schema';
import { logAdminAction } from '@ipos-cloud/shared';
import { adminGuard, superAdminGuard } from '../../middleware/admin-guard.js';

// HARUS identik dengan ipos-offline/src/lib/license.ts (deriveKey) dan
// ipos-v1-backend/src/lib/license.ts — device di app kasir memvalidasi
// lisensi secara offline pakai formula yang sama persis, tidak ada
// server round-trip. Beda formula = lisensi hasil generate di sini tidak
// akan pernah valid di app.
async function generateLicenseKey(deviceId: string, plan: 'lite' | 'pro'): Promise<string> {
  const salt = plan === 'lite'
    ? process.env.OFFLINE_LICENSE_SALT_LITE!
    : process.env.OFFLINE_LICENSE_SALT_PRO!;

  const raw = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${deviceId.trim().toLowerCase()}_${salt}`));
  const hex = Buffer.from(raw).toString('hex').toUpperCase();
  return `${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
}

export async function offlineAdminRoutes(app: FastifyInstance) {
  // List offline clients (+ kode lisensi aktif terbaru kalau ada, buat tampilan admin-app)
  app.get('/clients', { preHandler: adminGuard }, async (request: any) => {
    const db = (app as any).db;
    const { includeDeleted, page = '1', limit = '20' } = request.query as Record<string, string>;
    const where = includeDeleted ? undefined : isNull(offline_clients.deleted_at);
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [clients, [{ count }]] = await Promise.all([
      db.select().from(offline_clients).where(where).orderBy(desc(offline_clients.created_at)).limit(parseInt(limit)).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(offline_clients).where(where),
    ]);
    const licenses = await db.select().from(offline_licenses).where(eq(offline_licenses.status, 'active'));
    const licenseByClient = new Map(licenses.map((l: any) => [l.client_id, l.license_key]));
    return {
      data: clients.map((c: any) => ({
        id: c.id,
        device_id_hash: c.device_id_hash,
        tenant_name: c.store_name,
        contact_phone: c.phone,
        plan: c.status === 'active_pro' ? 'pro' : 'lite',
        status: c.status,
        license_key: licenseByClient.get(c.id) ?? null,
        created_at: c.created_at,
      })),
      total: count,
      page: parseInt(page),
      limit: parseInt(limit),
    };
  });

  // Get client detail
  app.get('/clients/:id', { preHandler: adminGuard }, async (request: any, reply) => {
    const db = (app as any).db;
    const [client] = await db.select().from(offline_clients).where(eq(offline_clients.id, request.params.id)).limit(1);
    if (!client) return reply.code(404).send({ error: 'Client not found', code: 'NOT_FOUND' });
    return client;
  });

  // Extend trial
  app.post('/clients/:id/extend-trial', { preHandler: adminGuard }, async (request: any) => {
    const { days } = z.object({ days: z.number().int().min(1).max(90) }).parse(request.body);
    const db = (app as any).db;
    const [client] = await db.select().from(offline_clients).where(eq(offline_clients.id, request.params.id)).limit(1);
    const current = client.trial_ends_at ?? new Date();
    const new_ends_at = new Date(Math.max(current.getTime(), Date.now()) + days * 86400000);
    await db.update(offline_clients).set({ trial_ends_at: new_ends_at, updated_at: new Date() }).where(eq(offline_clients.id, request.params.id));
    return { ok: true, trial_ends_at: new_ends_at };
  });

  // Edit data toko
  app.patch('/clients/:id', { preHandler: adminGuard }, async (request: any, reply) => {
    const body = z.object({
      store_name: z.string().min(1).optional(),
      phone: z.string().min(1).optional(),
    }).parse(request.body);
    const db = (app as any).db;
    const [before] = await db.select().from(offline_clients).where(eq(offline_clients.id, request.params.id)).limit(1);
    if (!before) return reply.code(404).send({ error: 'Client not found', code: 'NOT_FOUND' });

    const [updated] = await db.update(offline_clients).set({ ...body, updated_at: new Date() }).where(eq(offline_clients.id, request.params.id)).returning();
    await logAdminAction(db, { adminId: (request.user as any).sub, action: 'offline_client.updated', targetType: 'offline_client', targetId: request.params.id, targetName: before.store_name, before, after: body, ipAddress: request.ip });
    return updated;
  });

  // Bulk soft-delete — dipakai action bar "N terpilih" di admin-app.
  app.post('/clients/bulk-delete', { preHandler: adminGuard }, async (request: any) => {
    const { ids } = z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(request.body);
    const db = (app as any).db;
    const rows = await db.update(offline_clients).set({ deleted_at: new Date() })
      .where(and(inArray(offline_clients.id, ids), isNull(offline_clients.deleted_at))).returning({ id: offline_clients.id, store_name: offline_clients.store_name });

    await logAdminAction(db, { adminId: (request.user as any).sub, action: 'offline_client.bulk_deleted', targetType: 'offline_client', targetName: rows.map((r: any) => r.store_name).join(', '), after: { ids: rows.map((r: any) => r.id) }, ipAddress: request.ip });
    return { ok: true, count: rows.length };
  });

  // Bulk hard-delete — super_admin only. Client dengan riwayat lisensi dilewati (bukan bikin
  // seluruh batch gagal), sama proteksinya dengan hard-delete satuan di bawah.
  app.post('/clients/bulk-delete/hard', { preHandler: superAdminGuard }, async (request: any) => {
    const { ids } = z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(request.body);
    const db = (app as any).db;

    const withLicenses = await db.selectDistinct({ id: offline_licenses.client_id }).from(offline_licenses).where(inArray(offline_licenses.client_id, ids));
    const blockedIds = new Set(withLicenses.map((r: any) => r.id));
    const deletableIds = ids.filter((id: string) => !blockedIds.has(id));

    const rows = deletableIds.length
      ? await db.delete(offline_clients).where(inArray(offline_clients.id, deletableIds)).returning({ id: offline_clients.id, store_name: offline_clients.store_name })
      : [];

    await logAdminAction(db, { adminId: (request.user as any).sub, action: 'offline_client.bulk_hard_deleted', targetType: 'offline_client', targetName: rows.map((r: any) => r.store_name).join(', '), after: { ids: rows.map((r: any) => r.id) }, ipAddress: request.ip });
    return { ok: true, count: rows.length, skipped: blockedIds.size };
  });

  // Hapus sementara — hilang dari daftar default, masih ada di DB, bisa dipulihkan.
  app.delete('/clients/:id', { preHandler: adminGuard }, async (request: any, reply) => {
    const db = (app as any).db;
    const [deleted] = await db.update(offline_clients).set({ deleted_at: new Date() })
      .where(and(eq(offline_clients.id, request.params.id), isNull(offline_clients.deleted_at))).returning();
    if (!deleted) return reply.code(404).send({ error: 'Client not found', code: 'NOT_FOUND' });

    await logAdminAction(db, { adminId: (request.user as any).sub, action: 'offline_client.deleted', targetType: 'offline_client', targetId: request.params.id, targetName: deleted.store_name, ipAddress: request.ip });
    return { ok: true };
  });

  app.post('/clients/:id/restore', { preHandler: adminGuard }, async (request: any, reply) => {
    const db = (app as any).db;
    const [restored] = await db.update(offline_clients).set({ deleted_at: null })
      .where(and(eq(offline_clients.id, request.params.id), isNotNull(offline_clients.deleted_at))).returning();
    if (!restored) return reply.code(404).send({ error: 'Client not found or not deleted', code: 'NOT_FOUND' });

    await logAdminAction(db, { adminId: (request.user as any).sub, action: 'offline_client.restored', targetType: 'offline_client', targetId: request.params.id, targetName: restored.store_name, ipAddress: request.ip });
    return { ok: true };
  });

  // Hapus permanen — diblok kalau masih ada lisensi terkait (offline_licenses.client_id
  // tidak cascade), admin harus tangani lisensi dulu supaya tidak nabrak FK constraint.
  app.delete('/clients/:id/hard', { preHandler: superAdminGuard }, async (request: any, reply) => {
    const db = (app as any).db;
    const [client] = await db.select().from(offline_clients).where(eq(offline_clients.id, request.params.id)).limit(1);
    if (!client) return reply.code(404).send({ error: 'Client not found', code: 'NOT_FOUND' });

    const relatedLicenses = await db.select({ id: offline_licenses.id }).from(offline_licenses).where(eq(offline_licenses.client_id, request.params.id)).limit(1);
    if (relatedLicenses.length) {
      return reply.code(409).send({ error: 'Client masih punya riwayat lisensi, tidak bisa dihapus permanen', code: 'HAS_LICENSES' });
    }

    await db.delete(offline_clients).where(eq(offline_clients.id, request.params.id));
    await logAdminAction(db, { adminId: (request.user as any).sub, action: 'offline_client.hard_deleted', targetType: 'offline_client', targetId: client.id, targetName: client.store_name, ipAddress: request.ip });
    return { ok: true };
  });

  // Generate license — THE critical endpoint
  app.post('/licenses/generate', { preHandler: adminGuard }, async (request: any) => {
    const body = z.object({
      client_id: z.string().uuid(),
      plan: z.enum(['lite', 'pro']),
      notes: z.string().optional(),
    }).parse(request.body);

    const db = (app as any).db;
    const [client] = await db.select().from(offline_clients).where(eq(offline_clients.id, body.client_id)).limit(1);
    if (!client) throw Object.assign(new Error('Client not found'), { statusCode: 404, code: 'NOT_FOUND' });

    const license_key = await generateLicenseKey(client.device_id_hash, body.plan);
    const adminId = (request.user as any).sub;

    const [existing] = await db.select().from(offline_licenses).where(eq(offline_licenses.license_key, license_key)).limit(1);
    if (existing) return { license_key, already_existed: true };

    await db.insert(offline_licenses).values({
      client_id: body.client_id,
      license_key,
      plan: body.plan,
      generated_by: adminId,
      notes: body.notes,
    });

    await db.update(offline_clients)
      .set({ status: body.plan === 'lite' ? 'active_lite' : 'active_pro', updated_at: new Date() })
      .where(eq(offline_clients.id, body.client_id));

    await logAdminAction(db, {
      adminId,
      action: 'license.generated',
      targetType: 'offline_client',
      targetId: body.client_id,
      targetName: client.store_name,
      after: { plan: body.plan, license_key },
      ipAddress: request.ip,
      userAgent: request.headers['user-agent'],
    });

    return { license_key, plan: body.plan, client_name: client.store_name };
  });

  // List licenses
  app.get('/licenses', { preHandler: adminGuard }, async () => {
    const db = (app as any).db;
    return db.select().from(offline_licenses).orderBy(desc(offline_licenses.created_at));
  });

  // Revoke license
  app.post('/licenses/:id/revoke', { preHandler: superAdminGuard }, async (request: any) => {
    const db = (app as any).db;
    await db.update(offline_licenses)
      .set({ status: 'revoked', revoked_at: new Date(), revoked_by: (request.user as any).sub })
      .where(eq(offline_licenses.id, request.params.id));

    await logAdminAction(db, {
      adminId: (request.user as any).sub,
      action: 'license.revoked',
      targetType: 'offline_license',
      targetId: request.params.id,
      ipAddress: request.ip,
    });

    return { ok: true };
  });
}
