import type { FastifyRequest, FastifyReply } from 'fastify';
import { resolveTenantAccess, TENANT_BLOCKED_MESSAGE, type Db, type UserRole } from '@ipos-cloud/shared';

export async function adminGuard(request: FastifyRequest, reply: FastifyReply) {
  await request.jwtVerify();
  const user = request.user as { role: string };
  if (!['super_admin', 'admin_staff'].includes(user.role)) {
    return reply.code(403).send({ error: 'Admin access required', code: 'ADMIN_ONLY' });
  }
}

export async function superAdminGuard(request: FastifyRequest, reply: FastifyReply) {
  await request.jwtVerify();
  const user = request.user as { role: string };
  if (user.role !== 'super_admin') {
    return reply.code(403).send({ error: 'Super admin only', code: 'SUPER_ADMIN_ONLY' });
  }
}

// Untuk route yang dipakai tenant-app (pemilik toko/staf), bukan admin-app.
export async function tenantGuard(request: FastifyRequest, reply: FastifyReply) {
  await request.jwtVerify();
  const user = request.user as { tenant_id: string | null };
  if (!user.tenant_id) {
    return reply.code(403).send({ error: 'Akun ini tidak terikat ke tenant', code: 'NOT_A_TENANT_USER' });
  }

  // request.server.db AMAN dibaca langsung di sini — beda dari bug requireFeature Modul 1:
  // tenant-service men-decorate 'db' SEKALI di paling atas index.ts, sebelum route apa pun
  // diregistrasi, bukan di 4 service lain yang dulu lupa melakukannya sama sekali.
  //
  // Cek status di SETIAP request (bukan cuma saat login di auth-service): access token
  // berumur 15 menit, jadi tenant yang disuspend PASCA-login tetap bisa memanggil semua
  // route tenant-service sampai token itu kedaluwarsa kalau tidak dicek di sini juga.
  const db = (request.server as any).db as Db;
  const access = await resolveTenantAccess(db, user.tenant_id);
  if (!access.ok) {
    return reply.code(403).send({ error: TENANT_BLOCKED_MESSAGE[access.reason], code: `TENANT_${access.reason}` });
  }
}

/**
 * Sama seperti tenantGuard, plus pembatasan role. Akar temuan A: tenantGuard lama tidak
 * mengenal role sama sekali, jadi kasir bisa memanggil route apa pun yang cuma dijaga
 * tenantGuard — termasuk membuat akun manager dan menonaktifkan owner
 * (routes/tenant/users.ts) atau mengubah profil toko (routes/tenant/me.ts).
 */
export function requireTenantRole(...roles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await tenantGuard(request, reply);
    if (reply.sent) return;
    const user = request.user as { role: UserRole };
    if (!roles.includes(user.role)) {
      return reply.code(403).send({ error: 'Tidak punya izin untuk aksi ini', code: 'FORBIDDEN_ROLE' });
    }
  };
}
