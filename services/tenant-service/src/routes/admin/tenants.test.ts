import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTestApp, fakeDb } from '../../test-support.js';
import { tenantsAdminRoutes } from './tenants.js';

async function build() {
  const db = fakeDb({ tenants: [], users: [], admin_audit_logs: [] });
  const app = await buildTestApp({ db, routes: [[tenantsAdminRoutes, '/api/v1/admin/tenants']] });
  const token = app.jwt.sign({ sub: 'admin-1', role: 'super_admin', tenant_id: null });
  return { app, db, token };
}

test('POST / membuat tenant + owner dalam satu transaksi dan mengisi owner_id', async () => {
  const { app, db, token } = await build();
  const res = await app.inject({
    method: 'POST', url: '/api/v1/admin/tenants', headers: { authorization: `Bearer ${token}` },
    payload: { name: 'Toko Baru', email: 'owner@baru.id' },
  });
  assert.equal(res.statusCode, 201);

  const tenantInsert = db._writes.find((w: any) => w.op === 'insert' && w.table === 'tenants');
  const userInsert = db._writes.find((w: any) => w.op === 'insert' && w.table === 'users');
  const ownerLink = db._writes.find((w: any) => w.op === 'update' && w.table === 'tenants');

  assert.ok(tenantInsert, 'tenant harus dibuat');
  assert.ok(userInsert, 'owner user harus dibuat');
  assert.equal(userInsert.values.role, 'owner');
  assert.ok(ownerLink, 'tenants.owner_id harus di-update setelah user owner dibuat — sebelumnya TIDAK PERNAH terjadi');
  assert.equal(
    ownerLink.values.owner_id, userInsert.values.id,
    'owner_id harus menunjuk ke user owner yang baru dibuat, bukan kosong — tanpa ini email admin selalu null & reset-owner-password selalu 404'
  );
  await app.close();
});

test('POST / balas owner_temp_password sekali, dan tenant hasil akhir punya owner_id', async () => {
  const { app, token } = await build();
  const res = await app.inject({
    method: 'POST', url: '/api/v1/admin/tenants', headers: { authorization: `Bearer ${token}` },
    payload: { name: 'Toko B', email: 'b@toko.id' },
  });
  const body = res.json();
  assert.ok(body.owner_temp_password);
  assert.ok(body.owner_id, 'response tenant yang dikembalikan ke admin-app harus sudah memuat owner_id, bukan hasil SEBELUM link dibuat');
  await app.close();
});
