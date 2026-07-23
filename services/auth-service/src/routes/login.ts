import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { users, sessions, tenants } from '@ipos-cloud/drizzle-schema';

const loginBody = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  admin_only: z.boolean().optional(), // admin-app sets this to true
});

export async function loginRoute(app: FastifyInstance) {
  app.post('/login', async (request, reply) => {
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

    let plan: string | null = null;
    if (user.tenant_id) {
      const [tenant] = await db.select({ plan_code: tenants.plan_code }).from(tenants).where(eq(tenants.id, user.tenant_id)).limit(1);
      plan = tenant?.plan_code ?? null;
    }

    const payload = {
      sub: user.id,
      tenant_id: user.tenant_id ?? null,
      role: user.role,
      plan,
      outlet_id: user.outlet_id ?? null,
    };

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

    reply.setCookie('refresh_token', refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      expires: expires_at,
    });

    return { access_token, expires_in: 900, user: { id: user.id, name: user.name, role: user.role } };
  });
}
