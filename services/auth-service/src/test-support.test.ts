import test from 'node:test';
import assert from 'node:assert/strict';
import { users, sessions } from '@ipos-cloud/drizzle-schema';
import { fakeDb, TEST_KEYS } from './test-support.js';

test('fakeDb mengenali nama tabel drizzle', async () => {
  const db: any = fakeDb({ users: [{ id: 'u1' }], sessions: [] });
  const rows = await db.select().from(users).where().limit();
  assert.deepEqual(rows, [{ id: 'u1' }], 'nameOf gagal memetakan tabel -> kunci `tables`');
});

test('fakeDb mencatat insert beserta nama tabelnya', async () => {
  const db: any = fakeDb({ users: [], sessions: [] });
  await db.insert(sessions).values({ user_id: 'u1' });
  assert.deepEqual(db._writes, [{ op: 'insert', table: 'sessions', values: { user_id: 'u1' } }]);
});

test('fakeDb mencatat delete', async () => {
  const db: any = fakeDb({ sessions: [] });
  await db.delete(sessions).where();
  assert.deepEqual(db._writes, [{ op: 'delete', table: 'sessions' }]);
});

test('TEST_KEYS berisi keypair RSA PEM', () => {
  assert.match(TEST_KEYS.private, /^-----BEGIN RSA PRIVATE KEY-----/);
  assert.match(TEST_KEYS.public, /^-----BEGIN PUBLIC KEY-----/);
});
