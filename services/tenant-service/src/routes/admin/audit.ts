import type { FastifyInstance } from 'fastify';
import { desc, eq, sql } from 'drizzle-orm';
import { admin_audit_logs, users } from '@ipos-cloud/drizzle-schema';
import { adminGuard } from '../../middleware/admin-guard.js';
import { parsePagination } from '../../lib/pagination.js';

export async function auditAdminRoutes(app: FastifyInstance) {
  app.get('/', { preHandler: adminGuard }, async (request: any) => {
    const db = (app as any).db;
    const { page, limit, offset } = parsePagination(request.query as Record<string, string>, 50);

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
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(admin_audit_logs),
    ]);
    return { data, total: count, page, limit };
  });
}
