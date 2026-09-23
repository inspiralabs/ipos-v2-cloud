import test from 'node:test';
import assert from 'node:assert/strict';
import { ACCESS_TOKEN_TTL_SECONDS, hashToken, buildJwtPayload } from './token.js';

test('hashToken deterministik dan bukan token mentah', () => {
  assert.equal(hashToken('abc'), hashToken('abc'));
  assert.notEqual(hashToken('abc'), 'abc');
  assert.equal(hashToken('abc').length, 64);
});

test('buildJwtPayload memuat semua klaim yang dipakai service hilir', () => {
  const p = buildJwtPayload(
    { id: 'u1', role: 'owner', tenant_id: 't1', outlet_id: 'o1' },
    'resto_pro'
  );
  assert.deepEqual(p, { sub: 'u1', tenant_id: 't1', role: 'owner', plan: 'resto_pro', outlet_id: 'o1' });
});

test('buildJwtPayload menyertakan impersonated_by kalau diberikan', () => {
  const p = buildJwtPayload(
    { id: 'u1', role: 'owner', tenant_id: 't1', outlet_id: null },
    'resto_pro',
    { impersonated_by: 'admin-1' }
  );
  assert.equal(p.impersonated_by, 'admin-1');
});

test('ACCESS_TOKEN_TTL_SECONDS konsisten 900', () => {
  assert.equal(ACCESS_TOKEN_TTL_SECONDS, 900);
});
