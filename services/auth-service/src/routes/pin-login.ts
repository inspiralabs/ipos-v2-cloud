import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { eq, and, isNotNull } from 'drizzle-orm';
import { users, sessions } from '@ipos-cloud/drizzle-schema';
import { MAX_PIN_ATTEMPTS, isPinLocked, registerFailedPin, clearPinAttempts } from '../pin-attempts.js';
import { resolveTenantAccess, buildJwtPayload, TENANT_BLOCKED_MESSAGE, ACCESS_TOKEN_TTL_SECONDS } from '../token.js';
import { REFRESH_COOKIE_OPTIONS } from '../env.js';

// PIN login cepat — ganti kasir/staf tanpa logout penuh (§21). Dipanggil dari tenant-app yang
// sudah tahu tenant_id dari sesi sebelumnya (subdomain/localStorage), bukan login awal.
export async function pinLoginRoutes(app: FastifyInstance) {
  // Daftar nama staff yang punya PIN aktif, buat picker "pilih nama" — tanpa password/email.
  // WAJIB token: sebelumnya endpoint ini publik dan tenant_id diambil dari query string,
  // sehingga siapa pun yang punya tenant_id (bocor dari endpoint QR publik) bisa memanen
  // seluruh daftar staf + user_id-nya. tenant_id sekarang HANYA dari klaim token.
  app.get('/pin-login/staff', {
    preHandler: async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch {
        return reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      }
    },
  }, async (request, reply) => {
    const { tenant_id } = request.user as { tenant_id: string | null };
    if (!tenant_id) {
      return reply.code(403).send({ error: 'Akun ini tidak terikat ke tenant', code: 'NOT_A_TENANT_USER' });
    }
    const db = (app as any).db;
    const rows = await db.select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .where(and(eq(users.tenant_id, tenant_id), isNotNull(users.pin_hash), eq(users.is_active, true)));
    // Whitelist eksplisit di sini (bukan cuma mengandalkan proyeksi kolom di select()
    // di atas) — belt-and-suspenders supaya pin_hash/email tidak pernah lolos ke respons
    // meski select() di atas suatu saat berubah jadi select semua kolom.
    return { data: rows.map((r: { id: string; name: string; role: string }) => ({ id: r.id, name: r.name, role: r.role })) };
  });

  app.post('/pin-login', {
    // Lapis kedua di atas lockout per-user: membatasi laju dari satu sumber jaringan.
    config: { rateLimit: { max: 20, timeWindow: '5 minutes' } },
  }, async (request: any, reply) => {
    const body = z.object({
      tenant_id: z.string().uuid(),
      user_id: z.string().uuid(),
      pin: z.string().regex(/^\d{4}$/),
    }).parse(request.body);
    const db = (app as any).db;
    const redis = (app as any).redis;

    // Dicek SEBELUM bcrypt.compare: akun terkunci tidak boleh bisa dites sama sekali,
    // walau PIN-nya kebetulan benar.
    if (await isPinLocked(redis, body.user_id)) {
      return reply.code(429).send({
        error: `PIN terkunci setelah ${MAX_PIN_ATTEMPTS} percobaan gagal. Coba lagi 15 menit lagi atau minta owner reset PIN.`,
        code: 'PIN_LOCKED',
      });
    }

    const [user] = await db.select().from(users)
      .where(and(eq(users.id, body.user_id), eq(users.tenant_id, body.tenant_id), eq(users.is_active, true)))
      .limit(1);

    if (!user?.pin_hash || !(await bcrypt.compare(body.pin, user.pin_hash))) {
      await registerFailedPin(redis, body.user_id);
      return reply.code(401).send({ error: 'PIN salah', code: 'INVALID_PIN' });
    }

    await clearPinAttempts(redis, body.user_id);

    const access = await resolveTenantAccess(db, body.tenant_id);
    if (!access.ok) {
      return reply.code(403).send({
        error: TENANT_BLOCKED_MESSAGE[access.reason],
        code: `TENANT_${access.reason}`,
      });
    }

    const token = app.jwt.sign(buildJwtPayload(
      { id: user.id, role: user.role, tenant_id: body.tenant_id, outlet_id: user.outlet_id ?? null },
      access.plan
    ));

    // Ganti kasir HARUS mengganti sesi, bukan cuma menerbitkan access token baru.
    // Sebelumnya cookie refresh_token kasir lama dibiarkan utuh, jadi setelah 15 menit
    // /refresh mengembalikan identitas kasir SEBELUMNYA dan transaksi tercatat atas
    // nama orang yang salah.
    const previous = request.cookies.refresh_token;
    if (previous) {
      await db.delete(sessions).where(eq(sessions.refresh_token, previous));
    }

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

    return { access_token: token, expires_in: ACCESS_TOKEN_TTL_SECONDS, user: { id: user.id, name: user.name, role: user.role } };
  });
}
