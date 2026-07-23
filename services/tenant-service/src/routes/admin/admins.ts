import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { eq, and, isNull, inArray, desc } from 'drizzle-orm';
import { users } from '@ipos-cloud/drizzle-schema';
import { logAdminAction } from '@ipos-cloud/shared';
import { superAdminGuard } from '../../middleware/admin-guard.js';

// `users` dipakai bareng tenant (owner/cashier/dll) — admin platform selalu tenant_id NULL
// dan role super_admin|admin_staff. Jangan hilangkan filter ini, atau tenant staff ikut kepencet.
const ADMIN_ROLES = ['super_admin', 'admin_staff'] as const;
const isAdminRow = and(isNull(users.tenant_id), inArray(users.role, [...ADMIN_ROLES]));

export async function adminsAdminRoutes(app: FastifyInstance) {
  app.addHook('preHandler', superAdminGuard); // kelola sesama admin = super_admin only

  app.get('/', async () => {
    const db = (app as any).db;
    const rows = await db.select({
      id: users.id, name: users.name, email: users.email, role: users.role,
      is_active: users.is_active, created_at: users.created_at,
    }).from(users).where(isAdminRow).orderBy(desc(users.created_at));
    return { data: rows };
  });

  app.post('/', async (request: any, reply) => {
    const body = z.object({
      name: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(8),
      role: z.enum(ADMIN_ROLES),
    }).parse(request.body);

    const db = (app as any).db;
    const password_hash = await bcrypt.hash(body.password, 10);
    const [admin] = await db.insert(users).values({
      name: body.name, email: body.email, password_hash, role: body.role,
    }).returning({ id: users.id, name: users.name, email: users.email, role: users.role, is_active: users.is_active, created_at: users.created_at });

    await logAdminAction(db, {
      adminId: (request.user as any).sub, action: 'admin.created', targetType: 'user',
      targetId: admin.id, targetName: admin.name, after: { email: body.email, role: body.role }, ipAddress: request.ip,
    });
    return reply.code(201).send(admin);
  });

  app.patch('/:id/deactivate', async (request: any) => {
    const db = (app as any).db;
    await setActive(db, request, false);
    return { ok: true };
  });

  app.patch('/:id/activate', async (request: any) => {
    const db = (app as any).db;
    await setActive(db, request, true);
    return { ok: true };
  });

  async function setActive(db: any, request: any, is_active: boolean) {
    await db.update(users).set({ is_active, updated_at: new Date() }).where(and(eq(users.id, request.params.id), isAdminRow));
    await logAdminAction(db, {
      adminId: (request.user as any).sub, action: is_active ? 'admin.activated' : 'admin.deactivated',
      targetType: 'user', targetId: request.params.id, ipAddress: request.ip,
    });
  }

  app.patch('/:id/reset-password', async (request: any, reply) => {
    const { password } = z.object({ password: z.string().min(8) }).parse(request.body);
    const db = (app as any).db;
    const password_hash = await bcrypt.hash(password, 10);
    const [updated] = await db.update(users).set({ password_hash, updated_at: new Date() })
      .where(and(eq(users.id, request.params.id), isAdminRow)).returning({ id: users.id });
    if (!updated) return reply.code(404).send({ error: 'Admin not found', code: 'NOT_FOUND' });

    await logAdminAction(db, {
      adminId: (request.user as any).sub, action: 'admin.password_reset', targetType: 'user',
      targetId: request.params.id, ipAddress: request.ip,
    });
    return { ok: true };
  });

  // Hapus permanen — tidak boleh hapus akun sendiri (cegah terkunci sendiri).
  app.delete('/:id', async (request: any, reply) => {
    const adminId = (request.user as any).sub;
    if (request.params.id === adminId) {
      return reply.code(400).send({ error: 'Tidak bisa menghapus akun sendiri', code: 'CANNOT_DELETE_SELF' });
    }
    const db = (app as any).db;
    const [deleted] = await db.delete(users).where(and(eq(users.id, request.params.id), isAdminRow)).returning({ id: users.id, name: users.name });
    if (!deleted) return reply.code(404).send({ error: 'Admin not found', code: 'NOT_FOUND' });

    await logAdminAction(db, {
      adminId, action: 'admin.deleted', targetType: 'user', targetId: deleted.id, targetName: deleted.name, ipAddress: request.ip,
    });
    return { ok: true };
  });
}
