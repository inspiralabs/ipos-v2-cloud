import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTestApp, fakeDb } from '../../test-support.js';
import { tenantUsersRoutes } from './users.js';

const TENANT = '22222222-2222-2222-2222-222222222222';
const OWNER_ID = '33333333-3333-3333-3333-333333333333';
const CASHIER_ID = '44444444-4444-4444-4444-444444444444';
const INACTIVE_ID = '55555555-5555-5555-5555-555555555555';

async function build() {
  const db = fakeDb({
    tenants: [{ id: TENANT, status: 'active', deleted_at: null }],
    users: [
      { id: OWNER_ID, tenant_id: TENANT, name: 'Owner', email: 'owner@toko.id', role: 'owner', is_active: true },
      { id: CASHIER_ID, tenant_id: TENANT, name: 'Kasir', email: 'kasir@toko.id', role: 'cashier', is_active: true },
      { id: INACTIVE_ID, tenant_id: TENANT, name: 'Mantan Staf', email: 'mantan@toko.id', role: 'manager', is_active: false },
    ],
  });
  const app = await buildTestApp({ db, routes: [[tenantUsersRoutes, '/api/v1/tenants/users']] });
  const asCashier = app.jwt.sign({ sub: CASHIER_ID, tenant_id: TENANT, role: 'cashier' });
  const asOwner = app.jwt.sign({ sub: OWNER_ID, tenant_id: TENANT, role: 'owner' });
  return { app, db, asCashier, asOwner };
}

// GET / harus tetap terbuka untuk semua role (kiosk absensi memakainya sebagai name
// picker — lihat komentar di routes/tenant/attendance.ts), tapi proyeksinya role-aware:
// non-owner cuma dapat {id,name,role} milik staf AKTIF non-owner. Ini yang benar-benar
// menutup akar temuan A (kasir GET → dapat owner_id/email), bukan 403 di seluruh router.
test('kasir BISA melihat daftar staf dengan proyeksi minimal, tanpa baris owner/inactive — akar temuan A tetap tertutup', async () => {
  const { app, asCashier } = await build();
  const res = await app.inject({ method: 'GET', url: '/api/v1/tenants/users', headers: { authorization: `Bearer ${asCashier}` } });
  assert.equal(res.statusCode, 200);
  const { data } = res.json();
  assert.equal(data.length, 1, 'cuma baris kasir aktif non-owner yang boleh terlihat');
  assert.deepEqual(Object.keys(data[0]).sort(), ['id', 'name', 'role']);
  assert.equal(data[0].id, CASHIER_ID);
  assert.ok(!data.some((u: any) => u.role === 'owner'), 'tidak boleh ada baris owner di respons kasir');
  assert.ok(!data.some((u: any) => u.id === INACTIVE_ID), 'staf nonaktif tidak boleh ikut muncul di name-picker kiosk');
  await app.close();
});

test('owner BISA melihat daftar staf dengan proyeksi penuh, termasuk baris dirinya sendiri', async () => {
  const { app, asOwner } = await build();
  const res = await app.inject({ method: 'GET', url: '/api/v1/tenants/users', headers: { authorization: `Bearer ${asOwner}` } });
  assert.equal(res.statusCode, 200);
  const { data } = res.json();
  assert.equal(data.length, 3, 'owner tetap melihat semua baris, termasuk yang nonaktif');
  const ownerRow = data.find((u: any) => u.id === OWNER_ID);
  assert.ok(ownerRow, 'owner harus melihat baris dirinya sendiri, tidak dikecualikan');
  assert.equal(ownerRow.email, 'owner@toko.id', 'proyeksi penuh tetap menyertakan email, tidak dipangkas');
  await app.close();
});

test('kasir TIDAK BISA membuat akun manager', async () => {
  const { app, asCashier } = await build();
  const res = await app.inject({
    method: 'POST', url: '/api/v1/tenants/users', headers: { authorization: `Bearer ${asCashier}` },
    payload: { name: 'Manager Baru', email: 'm@toko.id', password: 'rahasia123', role: 'manager' },
  });
  assert.equal(res.statusCode, 403, 'kasir tidak boleh eskalasi diri sendiri jadi setara manager/owner');
  await app.close();
});

test('kasir TIDAK BISA mengganti PIN owner', async () => {
  const { app, asCashier } = await build();
  const res = await app.inject({
    method: 'PATCH', url: `/api/v1/tenants/users/${OWNER_ID}/pin`, headers: { authorization: `Bearer ${asCashier}` },
    payload: { pin: '9999' },
  });
  assert.equal(res.statusCode, 403);
  await app.close();
});

test('kasir TIDAK BISA menonaktifkan owner', async () => {
  const { app, asCashier } = await build();
  const res = await app.inject({
    method: 'PATCH', url: `/api/v1/tenants/users/${OWNER_ID}/deactivate`, headers: { authorization: `Bearer ${asCashier}` },
  });
  assert.equal(res.statusCode, 403);
  await app.close();
});

test('owner BISA mengganti PIN kasir', async () => {
  const { app, asOwner } = await build();
  const res = await app.inject({
    method: 'PATCH', url: `/api/v1/tenants/users/${CASHIER_ID}/pin`, headers: { authorization: `Bearer ${asOwner}` },
    payload: { pin: '1234' },
  });
  assert.equal(res.statusCode, 200);
  await app.close();
});

// Finding 2: deactivate sebelumnya tidak punya guard sama sekali (bukan cuma kurang
// ne(role,'owner') di WHERE) — owner bisa menonaktifkan dirinya sendiri lewat endpoint
// ini dan mengunci tenant (auth-service menolak login is_active=false, tanpa jalan
// pemulihan). Guard "target = role owner" (ne(users.role,'owner') di WHERE, sama seperti
// pin/reset-password/delete) tidak bisa diuji lewat fakeDb: update().where().returning()
// di test-support.ts mengabaikan kondisi WHERE dan SELALU mensintesis baris sukses,
// jadi kasus "target adalah owner lain" / "id tidak ditemukan" tidak bisa direproduksi
// lewat fake ini — sudah begitu juga untuk pin & reset-password yang sudah lama punya
// guard yang sama tanpa test untuk cabang itu. Yang testable & di-test di sini: guard
// self-target (murni logika JS, jalan sebelum DB dipanggil) dan jalur sukses normal.
test('owner TIDAK BISA menonaktifkan akun sendiri', async () => {
  const { app, asOwner } = await build();
  const res = await app.inject({
    method: 'PATCH', url: `/api/v1/tenants/users/${OWNER_ID}/deactivate`, headers: { authorization: `Bearer ${asOwner}` },
  });
  assert.equal(res.statusCode, 400);
  assert.equal(res.json().code, 'CANNOT_DEACTIVATE_SELF');
  await app.close();
});

test('owner BISA menonaktifkan kasir (target valid, bukan dirinya sendiri)', async () => {
  const { app, asOwner } = await build();
  const res = await app.inject({
    method: 'PATCH', url: `/api/v1/tenants/users/${CASHIER_ID}/deactivate`, headers: { authorization: `Bearer ${asOwner}` },
  });
  assert.equal(res.statusCode, 200);
  await app.close();
});
