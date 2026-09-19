import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { buildTestApp, fakeDb } from '../test-support.js';
import { loginRoute } from './login.js';

const PASSWORD = 'rahasia123';

async function appWithUser(over: Record<string, unknown> = {}) {
  const user = {
    id: '11111111-1111-1111-1111-111111111111',
    tenant_id: null,
    outlet_id: null,
    name: 'Owner Toko',
    email: 'owner@toko.id',
    password_hash: await bcrypt.hash(PASSWORD, 4), // cost 4: test cepat, bukan nilai produksi
    role: 'owner',
    is_active: true,
    ...over,
  };
  const db = fakeDb({ users: [user], sessions: [], tenants: [] });
  const app = await buildTestApp({ db, routes: [[loginRoute, '/api/v1/auth']] });
  return { app, db, user };
}

test('trustProxy aktif: request.ip mengambil X-Forwarded-For', async () => {
  const { app, db } = await appWithUser();
  await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { 'x-forwarded-for': '203.0.113.7' },
    payload: { email: 'owner@toko.id', password: PASSWORD },
  });
  const session = db._writes.find((w: any) => w.op === 'insert' && w.table === 'sessions');
  assert.ok(session, 'login harus menyimpan baris sessions');
  assert.equal(
    (session.values as any).ip_address,
    '203.0.113.7',
    'tanpa trustProxy, ip_address berisi IP nginx dan rate limit jadi ember global'
  );
  await app.close();
});

test('login sukses mengembalikan access_token', async () => {
  const { app } = await appWithUser();
  const res = await app.inject({
    method: 'POST', url: '/api/v1/auth/login',
    payload: { email: 'owner@toko.id', password: PASSWORD },
  });
  assert.equal(res.statusCode, 200);
  assert.ok(res.json().access_token);
  await app.close();
});

test('password salah balas 401 dengan pesan generik', async () => {
  const { app } = await appWithUser();
  const res = await app.inject({
    method: 'POST', url: '/api/v1/auth/login',
    payload: { email: 'owner@toko.id', password: 'salah-sekali' },
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().code, 'INVALID_CREDENTIALS');
  await app.close();
});

test('/login punya rate limit sendiri, tidak hanya limit global 100/menit', async () => {
  const { app } = await appWithUser();
  const codes: number[] = [];
  for (let i = 0; i < 12; i++) {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      headers: { 'x-forwarded-for': '198.51.100.9' },
      payload: { email: 'owner@toko.id', password: 'salah-sekali' },
    });
    codes.push(res.statusCode);
  }
  assert.ok(codes.includes(429), `brute force password harus kena 429; dapat ${[...new Set(codes)].join(',')}`);
  await app.close();
});
