import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTestApp, fakeDb } from '../../test-support.js';
import { tenantLoyaltyRoutes } from './loyalty.js';

const TENANT = '77777777-7777-7777-7777-777777777777';
const MEMBER_ID = '99999999-9999-9999-9999-999999999999';

// `fakeDb` (Task 2) tidak mengevaluasi kondisi WHERE — SELECT mengembalikan seluruh isi
// `tables[nama]` apa adanya. Untuk mensimulasikan "member tidak ditemukan untuk tenant
// ini" secara jujur, gunakan array KOSONG (bukan baris dengan tenant_id berbeda — fake
// akan tetap mengembalikannya seolah ketemu, membuat test menyesatkan).
function build(memberExists: boolean, points_balance = 100) {
  const db = fakeDb({
    tenants: [{ id: TENANT, status: 'active', deleted_at: null }],
    loyalty_members: memberExists ? [{ id: MEMBER_ID, tenant_id: TENANT, name: 'Budi', phone: '0800', points_balance }] : [],
    loyalty_point_logs: [],
    tenant_feature_overrides: [],
  });
  return db;
}

async function buildApp(db: any) {
  const app = await buildTestApp({ db, routes: [[tenantLoyaltyRoutes, '/api/v1/tenants/loyalty']] });
  const token = app.jwt.sign({ sub: 'cashier-1', tenant_id: TENANT, role: 'cashier', plan: 'resto_pro' });
  return { app, token };
}

test('points/earn TIDAK menulis log kalau lookup member tidak ketemu', async () => {
  const db = build(false); // simulasikan member_id yang tidak ditemukan untuk tenant ini
  const { app, token } = await buildApp(db);
  const res = await app.inject({
    method: 'POST', url: '/api/v1/tenants/loyalty/points/earn', headers: { authorization: `Bearer ${token}` },
    payload: { member_id: MEMBER_ID, order_id: '00000000-0000-0000-0000-000000000000', order_total: 50000 },
  });
  assert.equal(res.statusCode, 404, 'member tidak ketemu harus ditolak SEBELUM log ditulis');
  const log = db._writes.find((w: any) => w.op === 'insert' && w.table === 'loyalty_point_logs');
  assert.equal(log, undefined, 'sebelumnya log tetap tertulis walau member tidak pernah diverifikasi ketemu');
  await app.close();
});

test('points/earn menulis log HANYA setelah member terverifikasi ketemu', async () => {
  const db = build(true);
  const { app, token } = await buildApp(db);
  const res = await app.inject({
    method: 'POST', url: '/api/v1/tenants/loyalty/points/earn', headers: { authorization: `Bearer ${token}` },
    payload: { member_id: MEMBER_ID, order_id: '00000000-0000-0000-0000-000000000000', order_total: 50000 },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().points_earned, 5);
  const log = db._writes.find((w: any) => w.op === 'insert' && w.table === 'loyalty_point_logs');
  assert.ok(log, 'log harus tertulis untuk member yang terverifikasi ketemu');
  await app.close();
});

test('points/redeem tetap berfungsi normal setelah ditambah transaksi + filter tenant_id', async () => {
  const db = build(true, 100);
  const { app, token } = await buildApp(db);
  const res = await app.inject({
    method: 'POST', url: '/api/v1/tenants/loyalty/points/redeem', headers: { authorization: `Bearer ${token}` },
    payload: { member_id: MEMBER_ID, points: 30 },
  });
  assert.equal(res.statusCode, 200);
  const balanceUpdate = db._writes.find((w: any) => w.op === 'update' && w.table === 'loyalty_members');
  assert.ok(balanceUpdate, 'UPDATE saldo harus tetap terjadi lewat db.transaction, bukan cuma di-throw');
  await app.close();
});

test('points/redeem menolak kalau lookup member tidak ketemu', async () => {
  const db = build(false, 100);
  const { app, token } = await buildApp(db);
  const res = await app.inject({
    method: 'POST', url: '/api/v1/tenants/loyalty/points/redeem', headers: { authorization: `Bearer ${token}` },
    payload: { member_id: MEMBER_ID, points: 30 },
  });
  assert.equal(res.statusCode, 404);
  await app.close();
});
