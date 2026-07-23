import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { attendance_logs, users } from '@ipos-cloud/drizzle-schema';
import { tenantGuard } from '../../middleware/admin-guard.js';
import { requireFeature } from '@ipos-cloud/shared';

// Absensi harian — kiosk PIN clock-in/out (§20). Tidak ada jadwal shift formal, cuma catat jam masuk/keluar.
export async function tenantAttendanceRoutes(app: FastifyInstance) {
  app.addHook('preHandler', tenantGuard);

  app.get('/', { preHandler: requireFeature('absensi') }, async (request: any) => {
    const { date } = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(request.query);
    const { tenant_id } = request.user as { tenant_id: string };
    const db = (app as any).db;
    const rows = await db.select({
      id: attendance_logs.id, user_id: attendance_logs.user_id, user_name: users.name,
      clock_in_at: attendance_logs.clock_in_at, clock_out_at: attendance_logs.clock_out_at, status: attendance_logs.status,
    })
      .from(attendance_logs)
      .innerJoin(users, eq(attendance_logs.user_id, users.id))
      .where(and(eq(attendance_logs.tenant_id, tenant_id), eq(attendance_logs.date, date)));
    return { data: rows };
  });

  // Kiosk clock-in/out: tablet login sekali pakai akun kasir (JWT dari tenantGuard), lalu staff
  // pilih namanya sendiri dari daftar — user_id ini yang diabsen, bukan pemilik JWT kiosk.
  const clockBody = z.object({ user_id: z.string().uuid() });

  app.post('/clock-in', { preHandler: requireFeature('absensi') }, async (request: any, reply) => {
    const { user_id } = clockBody.parse(request.body);
    const { tenant_id } = request.user as { tenant_id: string };
    const db = (app as any).db;
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date();

    const [existing] = await db.select().from(attendance_logs)
      .where(and(eq(attendance_logs.user_id, user_id), eq(attendance_logs.tenant_id, tenant_id), eq(attendance_logs.date, today)));
    if (existing) return reply.code(409).send({ error: 'Sudah absen masuk hari ini', code: 'ALREADY_CLOCKED_IN' });

    const status = now.getHours() >= 9 ? 'telat' : 'hadir'; // ponytail: jam masuk tetap 09:00, ubah kalau nanti butuh per-tenant
    const [row] = await db.insert(attendance_logs).values({
      tenant_id, user_id, date: today, clock_in_at: now, status,
    }).returning();
    return reply.code(201).send(row);
  });

  app.post('/clock-out', { preHandler: requireFeature('absensi') }, async (request: any, reply) => {
    const { user_id } = clockBody.parse(request.body);
    const { tenant_id } = request.user as { tenant_id: string };
    const db = (app as any).db;
    const today = new Date().toISOString().slice(0, 10);

    const [row] = await db.update(attendance_logs)
      .set({ clock_out_at: new Date() })
      .where(and(eq(attendance_logs.user_id, user_id), eq(attendance_logs.tenant_id, tenant_id), eq(attendance_logs.date, today)))
      .returning();
    if (!row) return reply.code(404).send({ error: 'Belum absen masuk hari ini', code: 'NOT_CLOCKED_IN' });
    return row;
  });
}
