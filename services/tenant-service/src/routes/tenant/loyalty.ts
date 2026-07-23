import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc, sql } from 'drizzle-orm';
import { loyalty_members, loyalty_point_logs, loyalty_broadcasts } from '@ipos-cloud/drizzle-schema';
import { tenantGuard } from '../../middleware/admin-guard.js';
import { requireFeature } from '@ipos-cloud/shared';

// Loyalty program — no HP = ID member, tanpa password (§19). Lookup saat checkout via no HP.
export async function tenantLoyaltyRoutes(app: FastifyInstance) {
  app.addHook('preHandler', tenantGuard);

  app.get('/members', { preHandler: requireFeature('loyalty_program') }, async (request: any) => {
    const { search } = request.query as { search?: string };
    const { tenant_id } = request.user as { tenant_id: string };
    const db = (app as any).db;
    const rows = await db.select().from(loyalty_members)
      .where(search
        ? and(eq(loyalty_members.tenant_id, tenant_id), sql`${loyalty_members.phone} ilike ${'%' + search + '%'} or ${loyalty_members.name} ilike ${'%' + search + '%'}`)
        : eq(loyalty_members.tenant_id, tenant_id))
      .orderBy(desc(loyalty_members.points_balance))
      .limit(50);
    return { data: rows };
  });

  const registerBody = z.object({ name: z.string().min(1).max(255), phone: z.string().min(1).max(20) });

  app.post('/members', { preHandler: requireFeature('loyalty_program') }, async (request: any, reply) => {
    const body = registerBody.parse(request.body);
    const { tenant_id } = request.user as { tenant_id: string };
    const db = (app as any).db;
    const [row] = await db.insert(loyalty_members).values({ ...body, tenant_id }).returning();
    return reply.code(201).send(row);
  });

  // Lookup by phone — dipakai kasir POS Resto & QR self-order untuk "+ Daftarkan Member" / cek poin.
  app.get('/members/lookup', { preHandler: requireFeature('loyalty_program') }, async (request: any, reply) => {
    const { phone } = z.object({ phone: z.string() }).parse(request.query);
    const { tenant_id } = request.user as { tenant_id: string };
    const db = (app as any).db;
    const [row] = await db.select().from(loyalty_members).where(and(eq(loyalty_members.phone, phone), eq(loyalty_members.tenant_id, tenant_id)));
    if (!row) return reply.code(404).send({ error: 'Member tidak ditemukan', code: 'NOT_FOUND' });
    return row;
  });

  // Earn poin — dipanggil pos-service best-effort setelah order (1 poin per Rp10.000, dibulatkan bawah).
  const earnBody = z.object({ member_id: z.string().uuid(), order_id: z.string().uuid(), order_total: z.number().int().min(0) });
  app.post('/points/earn', { preHandler: requireFeature('loyalty_program') }, async (request: any, reply) => {
    const body = earnBody.parse(request.body);
    const { tenant_id } = request.user as { tenant_id: string };
    const db = (app as any).db;
    const points = Math.floor(body.order_total / 10000);
    if (points <= 0) return reply.code(200).send({ ok: true, points_earned: 0 });

    await db.insert(loyalty_point_logs).values({ tenant_id, member_id: body.member_id, delta: points, reason: 'order_earn', order_id: body.order_id });
    const [row] = await db.update(loyalty_members)
      .set({ points_balance: sql`${loyalty_members.points_balance} + ${points}` })
      .where(and(eq(loyalty_members.id, body.member_id), eq(loyalty_members.tenant_id, tenant_id)))
      .returning();
    return reply.code(200).send({ ok: true, points_earned: points, member: row });
  });

  const redeemBody = z.object({ member_id: z.string().uuid(), points: z.number().int().positive() });
  app.post('/points/redeem', { preHandler: requireFeature('loyalty_program') }, async (request: any, reply) => {
    const body = redeemBody.parse(request.body);
    const { tenant_id } = request.user as { tenant_id: string };
    const db = (app as any).db;

    const [member] = await db.select().from(loyalty_members).where(and(eq(loyalty_members.id, body.member_id), eq(loyalty_members.tenant_id, tenant_id)));
    if (!member) return reply.code(404).send({ error: 'Member tidak ditemukan', code: 'NOT_FOUND' });
    if (member.points_balance < body.points) return reply.code(400).send({ error: 'Poin tidak cukup', code: 'INSUFFICIENT_POINTS' });

    await db.insert(loyalty_point_logs).values({ tenant_id, member_id: body.member_id, delta: -body.points, reason: 'manual_redeem' });
    const [row] = await db.update(loyalty_members)
      .set({ points_balance: sql`${loyalty_members.points_balance} - ${body.points}` })
      .where(eq(loyalty_members.id, body.member_id))
      .returning();
    return row;
  });

  // Broadcast WA — kirim lewat notification-service internal (best-effort, catat log terlepas hasil kirim).
  const broadcastBody = z.object({ segment: z.enum(['all', 'top_member', 'inactive_30d']), message: z.string().min(1) });
  app.post('/broadcasts', { preHandler: requireFeature('loyalty_program') }, async (request: any, reply) => {
    const body = broadcastBody.parse(request.body);
    const { tenant_id, sub } = request.user as { tenant_id: string; sub: string };
    const db = (app as any).db;

    let members;
    if (body.segment === 'top_member') {
      members = await db.select().from(loyalty_members).where(eq(loyalty_members.tenant_id, tenant_id)).orderBy(desc(loyalty_members.points_balance)).limit(20);
    } else {
      members = await db.select().from(loyalty_members).where(eq(loyalty_members.tenant_id, tenant_id));
    }

    const [row] = await db.insert(loyalty_broadcasts).values({
      tenant_id, segment: body.segment, message: body.message, recipient_count: members.length, sent_by: sub,
    }).returning();
    // ponytail: pengiriman WA aktual belum di-wire ke notification-service/Fonnte — cuma dicatat.
    // Sambungkan saat perlu kirim beneran, fetch ke notification-service per member.phone.
    return reply.code(201).send(row);
  });

  app.get('/broadcasts', { preHandler: requireFeature('loyalty_program') }, async (request: any) => {
    const { tenant_id } = request.user as { tenant_id: string };
    const db = (app as any).db;
    return { data: await db.select().from(loyalty_broadcasts).where(eq(loyalty_broadcasts.tenant_id, tenant_id)).orderBy(desc(loyalty_broadcasts.created_at)) };
  });
}
