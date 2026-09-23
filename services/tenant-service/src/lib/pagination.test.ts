import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePagination } from './pagination.js';

test('default page=1, limit=20 kalau query kosong', () => {
  assert.deepEqual(parsePagination({}), { page: 1, limit: 20, offset: 0 });
});

test('page & limit dari query dipakai apa adanya kalau wajar', () => {
  assert.deepEqual(parsePagination({ page: '3', limit: '10' }), { page: 3, limit: 10, offset: 20 });
});

test('page negatif/nol diklem ke 1', () => {
  assert.equal(parsePagination({ page: '-5' }).page, 1);
  assert.equal(parsePagination({ page: '0' }).page, 1);
});

test('limit di atas 100 diklem ke 100 — cegah tarik seluruh tabel', () => {
  assert.equal(parsePagination({ limit: '999999' }).limit, 100);
});

test('limit negatif/nol diklem ke minimal 1', () => {
  assert.equal(parsePagination({ limit: '-1' }).limit, 1);
  assert.equal(parsePagination({ limit: '0' }).limit, 1);
});

test('query bukan angka jatuh ke default, bukan NaN', () => {
  assert.deepEqual(parsePagination({ page: 'abc', limit: 'xyz' }), { page: 1, limit: 20, offset: 0 });
});

test('defaultLimit bisa dioverride (audit.ts pakai 50)', () => {
  assert.equal(parsePagination({}, 50).limit, 50);
});
