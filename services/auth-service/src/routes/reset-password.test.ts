import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { buildTestApp, fakeDb } from '../test-support.js';
import { resetPasswordRoute } from './reset-password.js';

const USER_ID = '44444444-4444-4444-4444-444444444444';
const TOKEN = 'token-reset-mentah';
const tokenHash = crypto.createHash('sha256').update(TOKEN).digest('hex');

async function build() {
  const db = fakeDb({
    password_reset_tokens: [{
      id: '55555555-5555-5555-5555-555555555555',
      user_id: USER_ID,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 3600_000),
      used_at: null,
    }],
    users: [{ id: USER_ID }],
    sessions: [],
  });
  const app = await buildTestApp({ db, routes: [[resetPasswordRoute, '/api/v1/auth']] });
  return { app, db };
}

test('reset password sukses balas ok', async () => {
  const { app } = await build();
  const res = await app.inject({
    method: 'POST', url: '/api/v1/auth/reset-password',
    payload: { token: TOKEN, password: 'passwordbaru123' },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().ok, true);
  await app.close();
});

test('reset password MENCABUT semua sesi aktif user', async () => {
  const { app, db } = await build();
  await app.inject({
    method: 'POST', url: '/api/v1/auth/reset-password',
    payload: { token: TOKEN, password: 'passwordbaru123' },
  });
  const deleted = db._writes.find((w: any) => w.op === 'delete' && w.table === 'sessions');
  assert.ok(deleted,
    'tanpa ini, penyerang yang sudah punya refresh_token tetap punya akses 30 hari setelah korban ganti password');
  await app.close();
});

test('reset password menandai token terpakai', async () => {
  const { app, db } = await build();
  await app.inject({
    method: 'POST', url: '/api/v1/auth/reset-password',
    payload: { token: TOKEN, password: 'passwordbaru123' },
  });
  const used = db._writes.find(
    (w: any) => w.op === 'update' && w.table === 'password_reset_tokens' && (w.values as any).used_at
  );
  assert.ok(used, 'token reset harus sekali pakai');
  await app.close();
});
