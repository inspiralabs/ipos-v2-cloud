import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { buildTestApp, fakeDb } from '../test-support.js';
import { pinLoginRoutes } from './pin-login.js';
import { MAX_PIN_ATTEMPTS } from '../pin-attempts.js';

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

function fakeRedisForApp() {
  const store = new Map<string, number>();
  return {
    async incr(k: string) { const v = (store.get(k) ?? 0) + 1; store.set(k, v); return v; },
    async expire() { return 1; },
    async get(k: string) { const v = store.get(k); return v === undefined ? null : String(v); },
    async del(k: string) { store.delete(k); return 1; },
  };
}

test('PIN salah berulang mengunci akun', async () => {
  const pin_hash = await bcrypt.hash('1234', 4);
  const db = fakeDb({
    users: [{ ...STAFF, pin_hash }],
    tenants: [{ id: TENANT, plan_code: 'resto_pro' }],
    sessions: [],
  });
  const app = await buildTestApp({ db, redis: fakeRedisForApp(), routes: [[pinLoginRoutes, '/api/v1/auth']] });
  const body = { tenant_id: TENANT, user_id: STAFF.id, pin: '9999' };

  for (let i = 0; i < MAX_PIN_ATTEMPTS; i++) {
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/pin-login', payload: body });
    assert.equal(res.statusCode, 401, `percobaan ke-${i + 1} harus 401`);
  }
  const locked = await app.inject({ method: 'POST', url: '/api/v1/auth/pin-login', payload: body });
  assert.equal(locked.statusCode, 429);
  assert.equal(locked.json().code, 'PIN_LOCKED');

  // PIN yang BENAR pun harus ditolak selama terkunci.
  const correct = await app.inject({
    method: 'POST', url: '/api/v1/auth/pin-login',
    payload: { ...body, pin: '1234' },
  });
  assert.equal(correct.statusCode, 429, 'lockout harus berlaku walau PIN-nya benar');
  await app.close();
});

test('pin-login membuat baris sessions dan mengganti cookie refresh_token', async () => {
  const pin_hash = await bcrypt.hash('1234', 4);
  const db = fakeDb({
    users: [{ ...STAFF, pin_hash }],
    tenants: [{ id: TENANT, plan_code: 'resto_pro' }],
    sessions: [],
  });
  const app = await buildTestApp({ db, redis: fakeRedisForApp(), routes: [[pinLoginRoutes, '/api/v1/auth']] });

  const res = await app.inject({
    method: 'POST', url: '/api/v1/auth/pin-login',
    // Cookie kasir SEBELUMNYA masih terpasang di perangkat.
    headers: { cookie: 'refresh_token=token-kasir-lama' },
    payload: { tenant_id: TENANT, user_id: STAFF.id, pin: '1234' },
  });

  assert.equal(res.statusCode, 200);

  const inserted = db._writes.find((w: any) => w.op === 'insert' && w.table === 'sessions');
  assert.ok(inserted, 'pin-login harus membuat baris sessions untuk kasir baru');
  assert.equal((inserted.values as any).user_id, STAFF.id);

  const setCookie = String(res.headers['set-cookie'] ?? '');
  assert.match(setCookie, /refresh_token=/, 'cookie refresh harus diganti');
  assert.doesNotMatch(setCookie, /token-kasir-lama/,
    'cookie kasir lama harus tergantikan, kalau tidak /refresh akan memulihkan identitas kasir sebelumnya');
  await app.close();
});

test('pin-login menghapus sesi kasir sebelumnya di perangkat yang sama', async () => {
  const pin_hash = await bcrypt.hash('1234', 4);
  const db = fakeDb({
    users: [{ ...STAFF, pin_hash }],
    tenants: [{ id: TENANT, plan_code: 'resto_pro' }],
    sessions: [],
  });
  const app = await buildTestApp({ db, redis: fakeRedisForApp(), routes: [[pinLoginRoutes, '/api/v1/auth']] });
  await app.inject({
    method: 'POST', url: '/api/v1/auth/pin-login',
    headers: { cookie: 'refresh_token=token-kasir-lama' },
    payload: { tenant_id: TENANT, user_id: STAFF.id, pin: '1234' },
  });
  const deleted = db._writes.find((w: any) => w.op === 'delete' && w.table === 'sessions');
  assert.ok(deleted, 'sesi kasir lama di perangkat ini harus dicabut, bukan dibiarkan hidup 30 hari');
  await app.close();
});
