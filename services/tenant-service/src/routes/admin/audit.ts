import type { FastifyInstance } from 'fastify';
import { desc, eq, sql } from 'drizzle-orm';
import { admin_audit_logs, users } from '@ipos-cloud/drizzle-schema';
import { adminGuard } from '../../middleware/admin-guard.js';

export async function auditAdminRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: adminGuard }, async (request: any) => {
    const db = (app as any).db;
    const { limit = '50', page = '1' } = request.query as Record<string, string>;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [data, [{ count }]] = await Promise.all([
      db.select({
        id: admin_audit_logs.id,
        admin_name: users.name,
        action: admin_audit_logs.action,
        target_type: admin_audit_logs.target_type,
        target_name: admin_audit_logs.target_name,
        created_at: admin_audit_logs.created_at,
      }).from(admin_audit_logs)
        .leftJoin(users, eq(users.id, admin_audit_logs.admin_id))
        .orderBy(desc(admin_audit_logs.created_at))
        .limit(parseInt(limit))
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(admin_audit_logs),
    ]);
    return { data, total: count, page: parseInt(page), limit: parseInt(limit) };
  });
}
