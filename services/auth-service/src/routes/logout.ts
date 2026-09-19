import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { sessions } from '@ipos-cloud/drizzle-schema';
import { REFRESH_COOKIE_OPTIONS } from '../env.js';

export async function logoutRoute(app: FastifyInstance) {
  app.post('/logout', async (request, reply) => {
    const refresh_token = request.cookies.refresh_token;
    if (refresh_token) {
      const db = (app as any).db;
      await db.delete(sessions).where(eq(sessions.refresh_token, refresh_token));
    }
    // Atribut HARUS sama dengan saat di-set, kalau tidak sebagian browser tidak menghapusnya.
    reply.clearCookie('refresh_token', REFRESH_COOKIE_OPTIONS);
    return { ok: true };
  });
}
