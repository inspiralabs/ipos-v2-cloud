import test from 'node:test';
import assert from 'node:assert/strict';
import { createRedis } from './redis.js';

// lazyConnect: true di createRedis berarti tidak ada koneksi dibuka sampai dipakai,
// jadi test ini tidak butuh Redis hidup. Tetap dipanggil disconnect() supaya
// test runner tidak menggantung.
test('createRedis memasang listener error', () => {
  const redis = createRedis('redis://127.0.0.1:1');
  try {
    assert.equal(redis.listenerCount('error'), 1);
  } finally {
    redis.disconnect();
  }
});

test('createRedis meneruskan error ke onError, bukan melempar', () => {
  const seen: Error[] = [];
  const redis = createRedis('redis://127.0.0.1:1', (err) => seen.push(err));
  try {
    redis.emit('error', new Error('ECONNREFUSED'));
    assert.equal(seen.length, 1);
    assert.match(seen[0].message, /ECONNREFUSED/);
  } finally {
    redis.disconnect();
  }
});
