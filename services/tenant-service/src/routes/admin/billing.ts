import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { billing_records } from '@ipos-cloud/drizzle-schema';
import { adminGuard } from '../../middleware/admin-guard.js';

export async function billingAdminRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: adminGuard }, async () => {
    const db = (app as any).db;
    return db.select().from(billing_records).orderBy(desc(billing_records.paid_at));
  });

  app.post('/', { preHandler: adminGuard }, async (request: any, reply) => {
    const body = z.object({
      tenant_id: z.string().uuid().optional(),
      offline_client_id: z.string().uuid().optional(),
      type: z.enum(['subscription', 'buyout', 'license_offline', 'addon']),
      plan_code: z.string().optional(),
      amount: z.number().int().positive(),
      transfer_method: z.enum(['bca', 'mandiri', 'bri', 'bni', 'qris']).optional(),
      reference_number: z.string().optional(),
      period_start: z.string().optional(),
      period_end: z.string().optional(),
      notes: z.string().optional(),
      paid_at: z.string(),
    }).parse(request.body);

    const db = (app as any).db;
    const [record] = await db.insert(billing_records).values({
      ...body,
      recorded_by: (request.user as any).sub,
    }).returning();
    return reply.code(201).send(record);
  });

  app.patch('/:id', { preHandler: adminGuard }, async (request: any) => {
    const body = z.object({ notes: z.string().optional(), amount: z.number().optional() }).parse(request.body);
    const db = (app as any).db;
    const [updated] = await db.update(billing_records).set(body).where(eq(billing_records.id, request.params.id)).returning();
    return updated;
  });
}
