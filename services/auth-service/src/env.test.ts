import test from 'node:test';
import assert from 'node:assert/strict';
import { requireEnv, resolveCorsOrigin, REFRESH_COOKIE_OPTIONS } from './env.js';

test('requireEnv lolos kalau semua key ada', () => {
  requireEnv(['A', 'B'], { A: '1', B: '2' } as any);
});

test('requireEnv menyebut SEMUA key yang kurang dalam satu pesan', () => {
  assert.throws(
    () => requireEnv(['A', 'B', 'C'], { B: '2' } as any),
    (err: Error) => {
      assert.match(err.message, /A/);
      assert.match(err.message, /C/);
      assert.doesNotMatch(err.message, /\bB\b/, 'key yang sudah ada jangan ikut disebut');
      return true;
    }
  );
});

test('requireEnv menolak env berisi string kosong', () => {
  assert.throws(() => requireEnv(['A'], { A: '' } as any), /A/);
});

test('CORS_ORIGIN kosong di produksi MELEMPAR, tidak jatuh ke origin: true', () => {
  assert.throws(
    () => resolveCorsOrigin(undefined, 'production'),
    /CORS_ORIGIN/,
    'origin: true + credentials: true membuka endpoint auth ke situs mana pun'
  );
});

test('CORS_ORIGIN kosong di dev mengembalikan true', () => {
  assert.equal(resolveCorsOrigin(undefined, undefined), true);
});

test('CORS_ORIGIN di-split dan di-trim', () => {
  assert.deepEqual(
    resolveCorsOrigin('https://a.id, https://b.id ', 'production'),
    ['https://a.id', 'https://b.id']
  );
});

test('CORS_ORIGIN berisi hanya koma/spasi dianggap kosong di produksi', () => {
  assert.throws(() => resolveCorsOrigin(' , ', 'production'), /CORS_ORIGIN/);
});

test('opsi cookie refresh punya httpOnly dan sameSite', () => {
  assert.equal(REFRESH_COOKIE_OPTIONS.httpOnly, true);
  assert.equal(REFRESH_COOKIE_OPTIONS.sameSite, 'strict');
  assert.equal(REFRESH_COOKIE_OPTIONS.path, '/');
});
