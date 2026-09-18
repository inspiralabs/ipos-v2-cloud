import type { FastifyRequest, FastifyReply } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { tenant_feature_overrides } from '@ipos-cloud/drizzle-schema';
import type { TenantPlan } from './types.js';
import type { Db } from './db.js';

export { PLAN_FEATURES, planHasFeature } from './plan-features.js';
import { PLAN_FEATURES, planHasFeature } from './plan-features.js';

export async function hasFeature(
  db: Db,
  tenantId: string,
  plan: TenantPlan | undefined | null,
  featureKey: string
): Promise<boolean> {
  if (!plan) return false;

  // WHERE sudah memfilter feature_key, jadi baris pertama (kalau ada) sudah pasti key yang dicari.
  const [override] = await db
    .select({ is_enabled: tenant_feature_overrides.is_enabled })
    .from(tenant_feature_overrides)
    .where(and(eq(tenant_feature_overrides.tenant_id, tenantId), eq(tenant_feature_overrides.feature_key, featureKey)))
    .limit(1);

  if (override) return override.is_enabled;

  if (!PLAN_FEATURES[plan]) {
    // plan_code default kolom adalah 'trial', yang bukan anggota TenantPlan. Dulu ini
    // diam-diam mengembalikan false sehingga tenant kehilangan SEMUA fitur tanpa jejak.
    console.warn(`[feature-gate] plan tidak dikenal "${plan}" untuk tenant ${tenantId} — semua fitur ditolak`);
    return false;
  }

  // Delegasi, bukan duplikasi: satu-satunya beda antara versi backend dan versi
  // browser adalah DARI MANA override-nya datang (query DB vs sudah di tangan).
  // Cek tier-nya sama, jadi hanya ada satu implementasi.
  return planHasFeature(plan, featureKey);
}

/**
 * `db` dioper eksplisit, TIDAK dibaca dari request.server.db. Versi lama membaca
 * decorator itu, dan 4 service (inventory, kitchen, table, report) tidak pernah
 * memanggil app.decorate('db') sehingga setiap route ber-gate membalas 500.
 * Dengan db sebagai parameter, kelalaian yang sama jadi error compile.
 */
export function requireFeature(db: Db, featureKey: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as unknown as { user?: { tenant_id?: string; plan?: TenantPlan | null } }).user;
    if (!user?.tenant_id || !(await hasFeature(db, user.tenant_id, user.plan, featureKey))) {
      return reply.code(403).send({ error: 'Feature not available on your plan', code: 'FEATURE_GATED' });
    }
  };
}
