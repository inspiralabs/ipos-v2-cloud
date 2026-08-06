export type Category = {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

export type Menu = {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price: number;
  discount_price: number | null; // null = tanpa diskon; kalau ada, price jadi harga coret
  discount_type: 'nominal' | 'percent' | null; // sumber kebenaran untuk form ubah — discount_price dihitung ulang darinya
  discount_value: number | null; // nominal Rp, atau persen 0-100 (tergantung discount_type)
  image_url: string | null;
  is_active: boolean;
  is_sold_out: boolean;
  sort_order: number;
};

export type VariantOption = {
  id: string;
  group_id: string;
  name: string;
  price_delta: number;
  sort_order: number;
};

export type VariantGroup = {
  id: string;
  name: string;
  selection: 'single' | 'multi';
  required: boolean;
  options: VariantOption[];
};

export type MenuVariantGroup = {
  menu_id: string;
  variant_group_id: string;
};

export type Customer = {
  id: string;
  name: string;
  phone: string | null;
};

export type CartLine = {
  /** id unik per baris cart — menu sama dengan variasi beda = baris terpisah */
  line_id: string;
  menu_id: string;
  product_name: string;
  variant_summary: string | null;
  price: number; // per unit, sudah termasuk diskon menu + selisih variasi
  qty: number;
  notes: string | null;
};

export type Shift = {
  id: string;
  status: 'open' | 'closed';
  cashier_name: string;
  opening_cash: number;
  closing_cash: number | null;
  opened_at: string;
  closed_at: string | null;
};

/** Harga jual efektif: pakai diskon kalau ada. */
export function effectivePrice(menu: Menu) {
  return menu.discount_price ?? menu.price;
}

export type TenantPlan = 'umkm_lite' | 'umkm_pro' | 'resto_basic' | 'resto_starter' | 'resto_pro' | 'resto_business';
export type TenantStatus = 'trial' | 'active' | 'suspended' | 'expired';

/** Bentuk respons GET /api/v1/tenants/me. */
export type Tenant = {
  id: string;
  name: string;
  slug: string;
  plan: TenantPlan;
  status: TenantStatus;
  trial_ends_at: string | null;
  logo_url: string | null;
  timezone: string;
  setup_completed_at: string | null;
  theme_color: string;
  address: string | null;
  phone: string | null;
  qris_url: string | null;
  receipt_footer: string | null;
  user: { id: string; name: string; email: string; role: string };
  feature_overrides: Record<string, boolean>;
};
