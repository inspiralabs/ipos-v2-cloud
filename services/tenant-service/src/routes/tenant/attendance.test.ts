import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTestApp, fakeDb } from '../../test-support.js';
import { tenantAttendanceRoutes } from './attendance.js';

const TENANT = '11111111-1111-1111-1111-111111111111';
const STAFF_ID = '22222222-2222-2222-2222-222222222222';

// `fakeDb` tidak mengevaluasi kondisi WHERE — SELECT mengembalikan seluruh isi
// `tables[nama]` apa adanya. Untuk mensimulasikan "user_id bukan staf tenant ini"
// secara jujur, gunakan array KOSONG (bukan baris dengan tenant_id berbeda).
function build(staffExists: boolean) {
  return fakeDb({
    tenants: [{ id: TENANT, status: 'active', deleted_at: null }],
    users: staffExists ? [{ id: STAFF_ID, tenant_id: TENANT, name: 'Budi' }] : [],
    attendance_logs: [],
  });
}

async function buildApp(db: any) {
  const app = await buildTestApp({ db, routes: [[tenantAttendanceRoutes, '/api/v1/tenants/attendance']] });
  const token = app.jwt.sign({ sub: 'cashier-1', tenant_id: TENANT, role: 'cashier', plan: 'resto_pro' });
  return { app, token };
}

test('POST /clock-in menolak user_id yang bukan staf tenant ini', async () => {
  const db = build(false);
  const { app, token } = await buildApp(db);
  const res = await app.inject({
    method: 'POST', url: '/api/v1/tenants/attendance/clock-in', headers: { authorization: `Bearer ${token}` },
    payload: { user_id: STAFF_ID },
  });
  assert.equal(res.statusCode, 404, 'user_id yang tidak terverifikasi milik tenant ini harus ditolak SEBELUM menulis attendance_logs');
  const insert = db._writes.find((w: any) => w.op === 'insert' && w.table === 'attendance_logs');
  assert.equal(insert, undefined, 'sebelumnya baris absensi tetap tertulis untuk user_id sembarang tanpa verifikasi');
  await app.close();
});

test('POST /clock-in berhasil untuk staf yang terverifikasi milik tenant', async () => {
  const db = build(true);
  const { app, token } = await buildApp(db);
  const res = await app.inject({
    method: 'POST', url: '/api/v1/tenants/attendance/clock-in', headers: { authorization: `Bearer ${token}` },
    payload: { user_id: STAFF_ID },
  });
  assert.equal(res.statusCode, 201);
  const insert = db._writes.find((w: any) => w.op === 'insert' && w.table === 'attendance_logs');
  assert.ok(insert, 'staf yang terverifikasi harus tetap bisa clock-in seperti biasa');
  await app.close();
});

test('POST /clock-out menolak user_id yang bukan staf tenant ini', async () => {
  const db = build(false);
  const { app, token } = await buildApp(db);
  const res = await app.inject({
    method: 'POST', url: '/api/v1/tenants/attendance/clock-out', headers: { authorization: `Bearer ${token}` },
    payload: { user_id: STAFF_ID },
  });
  assert.equal(res.statusCode, 404, 'user_id yang tidak terverifikasi milik tenant ini harus ditolak SEBELUM meng-update attendance_logs');
  const update = db._writes.find((w: any) => w.op === 'update' && w.table === 'attendance_logs');
  assert.equal(update, undefined, 'sebelumnya UPDATE tetap dicoba untuk user_id sembarang tanpa verifikasi');
  await app.close();
});
