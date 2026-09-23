import test from 'node:test';
import assert from 'node:assert/strict';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, fakeDb } from '../test-support.js';
import { tenantGuard, requireTenantRole } from './admin-guard.js';

const TENANT = '11111111-1111-1111-1111-111111111111';

// Route contoh minimal — cukup untuk menguji preHandler tanpa perlu route asli.
async function pingRoutes(app: FastifyInstance) {
  app.get('/ping-guard', { preHandler: tenantGuard }, async () => ({ ok: true }));
  app.get('/ping-owner', { preHandler: requireTenantRole('owner') }, async () => ({ ok: true }));
}

async function build(tenantRow: Record<string, unknown> | null) {
  const db = fakeDb({ tenants: tenantRow ? [tenantRow] : [] });
  const app = await buildTestApp({ db, routes: [[pingRoutes, '/api/v1/tenants']] });
  return { app, db };
}

function tokenFor(app: FastifyInstance, over: Record<string, unknown> = {}) {
  return app.jwt.sign({ sub: 'u1', tenant_id: TENANT, role: 'cashier', ...over });
}

test('tenantGuard menolak tanpa tenant_id di token', async () => {
  const { app } = await build({ id: TENANT, status: 'active', deleted_at: null });
  const token = app.jwt.sign({ sub: 'u1', tenant_id: null, role: 'owner' });
  const res = await app.inject({ method: 'GET', url: '/api/v1/tenants/ping-guard', headers: { authorization: `Bearer ${token}` } });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().code, 'NOT_A_TENANT_USER');
  await app.close();
});

test('tenantGuard menolak tenant suspended', async () => {
  const { app } = await build({ id: TENANT, status: 'suspended', deleted_at: null });
  const res = await app.inject({ method: 'GET', url: '/api/v1/tenants/ping-guard', headers: { authorization: `Bearer ${tokenFor(app)}` } });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().code, 'TENANT_SUSPENDED');
  await app.close();
});

test('tenantGuard menolak tenant expired', async () => {
  const { app } = await build({ id: TENANT, status: 'expired', deleted_at: null });
  const res = await app.inject({ method: 'GET', url: '/api/v1/tenants/ping-guard', headers: { authorization: `Bearer ${tokenFor(app)}` } });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().code, 'TENANT_EXPIRED');
  await app.close();
});

test('tenantGuard menolak tenant soft-deleted', async () => {
  const { app } = await build({ id: TENANT, status: 'active', deleted_at: new Date() });
  const res = await app.inject({ method: 'GET', url: '/api/v1/tenants/ping-guard', headers: { authorization: `Bearer ${tokenFor(app)}` } });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().code, 'TENANT_DELETED');
  await app.close();
});

test('tenantGuard meloloskan tenant aktif', async () => {
  const { app } = await build({ id: TENANT, status: 'active', deleted_at: null });
  const res = await app.inject({ method: 'GET', url: '/api/v1/tenants/ping-guard', headers: { authorization: `Bearer ${tokenFor(app)}` } });
  assert.equal(res.statusCode, 200);
  await app.close();
});

test('requireTenantRole menolak role yang tidak diizinkan — akar temuan A', async () => {
  const { app } = await build({ id: TENANT, status: 'active', deleted_at: null });
  const res = await app.inject({
    method: 'GET', url: '/api/v1/tenants/ping-owner',
    headers: { authorization: `Bearer ${tokenFor(app, { role: 'cashier' })}` },
  });
  assert.equal(res.statusCode, 403, 'kasir tidak boleh lolos route yang dibatasi ke owner');
  assert.equal(res.json().code, 'FORBIDDEN_ROLE');
  await app.close();
});

test('requireTenantRole meloloskan role yang diizinkan', async () => {
  const { app } = await build({ id: TENANT, status: 'active', deleted_at: null });
  const res = await app.inject({
    method: 'GET', url: '/api/v1/tenants/ping-owner',
    headers: { authorization: `Bearer ${tokenFor(app, { role: 'owner' })}` },
  });
  assert.equal(res.statusCode, 200);
  await app.close();
});
