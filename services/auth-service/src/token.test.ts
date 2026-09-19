import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeDb } from './test-support.js';
import {
  ACCESS_TOKEN_TTL_SECONDS, hashToken, resolveTenantAccess, buildJwtPayload,
} from './token.js';

const TENANT = '66666666-6666-6666-6666-666666666666';

test('hashToken deterministik dan bukan token mentah', () => {
  assert.equal(hashToken('abc'), hashToken('abc'));
  assert.notEqual(hashToken('abc'), 'abc');
  assert.equal(hashToken('abc').length, 64);
});

test('tenant aktif lolos dengan plan-nya', async () => {
  const db = fakeDb({ tenants: [{ id: TENANT, plan_code: 'resto_pro', status: 'active', deleted_at: null }] });
  assert.deepEqual(await resolveTenantAccess(db as any, TENANT), { ok: true, plan: 'resto_pro' });
});

test('tenant trial lolos', async () => {
  const db = fakeDb({ tenants: [{ id: TENANT, plan_code: 'umkm_lite', status: 'trial', deleted_at: null }] });
  assert.deepEqual(await resolveTenantAccess(db as any, TENANT), { ok: true, plan: 'umkm_lite' });
});

test('tenant suspended DITOLAK', async () => {
  const db = fakeDb({ tenants: [{ id: TENANT, plan_code: 'resto_pro', status: 'suspended', deleted_at: null }] });
  assert.deepEqual(await resolveTenantAccess(db as any, TENANT), { ok: false, reason: 'SUSPENDED' });
});

test('tenant expired DITOLAK', async () => {
  const db = fakeDb({ tenants: [{ id: TENANT, plan_code: 'resto_pro', status: 'expired', deleted_at: null }] });
  assert.deepEqual(await resolveTenantAccess(db as any, TENANT), { ok: false, reason: 'EXPIRED' });
});

test('tenant soft-deleted DITOLAK', async () => {
  const db = fakeDb({ tenants: [{ id: TENANT, plan_code: 'resto_pro', status: 'active', deleted_at: new Date() }] });
  assert.deepEqual(await resolveTenantAccess(db as any, TENANT), { ok: false, reason: 'DELETED' });
});

test('akun admin InspiraLabs (tenant_id null) lolos tanpa plan', async () => {
  const db = fakeDb({ tenants: [] });
  assert.deepEqual(await resolveTenantAccess(db as any, null), { ok: true, plan: null });
});

test('buildJwtPayload memuat semua klaim yang dipakai service hilir', () => {
  const p = buildJwtPayload(
    { id: 'u1', role: 'owner', tenant_id: 't1', outlet_id: 'o1' },
    'resto_pro'
  );
  assert.deepEqual(p, { sub: 'u1', tenant_id: 't1', role: 'owner', plan: 'resto_pro', outlet_id: 'o1' });
});

test('buildJwtPayload menyertakan impersonated_by kalau diberikan', () => {
  const p = buildJwtPayload(
    { id: 'u1', role: 'owner', tenant_id: 't1', outlet_id: null },
    'resto_pro',
    { impersonated_by: 'admin-1' }
  );
  assert.equal(p.impersonated_by, 'admin-1');
});

test('ACCESS_TOKEN_TTL_SECONDS konsisten 900', () => {
  assert.equal(ACCESS_TOKEN_TTL_SECONDS, 900);
});
