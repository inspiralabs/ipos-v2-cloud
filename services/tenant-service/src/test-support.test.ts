import test from 'node:test';
import assert from 'node:assert/strict';
import { tenants, users } from '@ipos-cloud/drizzle-schema';
import { fakeDb, TEST_KEYS } from './test-support.js';

test('fakeDb mengenali nama tabel drizzle', async () => {
  const db: any = fakeDb({ tenants: [{ id: 't1', name: 'Toko A' }] });
  const rows = await db.select().from(tenants).where().limit();
  assert.deepEqual(rows, [{ id: 't1', name: 'Toko A' }]);
});

test('fakeDb.insert mensintesis id kalau tidak diberikan, dan mendukung returning terproyeksi', async () => {
  const db: any = fakeDb({ users: [] });
  const [owner] = await db.insert(users).values({ name: 'Owner' }).returning({ id: users.id });
  assert.ok(owner.id, 'insert tanpa id manual harus tetap menghasilkan id — DB asli mengisi lewat defaultRandom()');
  assert.equal(Object.keys(owner).length, 1, 'returning({id}) cuma boleh memuat kolom id, bukan seluruh row');
});

test('fakeDb.transaction memanggil fn dengan db yang sama', async () => {
  const db: any = fakeDb({ tenants: [] });
  const result = await db.transaction(async (tx: any) => {
    await tx.insert(tenants).values({ name: 'X' });
    return 'selesai';
  });
  assert.equal(result, 'selesai');
  assert.equal(db._writes.length, 1);
});

test('TEST_KEYS berisi keypair RSA PEM', () => {
  assert.match(TEST_KEYS.private, /^-----BEGIN RSA PRIVATE KEY-----/);
  assert.match(TEST_KEYS.public, /^-----BEGIN PUBLIC KEY-----/);
});
