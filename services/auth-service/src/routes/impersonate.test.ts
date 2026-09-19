import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTestApp, fakeDb } from '../test-support.js';
import { impersonateRoute } from './impersonate.js';

const SUPER_ADMIN_ID = '00000000-0000-0000-0000-000000000001';
const TENANT_ID = '77777777-7777-7777-7777-777777777777';
const OWNER = {
  id: '11111111-1111-1111-1111-111111111111',
  tenant_id: TENANT_ID,
  outlet_id: null,
  name: 'Owner Toko',
  role: 'owner',
  is_active: true,
};

async function build(tenant: Record<string, unknown>) {
  const db = fakeDb({ users: [OWNER], tenants: [tenant], sessions: [] });
  const app = await buildTestApp({ db, routes: [[impersonateRoute, '/api/v1/admin']] });
  const superAdminToken = app.jwt.sign({ sub: SUPER_ADMIN_ID, tenant_id: null, role: 'super_admin', plan: null, outlet_id: null });
  return { app, db, superAdminToken };
}

test('impersonate DITOLAK kalau tenant sedang suspended', async () => {
  const { app, superAdminToken } = await build({
    id: TENANT_ID, name: 'Toko Suspended', slug: 'toko-suspended',
    owner_id: OWNER.id, plan_code: 'resto_pro', status: 'suspended', deleted_at: null,
  });
  const res = await app.inject({
    method: 'POST',
    url: `/api/v1/admin/tenants/${TENANT_ID}/impersonate`,
    headers: { authorization: `Bearer ${superAdminToken}` },
  });
  assert.equal(res.statusCode, 403, 'tenant suspended tidak boleh diimpersonate');
  assert.equal(res.json().code, 'TENANT_SUSPENDED');
  assert.equal(res.json().access_token, undefined, 'token tidak boleh diterbitkan untuk tenant yang diblokir');
  await app.close();
});

test('impersonate DITOLAK kalau tenant sudah expired', async () => {
  const { app, superAdminToken } = await build({
    id: TENANT_ID, name: 'Toko Expired', slug: 'toko-expired',
    owner_id: OWNER.id, plan_code: 'resto_pro', status: 'expired', deleted_at: null,
  });
  const res = await app.inject({
    method: 'POST',
    url: `/api/v1/admin/tenants/${TENANT_ID}/impersonate`,
    headers: { authorization: `Bearer ${superAdminToken}` },
  });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().code, 'TENANT_EXPIRED');
  await app.close();
});

test('impersonate sukses untuk tenant aktif mengembalikan access_token', async () => {
  const { app, superAdminToken } = await build({
    id: TENANT_ID, name: 'Toko Aktif', slug: 'toko-aktif',
    owner_id: OWNER.id, plan_code: 'resto_pro', status: 'active', deleted_at: null,
  });
  const res = await app.inject({
    method: 'POST',
    url: `/api/v1/admin/tenants/${TENANT_ID}/impersonate`,
    headers: { authorization: `Bearer ${superAdminToken}` },
  });
  assert.equal(res.statusCode, 200);
  assert.ok(res.json().access_token);
  await app.close();
});
