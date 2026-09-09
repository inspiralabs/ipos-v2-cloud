import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { users, password_reset_tokens } from '@ipos-cloud/drizzle-schema';

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Fire-and-forget — sama seperti notifyTenantInvitation di tenant-service/src/routes/admin/tenants.ts.
async function sendResetEmail(vars: { name: string; email: string; reset_url: string }) {
  const url = process.env.NOTIFICATION_SERVICE_URL;
  if (!url || !process.env.INTERNAL_API_KEY) return;
  try {
    await fetch(`${url}/api/v1/notify/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-api-key': process.env.INTERNAL_API_KEY },
      body: JSON.stringify({ template_key: 'password.reset', to: vars.email, vars }),
    });
  } catch {
    // diamkan — kegagalan kirim email tidak boleh bocorkan status ke pemanggil (lihat catatan "don't leak existence" di bawah)
  }
}

export async function forgotPasswordRoute(app: FastifyInstance) {
  app.post('/forgot-password', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (request) => {
    const { email } = z.object({ email: z.string().email() }).parse(request.body);
    const db = (app as any).db;

    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    // Selalu balas sukses walau email tidak ditemukan/nonaktif — jangan bocorkan keberadaan akun.
    if (user && user.is_active) {
      const token = crypto.randomBytes(32).toString('base64url');
      const expires_at = new Date(Date.now() + 60 * 60 * 1000); // 1 jam
      await db.insert(password_reset_tokens).values({ user_id: user.id, token_hash: hashToken(token), expires_at });

      const appUrl = process.env.TENANT_APP_URL || 'http://localhost:3012';
      await sendResetEmail({ name: user.name, email: user.email, reset_url: `${appUrl}/reset-password?token=${token}` });
    }

    return { ok: true };
  });
}
