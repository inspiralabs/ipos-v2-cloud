import test from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from './db.js';

// Connection string sengaja menunjuk port mati — createDb tidak connect (Pool lazy),
// jadi test ini tidak butuh Postgres hidup.
const DEAD_URL = 'postgresql://nobody:nobody@127.0.0.1:1/none';

test('createDb memasang listener error di pool', () => {
  const db = createDb(DEAD_URL) as unknown as { $client: { listenerCount(e: string): number } };
  assert.equal(db.$client.listenerCount('error'), 1, 'pool tanpa listener error = proses mati saat koneksi idle putus');
});

test('createDb meneruskan error pool ke onError, bukan melempar', () => {
  const seen: Error[] = [];
  const db = createDb(DEAD_URL, (err) => seen.push(err)) as unknown as {
    $client: { emit(e: string, err: Error): void };
  };
  db.$client.emit('error', new Error('connection terminated unexpectedly'));
  assert.equal(seen.length, 1);
  assert.match(seen[0].message, /connection terminated/);
});
