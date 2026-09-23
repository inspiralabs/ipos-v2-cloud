import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTenantAccess } from './tenant-access.js';

const TENANT = '66666666-6666-6666-6666-666666666666';

function fakeDb(tenantRow: Record<string, unknown> | null) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (tenantRow ? [tenantRow] : []),
        }),
      }),
    }),
  } as any;
}

test('tenant aktif lolos dengan plan-nya', async () => {
  const db = fakeDb({ id: TENANT, plan_code: 'resto_pro', status: 'active', deleted_at: null });
  assert.deepEqual(await resolveTenantAccess(db, TENANT), { ok: true, plan: 'resto_pro' });
});

test('tenant trial lolos', async () => {
  const db = fakeDb({ id: TENANT, plan_code: 'umkm_lite', status: 'trial', deleted_at: null });
  assert.deepEqual(await resolveTenantAccess(db, TENANT), { ok: true, plan: 'umkm_lite' });
});

test('tenant suspended DITOLAK', async () => {
  const db = fakeDb({ id: TENANT, plan_code: 'resto_pro', status: 'suspended', deleted_at: null });
  assert.deepEqual(await resolveTenantAccess(db, TENANT), { ok: false, reason: 'SUSPENDED' });
});

test('tenant expired DITOLAK', async () => {
  const db = fakeDb({ id: TENANT, plan_code: 'resto_pro', status: 'expired', deleted_at: null });
  assert.deepEqual(await resolveTenantAccess(db, TENANT), { ok: false, reason: 'EXPIRED' });
});

test('tenant soft-deleted DITOLAK', async () => {
  const db = fakeDb({ id: TENANT, plan_code: 'resto_pro', status: 'active', deleted_at: new Date() });
  assert.deepEqual(await resolveTenantAccess(db, TENANT), { ok: false, reason: 'DELETED' });
});

test('akun admin InspiraLabs (tenant_id null) lolos tanpa plan', async () => {
  const db = fakeDb(null);
  assert.deepEqual(await resolveTenantAccess(db, null), { ok: true, plan: null });
});
