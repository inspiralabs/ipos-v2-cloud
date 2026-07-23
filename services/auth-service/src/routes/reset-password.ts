import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { eq, and, gt, isNull } from 'drizzle-orm';
import { users, password_reset_tokens } from '@ipos-cloud/drizzle-schema';

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function resetPasswordRoute(app: FastifyInstance) {
  app.post('/reset-password', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const { token, password } = z.object({ token: z.string().min(1), password: z.string().min(6) }).parse(request.body);
    const db = (app as any).db;

    const [row] = await db.select().from(password_reset_tokens).where(
      and(
        eq(password_reset_tokens.token_hash, hashToken(token)),
        gt(password_reset_tokens.expires_at, new Date()),
        isNull(password_reset_tokens.used_at)
      )
    ).limit(1);

    if (!row) {
      return reply.code(400).send({ error: 'Link reset tidak valid atau sudah kedaluwarsa', code: 'INVALID_RESET_TOKEN' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    await db.update(users).set({ password_hash, updated_at: new Date() }).where(eq(users.id, row.user_id));
    await db.update(password_reset_tokens).set({ used_at: new Date() }).where(eq(password_reset_tokens.id, row.id));

    return { ok: true };
  });
}
