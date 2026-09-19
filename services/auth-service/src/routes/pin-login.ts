import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { eq, and, isNotNull } from 'drizzle-orm';
import { users, tenants } from '@ipos-cloud/drizzle-schema';

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

  app.post('/pin-login', async (request: any, reply) => {
    const body = z.object({
      tenant_id: z.string().uuid(),
      user_id: z.string().uuid(),
      pin: z.string().regex(/^\d{4}$/),
    }).parse(request.body);
    const db = (app as any).db;

    const [user] = await db.select().from(users)
      .where(and(eq(users.id, body.user_id), eq(users.tenant_id, body.tenant_id), eq(users.is_active, true)))
      .limit(1);
    if (!user?.pin_hash || !(await bcrypt.compare(body.pin, user.pin_hash))) {
      return reply.code(401).send({ error: 'PIN salah', code: 'INVALID_PIN' });
    }

    const [tenant] = await db.select({ plan_code: tenants.plan_code }).from(tenants).where(eq(tenants.id, body.tenant_id)).limit(1);
    const token = app.jwt.sign({
      sub: user.id, tenant_id: body.tenant_id, role: user.role,
      plan: tenant?.plan_code ?? null, outlet_id: user.outlet_id ?? null,
    });

    return { access_token: token, expires_in: 900, user: { id: user.id, name: user.name, role: user.role } };
  });
}
