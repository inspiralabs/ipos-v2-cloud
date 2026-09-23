import crypto from 'node:crypto';
export { resolveTenantAccess, TENANT_BLOCKED_MESSAGE, type TenantAccess } from '@ipos-cloud/shared';

// Satu sumber untuk masa berlaku access token: dipakai opsi sign di index.ts DAN
// field expires_in di respons. Sebelumnya '15m' dan 900 ditulis terpisah, jadi
// mengubah salah satu membuat klien menjadwalkan refresh di waktu yang salah.
export const ACCESS_TOKEN_TTL = '15m';
export const ACCESS_TOKEN_TTL_SECONDS = 900;

export function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

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
