import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { eq, and, ne, sql } from 'drizzle-orm';
import { users } from '@ipos-cloud/drizzle-schema';
import { tenantGuard } from '../../middleware/admin-guard.js';

const CASHIER_ROLES = ['cashier', 'outlet_manager', 'kitchen_staff', 'waiter', 'manager'] as const;

// Kelola kasir milik toko sendiri — dipakai Setup Wizard step 3 & Pengaturan > Kasir.
// Beda dari admin/admins.ts: itu kelola staf InspiraLabs, ini kelola staf tenant.
export async function tenantUsersRoutes(app: FastifyInstance) {
  app.addHook('preHandler', tenantGuard);

  app.get('/', async (request: any) => {
    const { tenant_id } = request.user as { tenant_id: string };
    const db = (app as any).db;
    const rows = await db.select({
      id: users.id, name: users.name, email: users.email, role: users.role, is_active: users.is_active,
      outlet_id: users.outlet_id, phone: users.phone, has_pin: sql<boolean>`${users.pin_hash} is not null`,
    }).from(users).where(eq(users.tenant_id, tenant_id));
    return { data: rows };
  });

  app.post('/', async (request: any, reply) => {
    const body = z.object({
      name: z.string().min(2),
      email: z.string().email(),
      password: z.string().min(6),
      role: z.enum(CASHIER_ROLES).default('cashier'),
      phone: z.string().max(20).nullable().optional(),
      outlet_id: z.string().uuid().nullable().optional(),
      pin: z.string().regex(/^\d{4}$/).optional(), // 4-digit — login cepat ganti kasir (§21)
    }).parse(request.body);
    const { tenant_id } = request.user as { tenant_id: string };
    const db = (app as any).db;

    const password_hash = await bcrypt.hash(body.password, 10);
    const pin_hash = body.pin ? await bcrypt.hash(body.pin, 10) : null;
    const [row] = await db.insert(users).values({
      tenant_id, name: body.name, email: body.email, password_hash, role: body.role,
      phone: body.phone, outlet_id: body.outlet_id, pin_hash,
    }).returning({ id: users.id, name: users.name, email: users.email, role: users.role, is_active: users.is_active });
    return reply.code(201).send(row);
  });

  // Set/ganti PIN staff yang sudah ada — dipanggil terpisah dari create supaya owner bisa
  // menambahkan PIN belakangan tanpa reset password.
  app.patch('/:id/pin', async (request: any, reply) => {
    const { pin } = z.object({ pin: z.string().regex(/^\d{4}$/) }).parse(request.body);
    const { tenant_id } = request.user as { tenant_id: string };
    const db = (app as any).db;
    const pin_hash = await bcrypt.hash(pin, 10);
    const [updated] = await db.update(users).set({ pin_hash, updated_at: new Date() })
      .where(and(eq(users.id, request.params.id), eq(users.tenant_id, tenant_id)))
      .returning({ id: users.id });
    if (!updated) return reply.code(404).send({ error: 'Staff tidak ditemukan', code: 'NOT_FOUND' });
    return { ok: true };
  });

  app.patch('/:id/deactivate', async (request: any) => {
    const { tenant_id } = request.user as { tenant_id: string };
    const db = (app as any).db;
    await db.update(users).set({ is_active: false, updated_at: new Date() })
      .where(and(eq(users.id, request.params.id), eq(users.tenant_id, tenant_id)));
    return { ok: true };
  });

  // Owner reset password stafnya sendiri — tidak perlu email/token, owner sudah authenticated.
  app.patch('/:id/reset-password', async (request: any, reply) => {
    const { password } = z.object({ password: z.string().min(6) }).parse(request.body);
    const { tenant_id } = request.user as { tenant_id: string };
    const db = (app as any).db;

    const password_hash = await bcrypt.hash(password, 10);
    const [updated] = await db.update(users).set({ password_hash, updated_at: new Date() })
      .where(and(eq(users.id, request.params.id), eq(users.tenant_id, tenant_id), ne(users.role, 'owner')))
      .returning({ id: users.id });
    if (!updated) return reply.code(404).send({ error: 'Kasir tidak ditemukan', code: 'NOT_FOUND' });
    return { ok: true };
  });

  app.delete('/:id', async (request: any, reply) => {
    const { sub, tenant_id } = request.user as { sub: string; tenant_id: string };
    if (request.params.id === sub) {
      return reply.code(400).send({ error: 'Tidak bisa menghapus akun sendiri', code: 'CANNOT_DELETE_SELF' });
    }
    const db = (app as any).db;
    const [deleted] = await db.delete(users)
      .where(and(eq(users.id, request.params.id), eq(users.tenant_id, tenant_id), ne(users.role, 'owner')))
      .returning({ id: users.id });
    if (!deleted) return reply.code(404).send({ error: 'User not found', code: 'NOT_FOUND' });
    return { ok: true };
  });
}
