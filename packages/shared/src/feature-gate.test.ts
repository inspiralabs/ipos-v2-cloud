import { hasFeature } from './feature-gate.js';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${msg}`);
  }
}

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

async function run() {
  // Tier umkm_lite tidak punya stock_management, tidak ada override → false.
  {
    const db = fakeDb([]);
    const result = await hasFeature(db, 'tenant-1', 'umkm_lite', 'stock_management');
    assert(result === false, 'umkm_lite tanpa override: stock_management = false');
  }

  // Tier umkm_lite tidak punya stock_management, tapi ada override is_enabled=true → true.
  {
    const db = fakeDb([{ feature_key: 'stock_management', is_enabled: true }]);
    const result = await hasFeature(db, 'tenant-1', 'umkm_lite', 'stock_management');
    assert(result === true, 'umkm_lite + override true: stock_management = true');
  }

  // Tier umkm_pro punya void_transaction, tapi ada override is_enabled=false → false.
  {
    const db = fakeDb([{ feature_key: 'void_transaction', is_enabled: false }]);
    const result = await hasFeature(db, 'tenant-1', 'umkm_pro', 'void_transaction');
    assert(result === false, 'umkm_pro + override false: void_transaction = false');
  }

  // Tier umkm_pro punya basic_pos, tidak ada override untuk key itu → true (fallback tier).
  {
    const db = fakeDb([{ feature_key: 'stock_management', is_enabled: false }]); // override utk key lain
    const result = await hasFeature(db, 'tenant-1', 'umkm_pro', 'basic_pos');
    assert(result === true, 'umkm_pro basic_pos tanpa override utk key itu: fallback tier = true');
  }

  // plan null/undefined → selalu false meski ada override (tenant belum aktif/rusak).
  {
    const db = fakeDb([{ feature_key: 'basic_pos', is_enabled: true }]);
    const result = await hasFeature(db, 'tenant-1', null, 'basic_pos');
    assert(result === false, 'plan null: selalu false walau ada override');
  }
}

run();
