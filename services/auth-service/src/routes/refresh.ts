import type { FastifyInstance } from 'fastify';
import { eq, and, gt } from 'drizzle-orm';
import { users, sessions } from '@ipos-cloud/drizzle-schema';
import { resolveTenantAccess, buildJwtPayload, TENANT_BLOCKED_MESSAGE, ACCESS_TOKEN_TTL_SECONDS } from '../token.js';

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

    const access = await resolveTenantAccess(db, user.tenant_id ?? null);
    if (!access.ok) {
      return reply.code(403).send({
        error: TENANT_BLOCKED_MESSAGE[access.reason],
        code: `TENANT_${access.reason}`,
      });
    }

    const access_token = app.jwt.sign(buildJwtPayload(user, access.plan));

    return { access_token, expires_in: ACCESS_TOKEN_TTL_SECONDS, user: { id: user.id, name: user.name, role: user.role } };
  });
}
