import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { tenants } from '@ipos-cloud/drizzle-schema';
import type { Db } from '@ipos-cloud/shared';

// Satu sumber untuk masa berlaku access token: dipakai opsi sign di index.ts DAN
// field expires_in di respons. Sebelumnya '15m' dan 900 ditulis terpisah, jadi
// mengubah salah satu membuat klien menjadwalkan refresh di waktu yang salah.
export const ACCESS_TOKEN_TTL = '15m';
export const ACCESS_TOKEN_TTL_SECONDS = 900;

export function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export type TenantAccess =
  | { ok: true; plan: string | null }
  | { ok: false; reason: 'SUSPENDED' | 'EXPIRED' | 'DELETED' | 'NOT_FOUND' };

/**
 * Satu tempat yang memutuskan boleh-tidaknya tenant menerbitkan token.
 * Sebelumnya lookup plan disalin di login/refresh/pin-login dan TIDAK SATU PUN
 * memeriksa status, sehingga tenant suspended/expired tetap bisa bertransaksi
 * dan fitur suspend langganan cuma kosmetik.
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

export function buildJwtPayload(
  user: { id: string; role: string; tenant_id: string | null; outlet_id: string | null },
  plan: string | null,
  extra?: { impersonated_by?: string }
): Record<string, unknown> {
  return {
    sub: user.id,
    tenant_id: user.tenant_id ?? null,
    role: user.role,
    plan,
    outlet_id: user.outlet_id ?? null,
    ...(extra?.impersonated_by ? { impersonated_by: extra.impersonated_by } : {}),
  };
}
