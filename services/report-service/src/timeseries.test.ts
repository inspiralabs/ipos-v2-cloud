import test from 'node:test';
import assert from 'node:assert/strict';
import { bucketLabel } from './timeseries.js';

const t = new Date('2026-07-16T14:32:00Z');

test('bucket hour', () => assert.equal(bucketLabel(t, 'hour'), '2026-07-16T14:00'));
test('bucket day', () => assert.equal(bucketLabel(t, 'day'), '2026-07-16'));
test('bucket month', () => assert.equal(bucketLabel(t, 'month'), '2026-07'));
test('bucket week di awal tahun', () =>
  assert.equal(bucketLabel(new Date('2026-01-01T00:00:00Z'), 'week'), '2026-W01'));
