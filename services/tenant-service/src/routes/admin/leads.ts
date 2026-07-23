import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, desc, and, isNull, isNotNull, inArray, sql } from 'drizzle-orm';
import { leads, lead_notes } from '@ipos-cloud/drizzle-schema';
import { logAdminAction } from '@ipos-cloud/shared';
import { adminGuard, superAdminGuard } from '../../middleware/admin-guard.js';

export async function leadsAdminRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: adminGuard }, async (request: any) => {
    const db = (app as any).db;
    const { status, search, includeDeleted, page = '1', limit = '20' } = request.query as Record<string, string>;
    const conditions = [includeDeleted ? undefined : isNull(leads.deleted_at)];
    if (status) conditions.push(eq(leads.status, status));
    const where = and(...conditions.filter(Boolean));
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [data, [{ count }]] = await Promise.all([
      db.select().from(leads).where(where).orderBy(desc(leads.created_at)).limit(parseInt(limit)).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(leads).where(where),
    ]);
    return { data, total: count, page: parseInt(page), limit: parseInt(limit) };
  });

  app.patch('/:id', { preHandler: adminGuard }, async (request: any, reply) => {
    const body = z.object({
      name: z.string().min(1).optional(),
      business_name: z.string().min(1).optional(),
      phone: z.string().min(1).optional(),
      email: z.union([z.literal(''), z.string().email()]).optional(),
      business_type: z.string().optional(),
      business_type_other: z.string().optional(),
      product_interest: z.string().optional(),
      status: z.enum(['baru', 'dihubungi', 'deal', 'cancel', 'trial']).optional(),
    }).parse(request.body);
    const db = (app as any).db;
    const [before] = await db.select().from(leads).where(eq(leads.id, request.params.id)).limit(1);
    if (!before) return reply.code(404).send({ error: 'Lead not found', code: 'NOT_FOUND' });

    const [updated] = await db.update(leads).set({ ...body, updated_at: new Date() }).where(eq(leads.id, request.params.id)).returning();
    await logAdminAction(db, { adminId: (request.user as any).sub, action: 'lead.updated', targetType: 'lead', targetId: request.params.id, targetName: before.name, before, after: body, ipAddress: request.ip });
    return updated;
  });

  // Bulk soft-delete — dipakai action bar "N terpilih" di admin-app. Sama semantiknya
  // dengan delete satuan, cuma banyak id sekaligus dalam satu round-trip.
  app.post('/bulk-delete', { preHandler: adminGuard }, async (request: any) => {
    const { ids } = z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(request.body);
    const db = (app as any).db;
    const rows = await db.update(leads).set({ deleted_at: new Date() })
      .where(and(inArray(leads.id, ids), isNull(leads.deleted_at))).returning({ id: leads.id, name: leads.name });

    await logAdminAction(db, { adminId: (request.user as any).sub, action: 'lead.bulk_deleted', targetType: 'lead', targetName: rows.map((r: any) => r.name).join(', '), after: { ids: rows.map((r: any) => r.id) }, ipAddress: request.ip });
    return { ok: true, count: rows.length };
  });

  // Bulk hard-delete — super_admin only, dipakai action bar saat user pilih "Hapus Permanen".
  app.post('/bulk-delete/hard', { preHandler: superAdminGuard }, async (request: any) => {
    const { ids } = z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(request.body);
    const db = (app as any).db;
    const rows = await db.delete(leads).where(inArray(leads.id, ids)).returning({ id: leads.id, name: leads.name });

    await logAdminAction(db, { adminId: (request.user as any).sub, action: 'lead.bulk_hard_deleted', targetType: 'lead', targetName: rows.map((r: any) => r.name).join(', '), after: { ids: rows.map((r: any) => r.id) }, ipAddress: request.ip });
    return { ok: true, count: rows.length };
  });

  // Hapus sementara — hilang dari daftar default, masih ada di DB, bisa dipulihkan.
  app.delete('/:id', { preHandler: adminGuard }, async (request: any, reply) => {
    const db = (app as any).db;
    const [deleted] = await db.update(leads).set({ deleted_at: new Date() })
      .where(and(eq(leads.id, request.params.id), isNull(leads.deleted_at))).returning();
    if (!deleted) return reply.code(404).send({ error: 'Lead not found', code: 'NOT_FOUND' });

    await logAdminAction(db, { adminId: (request.user as any).sub, action: 'lead.deleted', targetType: 'lead', targetId: request.params.id, targetName: deleted.name, ipAddress: request.ip });
    return { ok: true };
  });

  app.post('/:id/restore', { preHandler: adminGuard }, async (request: any, reply) => {
    const db = (app as any).db;
    const [restored] = await db.update(leads).set({ deleted_at: null })
      .where(and(eq(leads.id, request.params.id), isNotNull(leads.deleted_at))).returning();
    if (!restored) return reply.code(404).send({ error: 'Lead not found or not deleted', code: 'NOT_FOUND' });

    await logAdminAction(db, { adminId: (request.user as any).sub, action: 'lead.restored', targetType: 'lead', targetId: request.params.id, targetName: restored.name, ipAddress: request.ip });
    return { ok: true };
  });

  // Hapus permanen — notes ikut terhapus (FK cascade). super_admin only, blast radius kecil (single row).
  app.delete('/:id/hard', { preHandler: superAdminGuard }, async (request: any, reply) => {
    const db = (app as any).db;
    const [deleted] = await db.delete(leads).where(eq(leads.id, request.params.id)).returning({ id: leads.id, name: leads.name });
    if (!deleted) return reply.code(404).send({ error: 'Lead not found', code: 'NOT_FOUND' });

    await logAdminAction(db, { adminId: (request.user as any).sub, action: 'lead.hard_deleted', targetType: 'lead', targetId: deleted.id, targetName: deleted.name, ipAddress: request.ip });
    return { ok: true };
  });

  // History catatan — append-only, jadi admin bisa lihat kapan tiap catatan ditulis (termasuk
  // catatan awal dari klien sendiri saat pilih "Belum tahu — bantu pilihkan" di form demo).
  app.get('/:id/notes', { preHandler: adminGuard }, async (request: any) => {
    const db = (app as any).db;
    const data = await db.select().from(lead_notes).where(eq(lead_notes.lead_id, request.params.id)).orderBy(desc(lead_notes.created_at));
    return { data };
  });

  app.post('/:id/notes', { preHandler: adminGuard }, async (request: any) => {
    const { note } = z.object({ note: z.string().min(1) }).parse(request.body);
    const db = (app as any).db;
    const [created] = await db.insert(lead_notes).values({
      lead_id: request.params.id,
      note,
      author: 'admin',
      created_by: (request.user as any).sub,
    }).returning();
    await logAdminAction(db, { adminId: (request.user as any).sub, action: 'lead.note_added', targetType: 'lead', targetId: request.params.id, after: { note }, ipAddress: request.ip });
    return created;
  });
}
