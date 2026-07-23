import type { Db } from './db.js';
import { admin_audit_logs } from '@ipos-cloud/drizzle-schema';

interface AuditPayload {
  adminId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  targetName?: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string;
  userAgent?: string;
}

export async function logAdminAction(db: Db, payload: AuditPayload) {
  await db.insert(admin_audit_logs).values({
    admin_id: payload.adminId,
    action: payload.action,
    target_type: payload.targetType,
    target_id: payload.targetId as `${string}-${string}-${string}-${string}-${string}` | undefined,
    target_name: payload.targetName,
    before_state: payload.before ?? null,
    after_state: payload.after ?? null,
    ip_address: payload.ipAddress,
    user_agent: payload.userAgent,
  });
}
