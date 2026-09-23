import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTestApp, fakeDb } from '../../test-support.js';
import { tenantUsersRoutes } from './users.js';

const TENANT = '22222222-2222-2222-2222-222222222222';
const OWNER_ID = '33333333-3333-3333-3333-333333333333';
const CASHIER_ID = '44444444-4444-4444-4444-444444444444';

async function build() {
  const db = fakeDb({
    tenants: [{ id: TENANT, status: 'active', deleted_at: null }],
    users: [
      { id: OWNER_ID, tenant_id: TENANT, name: 'Owner', role: 'owner', is_active: true },
      { id: CASHIER_ID, tenant_id: TENANT, name: 'Kasir', role: 'cashier', is_active: true },
    ],
  });
  const app = await buildTestApp({ db, routes: [[tenantUsersRoutes, '/api/v1/tenants/users']] });
  const asCashier = app.jwt.sign({ sub: CASHIER_ID, tenant_id: TENANT, role: 'cashier' });
  const asOwner = app.jwt.sign({ sub: OWNER_ID, tenant_id: TENANT, role: 'owner' });
  return { app, db, asCashier, asOwner };
}

test('kasir TIDAK BISA melihat daftar staf (bocor owner_id) — akar temuan A', async () => {
  const { app, asCashier } = await build();
  const res = await app.inject({ method: 'GET', url: '/api/v1/tenants/users', headers: { authorization: `Bearer ${asCashier}` } });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().code, 'FORBIDDEN_ROLE');
  await app.close();
});

test('owner BISA melihat daftar staf', async () => {
  const { app, asOwner } = await build();
  const res = await app.inject({ method: 'GET', url: '/api/v1/tenants/users', headers: { authorization: `Bearer ${asOwner}` } });
  assert.equal(res.statusCode, 200);
  await app.close();
});

test('kasir TIDAK BISA membuat akun manager', async () => {
  const { app, asCashier } = await build();
  const res = await app.inject({
    method: 'POST', url: '/api/v1/tenants/users', headers: { authorization: `Bearer ${asCashier}` },
    payload: { name: 'Manager Baru', email: 'm@toko.id', password: 'rahasia123', role: 'manager' },
  });
  assert.equal(res.statusCode, 403, 'kasir tidak boleh eskalasi diri sendiri jadi setara manager/owner');
  await app.close();
});

test('kasir TIDAK BISA mengganti PIN owner', async () => {
  const { app, asCashier } = await build();
  const res = await app.inject({
    method: 'PATCH', url: `/api/v1/tenants/users/${OWNER_ID}/pin`, headers: { authorization: `Bearer ${asCashier}` },
    payload: { pin: '9999' },
  });
  assert.equal(res.statusCode, 403);
  await app.close();
});

test('kasir TIDAK BISA menonaktifkan owner', async () => {
  const { app, asCashier } = await build();
  const res = await app.inject({
    method: 'PATCH', url: `/api/v1/tenants/users/${OWNER_ID}/deactivate`, headers: { authorization: `Bearer ${asCashier}` },
  });
  assert.equal(res.statusCode, 403);
  await app.close();
});

test('owner BISA mengganti PIN kasir', async () => {
  const { app, asOwner } = await build();
  const res = await app.inject({
    method: 'PATCH', url: `/api/v1/tenants/users/${CASHIER_ID}/pin`, headers: { authorization: `Bearer ${asOwner}` },
    payload: { pin: '1234' },
  });
  assert.equal(res.statusCode, 200);
  await app.close();
});
