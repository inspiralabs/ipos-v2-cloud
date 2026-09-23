// waiter/manager/outlet_manager dipakai users.role & UI staf (lihat StaffCard.tsx,
// pin-login/page.tsx) tapi sebelumnya tidak ada di tipe ini — JwtPayload.role bertipe
// UserRole jadi diam-diam tidak mencakup 3 dari 8 role yang benar-benar ada di produksi.
export type UserRole = 'super_admin' | 'admin_staff' | 'owner' | 'manager' | 'outlet_manager' | 'cashier' | 'kitchen_staff' | 'waiter';
export type TenantStatus = 'trial' | 'active' | 'suspended' | 'expired';
export type TenantPlan = 'umkm_lite' | 'umkm_pro' | 'resto_basic' | 'resto_starter' | 'resto_pro' | 'resto_business';

export interface JwtPayload {
  sub: string;
  tenant_id: string | null;
  role: UserRole;
  plan: TenantPlan | null;
  outlet_id: string | null;
  iat: number;
  exp: number;
}

export interface ApiError {
  error: string;
  code: string;
}
