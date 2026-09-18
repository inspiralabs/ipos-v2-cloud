import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRange } from './date-range.js';

test('rentang 1 hari: previous period = sehari sebelumnya, span sama', () => {
  const { fromDate, toDate, prevFrom, prevTo } = parseRange('2026-07-16', '2026-07-16');
  assert.equal(fromDate.toISOString(), '2026-07-16T00:00:00.000Z');
  assert.equal(toDate.toISOString(), '2026-07-16T23:59:59.000Z');
  assert.equal(prevTo.toISOString(), '2026-07-15T23:59:59.000Z', 'prevTo = 1 detik sebelum fromDate');
  assert.equal(prevFrom.toISOString(), '2026-07-15T00:00:00.000Z', 'prevFrom = span sama mundur 1 hari');
});

test('rentang 7 hari: previous period mundur 7 hari, span identik', () => {
  const { fromDate, toDate, prevFrom, prevTo } = parseRange('2026-07-10', '2026-07-16');
  assert.equal(
    toDate.getTime() - fromDate.getTime(),
    prevTo.getTime() - prevFrom.getTime(),
    'span previous period sama persis dengan span current period'
  );
  assert.equal(prevTo.toISOString(), '2026-07-09T23:59:59.000Z');
  assert.equal(prevFrom.toISOString(), '2026-07-03T00:00:00.000Z');
});

test('lintas bulan: tidak ada off-by-one di boundary bulan', () => {
  const { prevFrom, prevTo } = parseRange('2026-08-01', '2026-08-30');
  assert.equal(prevTo.toISOString(), '2026-07-31T23:59:59.000Z', 'prevTo jatuh di akhir bulan sebelumnya');
  assert.equal(prevFrom.toISOString(), '2026-07-02T00:00:00.000Z', 'prevFrom mundur 30 hari penuh');
});
