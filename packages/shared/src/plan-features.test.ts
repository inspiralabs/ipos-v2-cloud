import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAN_FEATURES, planHasFeature } from './plan-features.js';

test('plan-features tidak menarik dependency native', () => {
  // Kalau file ini sampai mengimpor db/redis/r2, require.cache akan memuat pg.
  // Ini penjaga agar file tetap aman dipakai di bundle browser.
  const loaded = Object.keys(require.cache).filter((p) => /node_modules[\\/](pg|ioredis|@aws-sdk)[\\/]/.test(p));
  assert.deepEqual(loaded, [], `plan-features menarik dependency native: ${loaded.join(', ')}`);
});

test('umkm_lite punya basic_pos tapi tidak punya stock_management', () => {
  assert.equal(planHasFeature('umkm_lite', 'basic_pos'), true);
  assert.equal(planHasFeature('umkm_lite', 'stock_management'), false);
});

test('override true memberi fitur yang tidak ada di plan', () => {
  assert.equal(planHasFeature('umkm_lite', 'stock_management', { stock_management: true }), true);
});

test('override false mencabut fitur yang ada di plan', () => {
  assert.equal(planHasFeature('umkm_pro', 'void_transaction', { void_transaction: false }), false);
});

test('plan null selalu false walau ada override', () => {
  assert.equal(planHasFeature(null, 'basic_pos', { basic_pos: true }), false);
});

test('resto_business adalah superset resto_pro', () => {
  for (const f of PLAN_FEATURES.resto_pro) {
    assert.ok(PLAN_FEATURES.resto_business.includes(f), `resto_business kehilangan ${f}`);
  }
});
