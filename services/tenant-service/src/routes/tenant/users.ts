import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { eq, and, ne, sql } from 'drizzle-orm';
import { users } from '@ipos-cloud/drizzle-schema';
import { tenantGuard, requireTenantRole } from '../../middleware/admin-guard.js';

const CASHIER_ROLES = ['cashier', 'outlet_manager', 'kitchen_staff', 'waiter', 'manager'] as const;

// Kelola kasir milik toko sendiri — dipakai Setup Wizard step 3 & Pengaturan > Kasir.
// Beda dari admin/admins.ts: itu kelola staf InspiraLabs, ini kelola staf tenant.
export async function tenantUsersRoutes(app: FastifyInstance) {
  // GET / dipakai kiosk absensi (attendance.ts — "tablet login sekali pakai akun kasir,
  // lalu staff pilih namanya sendiri dari daftar") jadi HARUS bisa diakses semua role
  // tenant, bukan cuma owner. Yang membatasi ke owner cuma 5 route mutasi di bawah
  // (masing-masing punya requireTenantRole('owner') sendiri) — GET tetap terbuka lewat
  // tenantGuard biasa, tapi proyeksi datanya role-aware supaya temuan A (kasir GET →
  // dapat owner_id/email) tetap tertutup.
  app.get('/', { preHandler: tenantGuard }, async (request: any) => {
    const { tenant_id, role } = request.user as { tenant_id: string; role: string };
    const db = (app as any).db;
    const rows = await db.select({
      id: users.id, name: users.name, email: users.email, role: users.role, is_active: users.is_active,
      outlet_id: users.outlet_id, phone: users.phone, has_pin: sql<boolean>`${users.pin_hash} is not null`,
    }).from(users).where(eq(users.tenant_id, tenant_id));

    if (role === 'owner') return { data: rows };

    // Non-owner: proyeksi minimal buat name-picker kiosk. Exclusion baris owner
    // dilakukan di JS (bukan cuma via WHERE) karena fakeDb (test-support.ts) tidak
    // menghormati .where() SQL-level — filter di sini tetap benar di Postgres asli
    // (WHERE tenant_id sudah membatasi ke tenant yang sama) dan jadi testable lewat fake.
    const data = rows
      .filter((r: any) => r.is_active && r.role !== 'owner')
      .map((r: any) => ({ id: r.id, name: r.name, role: r.role }));
    return { data };
  });

  app.post('/', { preHandler: requireTenantRole('owner') }, async (request: any, reply) => {
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
  app.patch('/:id/pin', { preHandler: requireTenantRole('owner') }, async (request: any, reply) => {
    const { pin } = z.object({ pin: z.string().regex(/^\d{4}$/) }).parse(request.body);
    const { tenant_id } = request.user as { tenant_id: string };
    const db = (app as any).db;
    const pin_hash = await bcrypt.hash(pin, 10);
    // ne(role,'owner') — sebelumnya tidak ada di endpoint ini padahal reset-password &
    // delete di file yang sama sudah punya proteksi ini. Endpoint ini sendiri sudah
    // dibatasi ke role owner (preHandler di atas), tapi ini tetap dipertahankan sebagai
    // pertahanan berlapis: owner tidak boleh mengganti PIN akun owner lain/dirinya lewat
    // endpoint kelola-staf ini.
    const [updated] = await db.update(users).set({ pin_hash, updated_at: new Date() })
      .where(and(eq(users.id, request.params.id), eq(users.tenant_id, tenant_id), ne(users.role, 'owner')))
      .returning({ id: users.id });
    if (!updated) return reply.code(404).send({ error: 'Staff tidak ditemukan', code: 'NOT_FOUND' });
    return { ok: true };
  });

  app.patch('/:id/deactivate', { preHandler: requireTenantRole('owner') }, async (request: any, reply) => {
    const { sub, tenant_id } = request.user as { sub: string; tenant_id: string };
    if (request.params.id === sub) {
      return reply.code(400).send({ error: 'Tidak bisa menonaktifkan akun sendiri', code: 'CANNOT_DEACTIVATE_SELF' });
    }
    const db = (app as any).db;
    // Guard sama seperti pin/reset-password/delete: ne(role,'owner') plus 404 kalau
    // target tidak ketemu — sebelumnya endpoint ini tidak punya keduanya, jadi owner bisa
    // menonaktifkan owner lain (atau, lewat self-guard di atas, dirinya sendiri) dan
    // mengunci tenant (auth-service menolak login is_active=false, tanpa jalan pemulihan).
    const [updated] = await db.update(users).set({ is_active: false, updated_at: new Date() })
      .where(and(eq(users.id, request.params.id), eq(users.tenant_id, tenant_id), ne(users.role, 'owner')))
      .returning({ id: users.id });
    if (!updated) return reply.code(404).send({ error: 'Staff tidak ditemukan', code: 'NOT_FOUND' });
    return { ok: true };
  });

  // Owner reset password stafnya sendiri — tidak perlu email/token, owner sudah authenticated.
  app.patch('/:id/reset-password', { preHandler: requireTenantRole('owner') }, async (request: any, reply) => {
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

  app.delete('/:id', { preHandler: requireTenantRole('owner') }, async (request: any, reply) => {
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
