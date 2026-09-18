import test from 'node:test';
import assert from 'node:assert/strict';
import { hasFeature } from './feature-gate.js';

type FakeRow = { feature_key: string; is_enabled: boolean };

function fakeDb(overrideRows: FakeRow[]) {
  return {
    select: () => ({
      from: () => ({
        // hasFeature memanggil .limit(1) setelah .where(...) (lihat feature-gate.ts),
        // jadi where() di sini harus mengembalikan builder ber-.limit(), bukan Promise langsung.
        where: () => ({
          limit: async (n: number) => overrideRows.slice(0, n),
        }),
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
  // WHERE di query sudah memfilter feature_key, jadi override untuk key lain
  // (mis. stock_management) tidak akan pernah ikut ke sini — fakeDb kosong
  // mensimulasikan hasil WHERE yang benar untuk key 'basic_pos'.
  const db = fakeDb([]);
  assert.equal(await hasFeature(db, 'tenant-1', 'umkm_pro', 'basic_pos'), true);
});

test('plan null: selalu false walau ada override', async () => {
  const db = fakeDb([{ feature_key: 'basic_pos', is_enabled: true }]);
  assert.equal(await hasFeature(db, 'tenant-1', null, 'basic_pos'), false);
});

test('plan tidak dikenal ("trial", default kolom plan_code): hasFeature = false', async () => {
  const db = fakeDb([]);
  // 'trial' bukan anggota TenantPlan tapi memang nilai default kolom tenants.plan_code —
  // ini branch yang membedakan hasFeature dari sekadar delegasi ke planHasFeature (lihat
  // komentar di feature-gate.ts: PLAN_FEATURES[plan] dicek dulu supaya console.warn tidak hilang).
  // Warn di-stub supaya output test tetap bersih, sekaligus jadi bukti branch itu terpicu.
  const originalWarn = console.warn;
  const warnCalls: unknown[][] = [];
  console.warn = (...args: unknown[]) => { warnCalls.push(args); };
  try {
    const result = await hasFeature(db, 'tenant-1', 'trial' as unknown as import('./types.js').TenantPlan, 'basic_pos');
    assert.equal(result, false);
    assert.equal(warnCalls.length, 1, 'plan tidak dikenal harus memicu console.warn tepat sekali');
    assert.match(String(warnCalls[0][0]), /plan tidak dikenal/);
  } finally {
    console.warn = originalWarn;
  }
});

import { requireFeature } from './feature-gate.js';

function fakeReply() {
  const sent: { code?: number; body?: unknown } = {};
  return {
    sent,
    code(c: number) { sent.code = c; return this; },
    send(b: unknown) { sent.body = b; return this; },
  };
}

test('requireFeature membalas 403 kalau plan tidak punya fitur', async () => {
  const guard = requireFeature(fakeDb([]), 'stock_management');
  const reply = fakeReply();
  await guard({ user: { tenant_id: 't1', plan: 'umkm_lite' } } as any, reply as any);
  assert.equal(reply.sent.code, 403);
  assert.deepEqual(reply.sent.body, { error: 'Feature not available on your plan', code: 'FEATURE_GATED' });
});

test('requireFeature lolos (tidak menyentuh reply) kalau plan punya fitur', async () => {
  const guard = requireFeature(fakeDb([]), 'basic_pos');
  const reply = fakeReply();
  await guard({ user: { tenant_id: 't1', plan: 'umkm_lite' } } as any, reply as any);
  assert.equal(reply.sent.code, undefined, 'guard tidak boleh mengirim respons saat fitur tersedia');
});

test('requireFeature membalas 403 kalau token tidak punya tenant_id', async () => {
  const guard = requireFeature(fakeDb([]), 'basic_pos');
  const reply = fakeReply();
  await guard({ user: { tenant_id: null, plan: 'umkm_lite' } } as any, reply as any);
  assert.equal(reply.sent.code, 403);
});

// Regresi bug D: db datang dari parameter, BUKAN request.server.db.
// Request di test ini sengaja tidak punya `server` sama sekali.
test('requireFeature tidak bergantung pada request.server.db', async () => {
  const guard = requireFeature(fakeDb([{ feature_key: 'stock_management', is_enabled: true }]), 'stock_management');
  const reply = fakeReply();
  await guard({ user: { tenant_id: 't1', plan: 'umkm_lite' } } as any, reply as any);
  assert.equal(reply.sent.code, undefined, 'override true harus meloloskan guard tanpa request.server');
});
