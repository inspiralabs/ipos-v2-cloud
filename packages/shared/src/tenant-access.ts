import { eq } from 'drizzle-orm';
import { tenants } from '@ipos-cloud/drizzle-schema';
import type { Db } from './db.js';

export type TenantAccess =
  | { ok: true; plan: string | null }
  | { ok: false; reason: 'SUSPENDED' | 'EXPIRED' | 'DELETED' | 'NOT_FOUND' };

/**
 * Satu tempat yang memutuskan boleh-tidaknya tenant mengakses API — dipakai auth-service
 * (menerbitkan token) DAN tenant-service (tenantGuard, tiap request). Sebelumnya lookup
 * plan/status disalin terpisah di login/refresh/pin-login dan TIDAK SATU PUN memeriksa
 * status, sehingga tenant suspended/expired tetap bisa bertransaksi.
 */
export async function resolveTenantAccess(db: Db, tenantId: string | null): Promise<TenantAccess> {
  if (!tenantId) return { ok: true, plan: null }; // akun admin InspiraLabs, bukan user tenant

  const [tenant] = await (db as any)
    .select({
      plan_code: tenants.plan_code,
      status: tenants.status,
      deleted_at: tenants.deleted_at,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) return { ok: false, reason: 'NOT_FOUND' };
  if (tenant.deleted_at) return { ok: false, reason: 'DELETED' };
  if (tenant.status === 'suspended') return { ok: false, reason: 'SUSPENDED' };
  if (tenant.status === 'expired') return { ok: false, reason: 'EXPIRED' };
  return { ok: true, plan: tenant.plan_code ?? null };
}

export const TENANT_BLOCKED_MESSAGE: Record<'SUSPENDED' | 'EXPIRED' | 'DELETED' | 'NOT_FOUND', string> = {
  SUSPENDED: 'Akun toko ini sedang ditangguhkan. Hubungi admin InspiraPOS.',
  EXPIRED: 'Masa berlangganan toko ini sudah berakhir. Perpanjang untuk masuk lagi.',
  DELETED: 'Akun toko ini sudah tidak aktif.',
  NOT_FOUND: 'Akun toko ini sudah tidak aktif.',
};
