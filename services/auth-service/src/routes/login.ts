import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { users, sessions } from '@ipos-cloud/drizzle-schema';
import { resolveTenantAccess, buildJwtPayload, TENANT_BLOCKED_MESSAGE, ACCESS_TOKEN_TTL_SECONDS } from '../token.js';
import { REFRESH_COOKIE_OPTIONS } from '../env.js';

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  admin_only: z.boolean().optional(), // admin-app sets this to true
});

export async function loginRoute(app: FastifyInstance) {
  app.post('/login', {
    // Lebih ketat dari limit global 100/menit: /login adalah target brute force password.
    // Sengaja lebih longgar dari forgot-password (5/15m) supaya kasir yang salah ketik
    // beberapa kali tidak langsung terkunci.
    config: { rateLimit: { max: 10, timeWindow: '5 minutes' } },
  }, async (request, reply) => {
    const body = loginBody.parse(request.body);
    const db = (app as any).db;

    const [user] = await db.select().from(users).where(eq(users.email, body.email)).limit(1);
    if (!user || !user.is_active) {
      return reply.code(401).send({ error: 'Email atau password salah', code: 'INVALID_CREDENTIALS' });
    }

    const valid = await bcrypt.compare(body.password, user.password_hash);
    if (!valid) {
      return reply.code(401).send({ error: 'Email atau password salah', code: 'INVALID_CREDENTIALS' });
    }

    if (body.admin_only && !['super_admin', 'admin_staff'].includes(user.role)) {
      return reply.code(403).send({ error: 'Hanya admin yang bisa login di sini', code: 'ADMIN_ONLY' });
    }

    const access = await resolveTenantAccess(db, user.tenant_id ?? null);
    if (!access.ok) {
      return reply.code(403).send({
        error: TENANT_BLOCKED_MESSAGE[access.reason],
        code: `TENANT_${access.reason}`,
      });
    }

    const payload = buildJwtPayload(user, access.plan);

    const access_token = app.jwt.sign(payload);

    // Store refresh token
    const refresh_token = crypto.randomUUID();
    const expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.insert(sessions).values({
      user_id: user.id,
      refresh_token,
      expires_at,
      ip_address: request.ip,
      user_agent: request.headers['user-agent'],
    });

    reply.setCookie('refresh_token', refresh_token, { ...REFRESH_COOKIE_OPTIONS, expires: expires_at });

    return { access_token, expires_in: ACCESS_TOKEN_TTL_SECONDS, user: { id: user.id, name: user.name, role: user.role } };
  });
}
