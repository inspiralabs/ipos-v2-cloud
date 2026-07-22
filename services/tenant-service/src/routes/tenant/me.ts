import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { tenants, users, tenant_feature_overrides } from '@ipos-cloud/drizzle-schema';
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
      feature_overrides,
      user,
    };
  });

  // Update profil toko — dipakai Setup Wizard step 1 & Pengaturan.
  app.patch('/me', { preHandler: tenantGuard }, async (request: any) => {
    const body = z.object({
      name: z.string().min(2).optional(),
      logo_url: z.string().url().nullable().optional(),
      timezone: z.string().optional(),
      setup_completed: z.boolean().optional(),
      theme_color: z.string().max(10).optional(),
      address: z.string().max(500).nullable().optional(),
      phone: z.string().max(20).nullable().optional(),
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
}
