import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { outlets, branch_transfers, branch_transfer_items } from '@ipos-cloud/drizzle-schema';
import { tenantGuard } from '../../middleware/admin-guard.js';
import { requireFeature } from '@ipos-cloud/shared';

// Multi-cabang: CRUD outlet + transfer bahan baku antar-cabang (Resto Pro & Business).
export async function tenantBranchesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', tenantGuard);

  app.get('/', { preHandler: requireFeature('multi_outlet') }, async (request: any) => {
    const { tenant_id } = request.user as { tenant_id: string };
    const db = (app as any).db;
    return db.select().from(outlets).where(eq(outlets.tenant_id, tenant_id));
  });

  const outletBody = z.object({
    name: z.string().min(1).max(255),
    address: z.string().nullable().optional(),
    phone: z.string().max(20).nullable().optional(),
  });

  app.post('/', { preHandler: requireFeature('multi_outlet') }, async (request: any, reply) => {
    const body = outletBody.parse(request.body);
    const { tenant_id } = request.user as { tenant_id: string };
    const db = (app as any).db;
    const [row] = await db.insert(outlets).values({ ...body, tenant_id }).returning();
    return reply.code(201).send(row);
  });

  app.put('/:id', { preHandler: requireFeature('multi_outlet') }, async (request: any, reply) => {
    const body = outletBody.partial().parse(request.body);
    const { tenant_id } = request.user as { tenant_id: string };
    const db = (app as any).db;
    const [row] = await db.update(outlets).set(body)
      .where(and(eq(outlets.id, request.params.id), eq(outlets.tenant_id, tenant_id)))
      .returning();
    if (!row) return reply.code(404).send({ error: 'Cabang tidak ditemukan', code: 'NOT_FOUND' });
    return row;
  });
}

// Transfer bahan baku antar-cabang — request oleh siapa saja, approve/tolak khusus Owner/Admin.
export async function tenantTransfersRoutes(app: FastifyInstance) {
  app.addHook('preHandler', tenantGuard);

  app.get('/', { preHandler: requireFeature('inter_branch_transfer') }, async (request: any) => {
    const { tenant_id } = request.user as { tenant_id: string };
    const db = (app as any).db;
    const transfers = await db.select().from(branch_transfers)
      .where(eq(branch_transfers.tenant_id, tenant_id)).orderBy(desc(branch_transfers.created_at));
    const items = await db.select().from(branch_transfer_items)
      .innerJoin(branch_transfers, eq(branch_transfer_items.transfer_id, branch_transfers.id))
      .where(eq(branch_transfers.tenant_id, tenant_id));
    return transfers.map((t: typeof branch_transfers.$inferSelect) => ({
      ...t,
      items: items.filter((i: any) => i.branch_transfer_items.transfer_id === t.id).map((i: any) => i.branch_transfer_items),
    }));
  });

  const transferBody = z.object({
    from_outlet_id: z.string().uuid(),
    to_outlet_id: z.string().uuid(),
    reason: z.string().nullable().optional(),
    items: z.array(z.object({ ingredient_id: z.string().uuid(), qty: z.number().int().positive(), unit: z.string().max(20) })).min(1),
  });

  app.post('/', { preHandler: requireFeature('inter_branch_transfer') }, async (request: any, reply) => {
    const body = transferBody.parse(request.body);
    const { tenant_id, sub } = request.user as { tenant_id: string; sub: string };
    const db = (app as any).db;
    const [transfer] = await db.insert(branch_transfers).values({
      tenant_id, from_outlet_id: body.from_outlet_id, to_outlet_id: body.to_outlet_id,
      reason: body.reason, requested_by: sub,
    }).returning();
    await db.insert(branch_transfer_items).values(
      body.items.map((i) => ({ transfer_id: transfer.id, ingredient_id: i.ingredient_id, qty: i.qty, unit: i.unit }))
    );
    return reply.code(201).send({ ...transfer, items: body.items });
  });

  // Approve/tolak — role-gated di level app (Owner/Admin), dicek dari klaim JWT `role`.
  app.post('/:id/decide', { preHandler: requireFeature('inter_branch_transfer') }, async (request: any, reply) => {
    const { decision } = z.object({ decision: z.enum(['approved', 'rejected']) }).parse(request.body);
    const { tenant_id, sub, role } = request.user as { tenant_id: string; sub: string; role: string };
    if (!['owner', 'admin_staff', 'super_admin'].includes(role)) {
      return reply.code(403).send({ error: 'Hanya Owner/Admin yang bisa approve transfer', code: 'FORBIDDEN' });
    }
    const db = (app as any).db;
    const [transfer] = await db.update(branch_transfers)
      .set({ status: decision, approved_by: sub, decided_at: new Date() })
      .where(and(eq(branch_transfers.id, request.params.id), eq(branch_transfers.tenant_id, tenant_id)))
      .returning();
    if (!transfer) return reply.code(404).send({ error: 'Transfer tidak ditemukan', code: 'NOT_FOUND' });
    // Catatan: stok ingredients bersifat tenant-level (belum per-outlet), jadi approve transfer
    // di sini murni administratif — tidak mengubah stok fisik. Tambahkan outlet_id ke ingredients
    // kalau nanti butuh stok per-cabang yang benar-benar terpisah.
    return transfer;
  });
}
