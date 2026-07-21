export type UserRole = 'super_admin' | 'admin_staff' | 'owner' | 'cashier' | 'kitchen_staff';
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
