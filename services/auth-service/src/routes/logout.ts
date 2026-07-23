import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { sessions } from '@ipos-cloud/drizzle-schema';

export async function logoutRoute(app: FastifyInstance) {
  app.post('/logout', async (request, reply) => {
    const refresh_token = request.cookies.refresh_token;
    if (refresh_token) {
      const db = (app as any).db;
      await db.delete(sessions).where(eq(sessions.refresh_token, refresh_token));
    }
    reply.clearCookie('refresh_token', { path: '/' });
    return { ok: true };
  });
}
