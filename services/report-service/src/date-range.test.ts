import { parseRange } from './date-range.js';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${msg}`);
  }
}

// Rentang 1 hari (2026-07-16..2026-07-16): previous period harus 2026-07-15 (sehari sebelumnya, span sama).
{
  const { fromDate, toDate, prevFrom, prevTo } = parseRange('2026-07-16', '2026-07-16');
  assert(fromDate.toISOString() === '2026-07-16T00:00:00.000Z', 'single-day fromDate benar');
  assert(toDate.toISOString() === '2026-07-16T23:59:59.000Z', 'single-day toDate benar');
  assert(prevTo.toISOString() === '2026-07-15T23:59:59.000Z', 'single-day prevTo = 1 detik sebelum fromDate');
  assert(prevFrom.toISOString() === '2026-07-15T00:00:00.000Z', 'single-day prevFrom = span sama mundur 1 hari');
}

// Rentang 7 hari (mingguan): previous period harus 7 hari sebelumnya, span identik.
{
  const { fromDate, toDate, prevFrom, prevTo } = parseRange('2026-07-10', '2026-07-16');
  const spanMs = toDate.getTime() - fromDate.getTime();
  const prevSpanMs = prevTo.getTime() - prevFrom.getTime();
  assert(spanMs === prevSpanMs, 'span previous period sama persis dengan span current period');
  assert(prevTo.toISOString() === '2026-07-09T23:59:59.000Z', 'weekly prevTo = 1 detik sebelum fromDate');
  assert(prevFrom.toISOString() === '2026-07-03T00:00:00.000Z', 'weekly prevFrom mundur 7 hari dari fromDate');
}

// Lintas bulan (30 hari, meliputi pergantian bulan Juli->Agustus): pastikan tidak ada off-by-one di boundary bulan.
{
  const { prevFrom, prevTo } = parseRange('2026-08-01', '2026-08-30');
  assert(prevTo.toISOString() === '2026-07-31T23:59:59.000Z', 'month-boundary prevTo jatuh di akhir bulan sebelumnya');
  assert(prevFrom.toISOString() === '2026-07-02T00:00:00.000Z', 'month-boundary prevFrom mundur 30 hari penuh');
}

if (process.exitCode) {
  console.error('Ada assertion gagal.');
} else {
  console.log('Semua assertion lolos.');
}
