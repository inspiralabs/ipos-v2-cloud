import type { FastifyRequest, FastifyReply } from 'fastify';
import type { TenantPlan } from './types.js';

export const PLAN_FEATURES: Record<TenantPlan, string[]> = {
  umkm_lite: ['basic_pos', 'basic_menu', 'basic_report', 'single_outlet'],
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

export function requireFeature(featureKey: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as unknown as { user?: { plan?: TenantPlan | null } }).user;
    if (!user?.plan || !PLAN_FEATURES[user.plan]?.includes(featureKey)) {
      return reply.code(403).send({ error: 'Feature not available on your plan', code: 'FEATURE_GATED' });
    }
  };
}
