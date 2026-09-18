import test from 'node:test';
import assert from 'node:assert/strict';
import { hasFeature } from './feature-gate.js';

type FakeRow = { feature_key: string; is_enabled: boolean };

function fakeDb(overrideRows: FakeRow[]) {
  return {
    select: () => ({
      from: () => ({
        where: async () => overrideRows,
      }),
    }),
  } as any;
}

test('umkm_lite tanpa override: stock_management = false', async () => {
  assert.equal(await hasFeature(fakeDb([]), 'tenant-1', 'umkm_lite', 'stock_management'), false);
});

test('umkm_lite + override true: stock_management = true', async () => {
  const db = fakeDb([{ feature_key: 'stock_management', is_enabled: true }]);
  assert.equal(await hasFeature(db, 'tenant-1', 'umkm_lite', 'stock_management'), true);
});

test('umkm_pro + override false: void_transaction = false', async () => {
  const db = fakeDb([{ feature_key: 'void_transaction', is_enabled: false }]);
  assert.equal(await hasFeature(db, 'tenant-1', 'umkm_pro', 'void_transaction'), false);
});

test('umkm_pro basic_pos tanpa override utk key itu: fallback tier = true', async () => {
  // override ada, tapi untuk feature key lain — tidak boleh ikut mempengaruhi.
  const db = fakeDb([{ feature_key: 'stock_management', is_enabled: false }]);
  assert.equal(await hasFeature(db, 'tenant-1', 'umkm_pro', 'basic_pos'), true);
});

test('plan null: selalu false walau ada override', async () => {
  const db = fakeDb([{ feature_key: 'basic_pos', is_enabled: true }]);
  assert.equal(await hasFeature(db, 'tenant-1', null, 'basic_pos'), false);
});
