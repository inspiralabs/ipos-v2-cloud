import type { TenantPlan } from './types.js';

// File ini SENGAJA tidak mengimpor apa pun selain tipe: dipakai bareng oleh
// backend (feature-gate.ts) dan bundle browser tenant-app. Jangan tambahkan
// import ke db.ts/redis.ts/r2.ts di sini.

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

/** Evaluasi fitur murni di memori — overrides sudah di tangan pemanggil. */
export function planHasFeature(
  plan: TenantPlan | null | undefined,
  featureKey: string,
  overrides?: Record<string, boolean>
): boolean {
  if (!plan) return false;
  if (overrides && featureKey in overrides) return overrides[featureKey];
  return PLAN_FEATURES[plan]?.includes(featureKey) ?? false;
}
