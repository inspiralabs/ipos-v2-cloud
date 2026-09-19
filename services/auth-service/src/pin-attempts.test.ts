import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PIN_ATTEMPTS, registerFailedPin, isPinLocked, clearPinAttempts,
} from './pin-attempts.js';

// Redis palsu in-memory: cukup incr/expire/get/del.
function fakeRedis() {
  const store = new Map<string, number>();
  const ttl = new Map<string, number>();
  return {
    store, ttl,
    async incr(k: string) { const v = (store.get(k) ?? 0) + 1; store.set(k, v); return v; },
    async expire(k: string, s: number) { ttl.set(k, s); return 1; },
    async get(k: string) { const v = store.get(k); return v === undefined ? null : String(v); },
    async del(k: string) { store.delete(k); ttl.delete(k); return 1; },
  };
}

test('belum terkunci saat nol percobaan', async () => {
  assert.equal(await isPinLocked(fakeRedis(), 'u1'), false);
});

test('terkunci setelah MAX_PIN_ATTEMPTS percobaan gagal', async () => {
  const r = fakeRedis();
  for (let i = 0; i < MAX_PIN_ATTEMPTS; i++) await registerFailedPin(r, 'u1');
  assert.equal(await isPinLocked(r, 'u1'), true);
});

test('belum terkunci satu percobaan sebelum batas', async () => {
  const r = fakeRedis();
  for (let i = 0; i < MAX_PIN_ATTEMPTS - 1; i++) await registerFailedPin(r, 'u1');
  assert.equal(await isPinLocked(r, 'u1'), false);
});

test('kunci selalu diberi TTL — lockout tidak boleh permanen', async () => {
  const r = fakeRedis();
  await registerFailedPin(r, 'u1');
  assert.equal(r.ttl.size, 1, 'tanpa EXPIRE, kasir terkunci selamanya sampai Redis dibersihkan manual');
});

test('lockout terpisah per user', async () => {
  const r = fakeRedis();
  for (let i = 0; i < MAX_PIN_ATTEMPTS; i++) await registerFailedPin(r, 'u1');
  assert.equal(await isPinLocked(r, 'u2'), false, 'satu kasir salah PIN tidak boleh mengunci kasir lain');
});

test('PIN benar menghapus penghitung', async () => {
  const r = fakeRedis();
  for (let i = 0; i < MAX_PIN_ATTEMPTS; i++) await registerFailedPin(r, 'u1');
  await clearPinAttempts(r, 'u1');
  assert.equal(await isPinLocked(r, 'u1'), false);
});
