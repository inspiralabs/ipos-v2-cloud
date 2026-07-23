import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, gt, isNull } from 'drizzle-orm';
import { users, otp_codes } from '@ipos-cloud/drizzle-schema';

export async function otpRoutes(app: FastifyInstance) {
  app.post('/otp/send', async (request) => {
    const { email } = z.object({ email: z.string().email() }).parse(request.body);
    const db = (app as any).db;
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) return { ok: true }; // don't leak existence

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expires_at = new Date(Date.now() + 5 * 60 * 1000);
    await db.insert(otp_codes).values({ user_id: user.id, code, expires_at });

    // ponytail: skip sending actual email here — notification-service handles that
    app.log.info({ code }, 'OTP generated (dev: log only, prod: send via notification-service)');
    return { ok: true };
  });

  app.post('/otp/verify', async (request, reply) => {
    const { email, code } = z.object({ email: z.string().email(), code: z.string().length(6) }).parse(request.body);
    const db = (app as any).db;
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) return reply.code(400).send({ error: 'Invalid OTP', code: 'INVALID_OTP' });

    const [otp] = await db.select().from(otp_codes).where(
      and(eq(otp_codes.user_id, user.id), eq(otp_codes.code, code), gt(otp_codes.expires_at, new Date()), isNull(otp_codes.used_at))
    ).limit(1);

    if (!otp) return reply.code(400).send({ error: 'Invalid or expired OTP', code: 'INVALID_OTP' });

    await db.update(otp_codes).set({ used_at: new Date() }).where(eq(otp_codes.id, otp.id));
    return { ok: true, user_id: user.id };
  });
}
