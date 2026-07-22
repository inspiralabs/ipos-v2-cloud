import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { tenant_feature_overrides } from '@ipos-cloud/drizzle-schema';
import type { TenantPlan } from './types.js';
import type { Db } from './db.js';

export const PLAN_FEATURES: Record<TenantPlan, string[]> = {
  umkm_lite: ['basic_pos', 'basic_menu', 'basic_report', 'single_outlet', 'shift_management'],
  umkm_pro: [
    'basic_pos', 'basic_menu', 'basic_report', 'single_outlet',
    'stock_management', 'advanced_report', 'void_transaction', 'shift_management', 'split_bill',
  ],
  resto_basic: [
    'basic_pos', 'basic_menu', 'basic_report', 'single_outlet',
    'table_management', 'kitchen_display', 'qr_self_order',
  ],
  resto_starter: [
    'basic_pos', 'basic_menu', 'basic_report', 'single_outlet',
    'stock_management', 'advanced_report', 'void_transaction', 'shift_management', 'split_bill',
    'table_management', 'kitchen_display', 'qr_self_order', 'bom_recipe', 'absensi',
  ],
  resto_pro: [
    'basic_pos', 'basic_menu', 'basic_report', 'multi_outlet',
    'stock_management', 'advanced_report', 'void_transaction', 'shift_management', 'split_bill',
    'table_management', 'kitchen_display', 'qr_self_order', 'bom_recipe', 'absensi',
    'loyalty_program', 'food_cost_report', 'pnl_report', 'inter_branch_transfer',
  ],
  resto_business: [
    'basic_pos', 'basic_menu', 'basic_report', 'multi_outlet',
    'stock_management', 'advanced_report', 'void_transaction', 'shift_management', 'split_bill',
    'table_management', 'kitchen_display', 'qr_self_order', 'bom_recipe', 'absensi',
    'loyalty_program', 'food_cost_report', 'pnl_report', 'inter_branch_transfer',
    'api_access', 'custom_integration',
  ],
};

export async function hasFeature(
  db: Db,
  tenantId: string,
  plan: TenantPlan | undefined | null,
  featureKey: string
): Promise<boolean> {
  if (!plan) return false;

  const overrides = await db
    .select({ feature_key: tenant_feature_overrides.feature_key, is_enabled: tenant_feature_overrides.is_enabled })
    .from(tenant_feature_overrides)
    .where(and(eq(tenant_feature_overrides.tenant_id, tenantId), eq(tenant_feature_overrides.feature_key, featureKey)));

  const override = overrides.find((row) => row.feature_key === featureKey);
  if (override) return override.is_enabled;

  return PLAN_FEATURES[plan]?.includes(featureKey) ?? false;
}

export function requireFeature(featureKey: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as unknown as { user?: { tenant_id?: string; plan?: TenantPlan | null } }).user;
    const db = (request.server as unknown as { db: Db }).db;
    if (!user?.tenant_id || !(await hasFeature(db, user.tenant_id, user.plan, featureKey))) {
      return reply.code(403).send({ error: 'Feature not available on your plan', code: 'FEATURE_GATED' });
    }
  };
}
