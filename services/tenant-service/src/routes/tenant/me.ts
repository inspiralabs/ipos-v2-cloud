import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { tenants, users, tenant_feature_overrides } from '@ipos-cloud/drizzle-schema';
import { uploadToR2, extensionForMimeType } from '@ipos-cloud/shared';
import { tenantGuard } from '../../middleware/admin-guard.js';

// Dipakai tenant-app: dashboard toko login dengan JWT tenant_id (bukan admin).
export async function tenantMeRoutes(app: FastifyInstance) {
  app.get('/me', { preHandler: tenantGuard }, async (request: any, reply) => {
    const { sub, tenant_id } = request.user as { sub: string; tenant_id: string };
    const db = (app as any).db;

    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenant_id)).limit(1);
    if (!tenant) return reply.code(404).send({ error: 'Tenant not found', code: 'NOT_FOUND' });

    const [user] = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role })
      .from(users).where(eq(users.id, sub)).limit(1);

    const overrideRows = await db
      .select({ feature_key: tenant_feature_overrides.feature_key, is_enabled: tenant_feature_overrides.is_enabled })
      .from(tenant_feature_overrides)
      .where(eq(tenant_feature_overrides.tenant_id, tenant_id));
    const feature_overrides = Object.fromEntries(overrideRows.map((r: { feature_key: string; is_enabled: boolean }) => [r.feature_key, r.is_enabled]));

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      plan: tenant.plan_code,
      status: tenant.status,
      trial_ends_at: tenant.trial_ends_at,
      logo_url: tenant.logo_url,
      timezone: tenant.timezone,
      setup_completed_at: tenant.setup_completed_at,
      theme_color: tenant.theme_color,
      address: tenant.address,
      phone: tenant.phone,
      qris_url: tenant.qris_url,
      receipt_footer: tenant.receipt_footer,
      feature_overrides,
      user,
    };
  });

  // Update profil toko — dipakai Setup Wizard step 1 & Pengaturan.
  app.patch('/me', { preHandler: tenantGuard }, async (request: any) => {
    const body = z.object({
      name: z.string().min(2).max(30, 'Nama toko maksimal 30 karakter').optional(),
      logo_url: z.string().url().nullable().optional(),
      timezone: z.string().optional(),
      setup_completed: z.boolean().optional(),
      theme_color: z.string().max(10).optional(),
      address: z.string().max(50, 'Alamat maksimal 50 karakter').nullable().optional(),
      phone: z.string().regex(/^08\d{2}-\d{4}-\d{4}$/, 'Format No HP: 08xx-xxxx-xxxx').nullable().optional(),
      receipt_footer: z.string().max(200, 'Catatan struk maksimal 200 karakter').nullable().optional(),
    }).parse(request.body);
    const { tenant_id } = request.user as { tenant_id: string };
    const db = (app as any).db;

    const { setup_completed, ...fields } = body;
    const [updated] = await db.update(tenants)
      .set({
        ...fields,
        ...(setup_completed ? { setup_completed_at: new Date() } : {}),
        updated_at: new Date(),
      })
      .where(eq(tenants.id, tenant_id))
      .returning();
    return updated;
  });

  // Upload logo ke R2, simpan URL-nya ke tenants.logo_url — key overwrite, ganti logo = upload ulang.
  app.post('/me/logo', { preHandler: tenantGuard }, async (request: any, reply) => {
    const { tenant_id } = request.user as { tenant_id: string };
    const db = (app as any).db;
    const r2 = (app as any).r2;

    const file = await request.file();
    if (!file) return reply.code(400).send({ error: 'File tidak ditemukan', code: 'NO_FILE' });
    const ext = extensionForMimeType(file.mimetype);
    if (!ext) return reply.code(400).send({ error: 'Format harus JPG, PNG, atau WEBP', code: 'INVALID_TYPE' });

    const buffer = await file.toBuffer();
    const logo_url = await uploadToR2(r2, `tenants/${tenant_id}/logo.${ext}`, buffer, file.mimetype);
    const [updated] = await db.update(tenants).set({ logo_url, updated_at: new Date() }).where(eq(tenants.id, tenant_id)).returning();
    return updated;
  });

  // Upload gambar QRIS statis ke R2, simpan URL-nya ke tenants.qris_url — sama pola dengan /me/logo.
  app.post('/me/qris', { preHandler: tenantGuard }, async (request: any, reply) => {
    const { tenant_id } = request.user as { tenant_id: string };
    const db = (app as any).db;
    const r2 = (app as any).r2;

    const file = await request.file();
    if (!file) return reply.code(400).send({ error: 'File tidak ditemukan', code: 'NO_FILE' });
    const ext = extensionForMimeType(file.mimetype);
    if (!ext) return reply.code(400).send({ error: 'Format harus JPG, PNG, atau WEBP', code: 'INVALID_TYPE' });

    const buffer = await file.toBuffer();
    const qris_url = await uploadToR2(r2, `tenants/${tenant_id}/qris.${ext}`, buffer, file.mimetype);
    const [updated] = await db.update(tenants).set({ qris_url, updated_at: new Date() }).where(eq(tenants.id, tenant_id)).returning();
    return updated;
  });

  // Kirim email test ke akun yang login — dipakai tombol "Kirim Notifikasi Test" di Pengaturan > Notifikasi.
  app.post('/me/test-notification', { preHandler: tenantGuard }, async (request: any, reply) => {
    const { sub } = request.user as { sub: string };
    const db = (app as any).db;
    const [user] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, sub)).limit(1);
    if (!user) return reply.code(404).send({ error: 'User tidak ditemukan', code: 'NOT_FOUND' });

    const url = process.env.NOTIFICATION_SERVICE_URL;
    if (!url || !process.env.INTERNAL_API_KEY) {
      return reply.code(503).send({ error: 'Layanan notifikasi belum dikonfigurasi', code: 'NOTIFICATION_UNAVAILABLE' });
    }
    const res = await fetch(`${url}/api/v1/notify/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-api-key': process.env.INTERNAL_API_KEY },
      body: JSON.stringify({ template_key: 'notif.test', to: user.email, vars: { name: user.name } }),
    });
    if (!res.ok) return reply.code(502).send({ error: 'Gagal mengirim notifikasi test', code: 'SEND_FAILED' });
    return { ok: true, sent_to: user.email };
  });
}
