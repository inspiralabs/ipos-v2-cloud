import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTestApp, fakeDb } from '../../test-support.js';
import { tenantMeRoutes } from './me.js';

const TENANT = '55555555-5555-5555-5555-555555555555';
const CASHIER_ID = '66666666-6666-6666-6666-666666666666';

async function build() {
  const db = fakeDb({
    tenants: [{ id: TENANT, status: 'active', deleted_at: null, name: 'Toko A' }],
    users: [{ id: CASHIER_ID, tenant_id: TENANT, name: 'Kasir', role: 'cashier' }],
    tenant_feature_overrides: [],
  });
  const app = await buildTestApp({ db, routes: [[tenantMeRoutes, '/api/v1/tenants']] });
  const asCashier = app.jwt.sign({ sub: CASHIER_ID, tenant_id: TENANT, role: 'cashier' });
  const asOwner = app.jwt.sign({ sub: 'owner-1', tenant_id: TENANT, role: 'owner' });
  return { app, asCashier, asOwner };
}

test('GET /me tetap terbuka untuk kasir', async () => {
  const { app, asCashier } = await build();
  const res = await app.inject({ method: 'GET', url: '/api/v1/tenants/me', headers: { authorization: `Bearer ${asCashier}` } });
  assert.equal(res.statusCode, 200);
  await app.close();
});

test('kasir TIDAK BISA ubah profil toko — akar temuan A', async () => {
  const { app, asCashier } = await build();
  const res = await app.inject({
    method: 'PATCH', url: '/api/v1/tenants/me', headers: { authorization: `Bearer ${asCashier}` },
    payload: { name: 'Nama Diubah Kasir' },
  });
  assert.equal(res.statusCode, 403);
  await app.close();
});

test('owner BISA ubah profil toko', async () => {
  const { app, asOwner } = await build();
  const res = await app.inject({
    method: 'PATCH', url: '/api/v1/tenants/me', headers: { authorization: `Bearer ${asOwner}` },
    payload: { name: 'Nama Baru' },
  });
  assert.equal(res.statusCode, 200);
  await app.close();
});

test('kasir TIDAK BISA upload logo toko', async () => {
  const { app, asCashier } = await build();
  const res = await app.inject({ method: 'POST', url: '/api/v1/tenants/me/logo', headers: { authorization: `Bearer ${asCashier}` } });
  assert.equal(res.statusCode, 403, 'ditolak di preHandler, sebelum request.file() dipanggil');
  await app.close();
});

test('kasir TIDAK BISA upload gambar QRIS', async () => {
  const { app, asCashier } = await build();
  const res = await app.inject({ method: 'POST', url: '/api/v1/tenants/me/qris', headers: { authorization: `Bearer ${asCashier}` } });
  assert.equal(res.statusCode, 403);
  await app.close();
});
