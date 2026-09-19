import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTestApp, fakeDb } from '../test-support.js';
import { pinLoginRoutes } from './pin-login.js';

const TENANT = '22222222-2222-2222-2222-222222222222';
const STAFF = {
  id: '33333333-3333-3333-3333-333333333333',
  tenant_id: TENANT,
  outlet_id: null,
  name: 'Kasir Siti',
  role: 'cashier',
  is_active: true,
  pin_hash: '$2a$04$abcdefghijklmnopqrstuv',
};

async function build() {
  const db = fakeDb({ users: [STAFF], tenants: [{ id: TENANT, plan_code: 'resto_pro' }], sessions: [] });
  const app = await buildTestApp({ db, routes: [[pinLoginRoutes, '/api/v1/auth']] });
  const token = app.jwt.sign({ sub: STAFF.id, tenant_id: TENANT, role: 'cashier', plan: 'resto_pro', outlet_id: null });
  return { app, db, token };
}

test('daftar staf TANPA token balas 401', async () => {
  const { app } = await build();
  const res = await app.inject({ method: 'GET', url: '/api/v1/auth/pin-login/staff' });
  assert.equal(res.statusCode, 401, 'endpoint ini membocorkan seluruh daftar staf kalau publik');
  await app.close();
});

test('tenant_id dari query string TIDAK dipercaya', async () => {
  const { app } = await build();
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/auth/pin-login/staff?tenant_id=99999999-9999-9999-9999-999999999999`,
  });
  assert.equal(res.statusCode, 401, 'tanpa token harus 401 apa pun isi query');
  await app.close();
});

test('daftar staf DENGAN token valid balas data', async () => {
  const { app, token } = await build();
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/auth/pin-login/staff',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0].name, 'Kasir Siti');
  await app.close();
});

test('respons daftar staf tidak memuat pin_hash atau email', async () => {
  const { app, token } = await build();
  const res = await app.inject({
    method: 'GET', url: '/api/v1/auth/pin-login/staff',
    headers: { authorization: `Bearer ${token}` },
  });
  const row = res.json().data[0];
  assert.equal(row.pin_hash, undefined);
  assert.equal(row.email, undefined);
  await app.close();
});
