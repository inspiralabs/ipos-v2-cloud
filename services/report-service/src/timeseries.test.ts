import { bucketLabel } from './timeseries.js';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${msg}`);
  }
}

assert(bucketLabel(new Date('2026-07-16T14:32:00Z'), 'hour') === '2026-07-16T14:00', 'hour bucket benar');
assert(bucketLabel(new Date('2026-07-16T14:32:00Z'), 'day') === '2026-07-16', 'day bucket benar');
assert(bucketLabel(new Date('2026-07-16T14:32:00Z'), 'month') === '2026-07', 'month bucket benar');
assert(bucketLabel(new Date('2026-01-01T00:00:00Z'), 'week') === '2026-W01', 'week bucket awal tahun benar');

if (process.exitCode) {
  console.error('Ada assertion gagal.');
} else {
  console.log('Semua assertion lolos.');
}
