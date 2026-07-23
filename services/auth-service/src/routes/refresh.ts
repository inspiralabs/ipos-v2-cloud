import type { FastifyInstance } from 'fastify';
import { eq, and, gt } from 'drizzle-orm';
import { users, sessions, tenants } from '@ipos-cloud/drizzle-schema';

export async function refreshRoute(app: FastifyInstance) {
  app.post('/refresh', async (request, reply) => {
    const refresh_token = request.cookies.refresh_token;
    if (!refresh_token) {
      return reply.code(401).send({ error: 'No refresh token', code: 'MISSING_TOKEN' });
    }

    const db = (app as any).db;
    const [session] = await db.select().from(sessions)
      .where(and(eq(sessions.refresh_token, refresh_token), gt(sessions.expires_at, new Date())))
      .limit(1);

    if (!session) {
      return reply.code(401).send({ error: 'Session expired', code: 'SESSION_EXPIRED' });
    }

    const [user] = await db.select().from(users).where(eq(users.id, session.user_id)).limit(1);
    if (!user || !user.is_active) {
      return reply.code(401).send({ error: 'User inactive', code: 'USER_INACTIVE' });
    }

    let plan: string | null = null;
    if (user.tenant_id) {
      const [tenant] = await db.select({ plan_code: tenants.plan_code }).from(tenants).where(eq(tenants.id, user.tenant_id)).limit(1);
      plan = tenant?.plan_code ?? null;
    }

    const access_token = app.jwt.sign({
      sub: user.id,
      tenant_id: user.tenant_id ?? null,
      role: user.role,
      plan,
      outlet_id: user.outlet_id ?? null,
    });

    return { access_token, expires_in: 900, user: { id: user.id, name: user.name, role: user.role } };
  });
}
