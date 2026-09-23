import test from 'node:test';
import assert from 'node:assert/strict';
import { softDeleteOne, restoreOne, softDeleteBulk } from './soft-delete.js';

function fakeDb(returning: unknown[]) {
  const inserted: unknown[] = [];
  return {
    update: () => ({ set: () => ({ where: () => ({ returning: async () => returning }) }) }),
    insert: () => ({ values: async (v: unknown) => { inserted.push(v); } }),
    _inserted: inserted,
  } as any;
}

const ctx = { targetType: 'tenant', adminId: 'admin-1', ipAddress: '1.2.3.4' };

test('softDeleteOne mengembalikan baris & mencatat audit log', async () => {
  const db = fakeDb([{ id: 't1', name: 'Toko A' }]);
  const result = await softDeleteOne({ db, table: {}, nameColumn: {}, id: 't1', ...ctx });
  assert.deepEqual(result, { id: 't1', name: 'Toko A' });
  assert.equal(db._inserted.length, 1);
  assert.equal((db._inserted[0] as any).action, 'tenant.deleted');
});

test('softDeleteOne mengembalikan null tanpa mencatat log kalau tidak ada baris ter-update', async () => {
  const db = fakeDb([]);
  const result = await softDeleteOne({ db, table: {}, nameColumn: {}, id: 'tidak-ada', ...ctx });
  assert.equal(result, null);
  assert.equal(db._inserted.length, 0, 'jangan catat audit log untuk operasi yang sebenarnya no-op (404)');
});

test('restoreOne mengembalikan baris & mencatat audit log', async () => {
  const db = fakeDb([{ id: 't1', name: 'Toko A' }]);
  const result = await restoreOne({ db, table: {}, nameColumn: {}, id: 't1', ...ctx });
  assert.deepEqual(result, { id: 't1', name: 'Toko A' });
  assert.equal((db._inserted[0] as any).action, 'tenant.restored');
});

test('restoreOne mengembalikan null kalau baris tidak sedang terhapus', async () => {
  const db = fakeDb([]);
  const result = await restoreOne({ db, table: {}, nameColumn: {}, id: 't1', ...ctx });
  assert.equal(result, null);
});

test('softDeleteBulk mencatat SATU log audit untuk banyak baris + gabungan nama', async () => {
  const db = fakeDb([{ id: 't1', name: 'Toko A' }, { id: 't2', name: 'Toko B' }]);
  const rows = await softDeleteBulk({ db, table: {}, nameColumn: {}, ids: ['t1', 't2'], ...ctx });
  assert.equal(rows.length, 2);
  const logged = db._inserted[0] as any;
  assert.equal(logged.action, 'tenant.bulk_deleted');
  assert.equal(logged.target_name, 'Toko A, Toko B');
});
