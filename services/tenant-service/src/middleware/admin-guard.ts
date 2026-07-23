import type { FastifyRequest, FastifyReply } from 'fastify';

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

// Untuk route yang dipakai tenant-app (pemilik toko), bukan admin-app.
export async function tenantGuard(request: FastifyRequest, reply: FastifyReply) {
  await request.jwtVerify();
  const user = request.user as { tenant_id: string | null };
  if (!user.tenant_id) {
    return reply.code(403).send({ error: 'Akun ini tidak terikat ke tenant', code: 'NOT_A_TENANT_USER' });
  }
}
