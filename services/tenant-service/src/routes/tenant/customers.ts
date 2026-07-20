import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, and, ilike, or, desc, sql } from 'drizzle-orm';
import { customers, pos_orders, pos_order_items } from '@ipos-cloud/drizzle-schema';
import { tenantGuard } from '../../middleware/admin-guard.js';

// Buku alamat pelanggan toko — dipakai kasir saat transaksi (opsional, nama masuk struk).
export async function tenantCustomersRoutes(app: FastifyInstance) {
  app.addHook('preHandler', tenantGuard);

  // ?search= dipakai kotak cari pelanggan di modal bayar.
  app.get('/', async (request: any) => {
    const { search } = request.query as { search?: string };
    const { tenant_id } = request.user as { tenant_id: string };
    const db = (app as any).db;

    const where = search
      ? and(eq(customers.tenant_id, tenant_id), or(ilike(customers.name, `%${search}%`), ilike(customers.phone, `%${search}%`)))
      : eq(customers.tenant_id, tenant_id);

    return { data: await db.select().from(customers).where(where).orderBy(desc(customers.created_at)).limit(50) };
  });

  const customerBody = z.object({
    name: z.string().min(1).max(255),
    phone: z.string().max(20).nullable().optional(),
  });

  app.post('/', async (request: any, reply) => {
    const body = customerBody.parse(request.body);
    const { tenant_id } = request.user as { tenant_id: string };
    const db = (app as any).db;
    const [row] = await db.insert(customers).values({ ...body, tenant_id }).returning();
    return reply.code(201).send(row);
  });

  app.put('/:id', async (request: any, reply) => {
    const body = customerBody.parse(request.body);
    const { tenant_id } = request.user as { tenant_id: string };
    const db = (app as any).db;
    const [row] = await db.update(customers).set(body)
      .where(and(eq(customers.id, request.params.id), eq(customers.tenant_id, tenant_id)))
      .returning();
    if (!row) return reply.code(404).send({ error: 'Pelanggan tidak ditemukan', code: 'NOT_FOUND' });
    return row;
  });

  app.delete('/:id', async (request: any, reply) => {
    const { tenant_id } = request.user as { tenant_id: string };
    const db = (app as any).db;
    await db.delete(customers)
      .where(and(eq(customers.id, request.params.id), eq(customers.tenant_id, tenant_id)));
    return reply.code(204).send();
  });

  // Detail pelanggan: agregat belanja, menu favorit, riwayat transaksi — untuk modal Detail Pelanggan.
  app.get('/:id/detail', async (request: any, reply) => {
    const { tenant_id } = request.user as { tenant_id: string };
    const db = (app as any).db;
    const { id } = request.params as { id: string };

    const [customer] = await db.select().from(customers)
      .where(and(eq(customers.id, id), eq(customers.tenant_id, tenant_id)));
    if (!customer) return reply.code(404).send({ error: 'Pelanggan tidak ditemukan', code: 'NOT_FOUND' });

    const [agg] = await db
      .select({
        total_spend: sql<number>`coalesce(sum(${pos_orders.total}), 0)`,
        visit_count: sql<number>`count(*)`,
      })
      .from(pos_orders)
      .where(and(eq(pos_orders.customer_id, id), eq(pos_orders.tenant_id, tenant_id), eq(pos_orders.status, 'paid')));

    const favoriteMenu = await db
      .select({
        product_name: pos_order_items.product_name,
        order_count: sql<number>`count(*)`,
      })
      .from(pos_order_items)
      .innerJoin(pos_orders, eq(pos_order_items.order_id, pos_orders.id))
      .where(and(eq(pos_orders.customer_id, id), eq(pos_orders.tenant_id, tenant_id), eq(pos_orders.status, 'paid')))
      .groupBy(pos_order_items.product_name)
      .orderBy(sql`count(*) desc`)
      .limit(5);

    const recentOrdersRaw = await db
      .select()
      .from(pos_orders)
      .where(and(eq(pos_orders.customer_id, id), eq(pos_orders.tenant_id, tenant_id), eq(pos_orders.status, 'paid')))
      .orderBy(desc(pos_orders.created_at))
      .limit(10);

    const recentOrders = await Promise.all(
      recentOrdersRaw.map(async (order: typeof pos_orders.$inferSelect) => {
        const items = await db.select({ product_name: pos_order_items.product_name, qty: pos_order_items.qty })
          .from(pos_order_items).where(eq(pos_order_items.order_id, order.id));
        return {
          id: order.id,
          created_at: order.created_at.toISOString(),
          total: order.total,
          payment_method: order.payment_method,
          item_summary: items.map((i: { product_name: string; qty: number }) => `${i.product_name} x${i.qty}`).join(', '),
        };
      })
    );

    return {
      customer: { id: customer.id, name: customer.name, phone: customer.phone },
      total_spend: Number(agg?.total_spend ?? 0),
      visit_count: Number(agg?.visit_count ?? 0),
      favorite_menu: favoriteMenu.map((f: { product_name: string; order_count: number }) => ({
        product_name: f.product_name,
        order_count: Number(f.order_count),
      })),
      recent_orders: recentOrders,
    };
  });
}
