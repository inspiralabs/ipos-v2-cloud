import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { tenant_feature_overrides, tenants } from '@ipos-cloud/drizzle-schema';
import { logAdminAction } from '@ipos-cloud/shared';
import { adminGuard } from '../../middleware/admin-guard.js';

export async function featureOverridesAdminRoutes(app: FastifyInstance) {
  app.get('/:tenant_id/feature-overrides', { preHandler: adminGuard }, async (request: any) => {
    const db = (app as any).db;
    return db
      .select({ feature_key: tenant_feature_overrides.feature_key, is_enabled: tenant_feature_overrides.is_enabled })
      .from(tenant_feature_overrides)
      .where(eq(tenant_feature_overrides.tenant_id, request.params.tenant_id));
  });

  app.put('/:tenant_id/feature-overrides/:feature_key', { preHandler: adminGuard }, async (request: any, reply) => {
    const { is_enabled } = z.object({ is_enabled: z.boolean() }).parse(request.body);
    const { tenant_id, feature_key } = request.params as { tenant_id: string; feature_key: string };
    const db = (app as any).db;

    const [tenant] = await db.select({ id: tenants.id, name: tenants.name }).from(tenants).where(eq(tenants.id, tenant_id)).limit(1);
    if (!tenant) return reply.code(404).send({ error: 'Tenant not found', code: 'NOT_FOUND' });

    await db.insert(tenant_feature_overrides)
      .values({ tenant_id, feature_key, is_enabled, set_by: (request.user as any).sub })
      .onConflictDoUpdate({
        target: [tenant_feature_overrides.tenant_id, tenant_feature_overrides.feature_key],
        set: { is_enabled },
      });

    await logAdminAction(db, {
      adminId: (request.user as any).sub, action: 'tenant.feature_override_set',
      targetType: 'tenant', targetId: tenant_id, targetName: tenant.name,
      after: { feature_key, is_enabled }, ipAddress: request.ip,
    });

    return { ok: true };
  });
}
