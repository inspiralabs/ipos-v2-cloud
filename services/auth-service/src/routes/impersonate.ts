import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { users, tenants } from '@ipos-cloud/drizzle-schema';

export async function impersonateRoute(app: FastifyInstance) {
  app.post('/tenants/:id/impersonate', {
    preHandler: async (request, reply) => {
      await request.jwtVerify();
      const user = request.user as { role: string };
      if (user.role !== 'super_admin') {
        return reply.code(403).send({ error: 'Super admin only', code: 'SUPER_ADMIN_ONLY' });
      }
    },
  }, async (request: any, reply) => {
    const db = (app as any).db;
    const [tenant] = await db.select().from(tenants).where(eq(tenants.id, request.params.id)).limit(1);
    if (!tenant) return reply.code(404).send({ error: 'Tenant not found', code: 'NOT_FOUND' });

    if (!tenant.owner_id) return reply.code(400).send({ error: 'Tenant has no owner', code: 'NO_OWNER' });
    const [owner] = await db.select().from(users).where(eq(users.id, tenant.owner_id)).limit(1);
    if (!owner) return reply.code(404).send({ error: 'Owner not found', code: 'NOT_FOUND' });

    const token = app.jwt.sign({
      sub: owner.id,
      tenant_id: tenant.id,
      role: owner.role,
      plan: tenant.plan_code,
      outlet_id: null,
      impersonated_by: (request.user as any).sub,
    }, { expiresIn: '1h' });

    return { access_token: token, expires_in: 3600, tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug } };
  });
}
