# Modul 3 — tenant-service: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tutup eskalasi privilese kasir → owner (temuan A) dengan membuat `tenantGuard` mengenal role dan status tenant, perbaiki integritas pembuatan tenant (`owner_id` + transaksi), klem `page`/`limit`, perbaiki kebocoran/race di poin loyalty, dan hapus duplikasi soft-delete/restore/bulk-delete.

**Architecture:** Akar temuan A adalah satu fungsi: `tenantGuard` di `middleware/admin-guard.ts` cuma memeriksa `tenant_id` ada, tidak pernah memeriksa role maupun status tenant. Modul ini menambah `requireTenantRole(...roles)` di atas `tenantGuard` yang sudah ada (dipakai router yang perlu dibatasi ke `owner`), dan membuat `tenantGuard` sendiri menolak tenant `suspended`/`expired`/`deleted` — dipakai **otomatis** oleh semua route yang sudah memasangnya (attendance, branches, customers, loyalty, me, users), bukan cuma dua file yang disentuh modul ini. Untuk itu, `resolveTenantAccess` dan `buildErrorHandler` yang sudah ada di `auth-service` (Modul 2) dipindah ke `packages/shared` lebih dulu (Task 1) supaya tenant-service memakai logika yang **sama persis**, bukan menyalinnya — auth-service tetap jalan tanpa perubahan perilaku lewat re-export tipis, sama seperti pola `PLAN_FEATURES` di Modul 1 Task 4.

**Tech Stack:** Fastify 5, `@fastify/jwt` 10, `@fastify/multipart` 9, bcryptjs 2, Zod 3, Drizzle ORM 0.36, `node:test` + `tsx`, pnpm workspace. Tidak ada `@fastify/rate-limit`/`@fastify/cookie` di service ini — tidak dibutuhkan modul ini.

**Spec:** [docs/audit-fase-1.md](../../audit-fase-1.md) — bagian A (eskalasi privilese kasir → owner) dan L (tenant-service — selain eskalasi role).

## Global Constraints

- **Modul 0, 1, dan 2 harus sudah selesai** (sudah, di branch ini) — Task 1 memindahkan kode dari `services/auth-service/src/token.ts` dan `error-handler.ts` yang dibuat Modul 2.
- Test memakai `node:test` + `node:assert/strict`, dijalankan `tsx --test "src/**/*.test.ts"`. **Tidak boleh menambah framework test.**
- Import antar-file memakai ekstensi `.js` (NodeNext).
- Pesan error yang dikirim ke klien tetap **Bahasa Indonesia**.
- Jangan mengubah `attendance.ts`, `branches.ts`, `customers.ts` — file-file itu tetap memakai `tenantGuard` biasa (peran apa pun boleh mengakses), cuma otomatis dapat pengecekan status tenant yang baru dari Task 2. Membatasi peran di file-file itu di luar cakupan modul ini.
- Pola `(app as any).db`, `(request as any).user`, dll yang sudah dipakai di seluruh service ini **dipertahankan** — modul ini tidak mengetatkan tipe yang sudah longgar di tempat lain.
- Setelah setiap task: `pnpm -r type-check` bersih. Mulai Task 2, `pnpm --filter tenant-service test` juga harus lulus.

---

### Task 1: Pindahkan `resolveTenantAccess` & `buildErrorHandler` ke `packages/shared`

Keduanya sudah ada dan teruji di `auth-service` (Modul 2 Task 2 & 7). tenant-service butuh logika **identik** untuk menolak tenant `suspended`/`expired`/`deleted` (Task 2) dan untuk error handler yang tidak membocorkan pesan Postgres mentah (temuan L: "error.message mentah dikirim ke klien"). Menyalin ulang berarti dua tempat bisa mulai berbeda; memindahkan ke `packages/shared` dan membuat `auth-service` me-re-export menutup itu — persis pola `PLAN_FEATURES` di Modul 1 Task 4.

**Files:**
- Create: `packages/shared/src/tenant-access.ts`
- Create: `packages/shared/src/tenant-access.test.ts`
- Create: `packages/shared/src/error-handler.ts`
- Create: `packages/shared/src/error-handler.test.ts`
- Modify: `packages/shared/src/index.ts` (tambah 2 barrel export)
- Modify: `services/auth-service/src/token.ts` (hapus definisi lokal, re-export)
- Delete: `services/auth-service/src/error-handler.ts`
- Delete: `services/auth-service/src/error-handler.test.ts`
- Modify: `services/auth-service/src/index.ts:8` (import `buildErrorHandler` dari `@ipos-cloud/shared`)
- Modify: `services/auth-service/src/token.test.ts` (hapus 6 test yang pindah, sisakan yang auth-specific)

**Interfaces:**
- Consumes: `Db` dari `./db.js` (sudah ada di `packages/shared`), `tenants` dari `@ipos-cloud/drizzle-schema`.
- Produces dari `@ipos-cloud/shared` (barrel utama — tidak perlu subpath, keduanya cuma dipakai backend):
  - `resolveTenantAccess(db: Db, tenantId: string | null): Promise<TenantAccess>` — tanda tangan **tidak berubah**.
  - `type TenantAccess`, `TENANT_BLOCKED_MESSAGE` — **tidak berubah**.
  - `buildErrorHandler(log: { error: (obj: unknown) => void }): (error, request, reply) => void` — **tidak berubah**.

- [ ] **Step 1: Buat `tenant-access.ts` di packages/shared**

Buat `packages/shared/src/tenant-access.ts` — isinya dipindah **apa adanya** dari `services/auth-service/src/token.ts` (baris 16-51 versi saat ini: tipe `TenantAccess`, fungsi `resolveTenantAccess`, konstanta `TENANT_BLOCKED_MESSAGE`):

```ts
import { eq } from 'drizzle-orm';
import { tenants } from '@ipos-cloud/drizzle-schema';
import type { Db } from './db.js';

export type TenantAccess =
  | { ok: true; plan: string | null }
  | { ok: false; reason: 'SUSPENDED' | 'EXPIRED' | 'DELETED' | 'NOT_FOUND' };

/**
 * Satu tempat yang memutuskan boleh-tidaknya tenant mengakses API — dipakai auth-service
 * (menerbitkan token) DAN tenant-service (tenantGuard, tiap request). Sebelumnya lookup
 * plan/status disalin terpisah di login/refresh/pin-login dan TIDAK SATU PUN memeriksa
 * status, sehingga tenant suspended/expired tetap bisa bertransaksi.
 */
export async function resolveTenantAccess(db: Db, tenantId: string | null): Promise<TenantAccess> {
  if (!tenantId) return { ok: true, plan: null }; // akun admin InspiraLabs, bukan user tenant

  const [tenant] = await (db as any)
    .select({
      plan_code: tenants.plan_code,
      status: tenants.status,
      deleted_at: tenants.deleted_at,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .limit(1);

  if (!tenant) return { ok: false, reason: 'NOT_FOUND' };
  if (tenant.deleted_at) return { ok: false, reason: 'DELETED' };
  if (tenant.status === 'suspended') return { ok: false, reason: 'SUSPENDED' };
  if (tenant.status === 'expired') return { ok: false, reason: 'EXPIRED' };
  return { ok: true, plan: tenant.plan_code ?? null };
}

export const TENANT_BLOCKED_MESSAGE: Record<'SUSPENDED' | 'EXPIRED' | 'DELETED' | 'NOT_FOUND', string> = {
  SUSPENDED: 'Akun toko ini sedang ditangguhkan. Hubungi admin InspiraPOS.',
  EXPIRED: 'Masa berlangganan toko ini sudah berakhir. Perpanjang untuk masuk lagi.',
  DELETED: 'Akun toko ini sudah tidak aktif.',
  NOT_FOUND: 'Akun toko ini sudah tidak aktif.',
};
```

- [ ] **Step 2: Tulis test (dipindah dari `token.test.ts`)**

Buat `packages/shared/src/tenant-access.test.ts` — 6 test ini dipindah **apa adanya** dari `services/auth-service/src/token.test.ts` (test "tenant aktif lolos", "tenant trial lolos", "tenant suspended DITOLAK", "tenant expired DITOLAK", "tenant soft-deleted DITOLAK", "akun admin InspiraLabs"), dengan `fakeDb` lokal minimal (packages/shared tidak boleh bergantung pada `test-support.ts` milik `auth-service`):

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTenantAccess } from './tenant-access.js';

const TENANT = '66666666-6666-6666-6666-666666666666';

function fakeDb(tenantRow: Record<string, unknown> | null) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => (tenantRow ? [tenantRow] : []),
        }),
      }),
    }),
  } as any;
}

test('tenant aktif lolos dengan plan-nya', async () => {
  const db = fakeDb({ id: TENANT, plan_code: 'resto_pro', status: 'active', deleted_at: null });
  assert.deepEqual(await resolveTenantAccess(db, TENANT), { ok: true, plan: 'resto_pro' });
});

test('tenant trial lolos', async () => {
  const db = fakeDb({ id: TENANT, plan_code: 'umkm_lite', status: 'trial', deleted_at: null });
  assert.deepEqual(await resolveTenantAccess(db, TENANT), { ok: true, plan: 'umkm_lite' });
});

test('tenant suspended DITOLAK', async () => {
  const db = fakeDb({ id: TENANT, plan_code: 'resto_pro', status: 'suspended', deleted_at: null });
  assert.deepEqual(await resolveTenantAccess(db, TENANT), { ok: false, reason: 'SUSPENDED' });
});

test('tenant expired DITOLAK', async () => {
  const db = fakeDb({ id: TENANT, plan_code: 'resto_pro', status: 'expired', deleted_at: null });
  assert.deepEqual(await resolveTenantAccess(db, TENANT), { ok: false, reason: 'EXPIRED' });
});

test('tenant soft-deleted DITOLAK', async () => {
  const db = fakeDb({ id: TENANT, plan_code: 'resto_pro', status: 'active', deleted_at: new Date() });
  assert.deepEqual(await resolveTenantAccess(db, TENANT), { ok: false, reason: 'DELETED' });
});

test('akun admin InspiraLabs (tenant_id null) lolos tanpa plan', async () => {
  const db = fakeDb(null);
  assert.deepEqual(await resolveTenantAccess(db, null), { ok: true, plan: null });
});
```

Run: `cd packages/shared && pnpm exec tsx --test "src/tenant-access.test.ts"`
Expected: PASS 6/6.

- [ ] **Step 3: Pindahkan `error-handler.ts` apa adanya**

Buat `packages/shared/src/error-handler.ts` — isi identik dengan `services/auth-service/src/error-handler.ts` saat ini (tidak ada logika yang berubah):

```ts
import { ZodError } from 'zod';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

type Logger = { error: (obj: unknown) => void };

/**
 * Aturannya: klien hanya boleh melihat pesan yang MEMANG ditulis untuk dilihat klien.
 * - ZodError -> 400 + nama field yang salah (tanpa array issues mentah)
 * - 4xx yang kita lempar sendiri -> pesannya diteruskan
 * - sisanya (termasuk error Postgres) -> pesan generik; detailnya hanya ke log
 */
export function buildErrorHandler(log: Logger) {
  return function errorHandler(
    error: FastifyError & { statusCode?: number; code?: string },
    _request: FastifyRequest,
    reply: FastifyReply
  ) {
    log.error(error);

    if (error instanceof ZodError) {
      const fields = [...new Set(error.issues.map((i) => i.path.join('.')).filter(Boolean))];
      return reply.code(400).send({
        error: fields.length
          ? `Data tidak valid pada: ${fields.join(', ')}`
          : 'Data yang dikirim tidak valid.',
        code: 'VALIDATION_ERROR',
      });
    }

    const status = error.statusCode ?? 500;
    if (status >= 400 && status < 500) {
      return reply.code(status).send({ error: error.message, code: error.code || 'BAD_REQUEST' });
    }

    return reply.code(status).send({
      error: 'Terjadi kesalahan di server. Coba lagi beberapa saat lagi.',
      code: 'INTERNAL_ERROR',
    });
  };
}
```

Buat `packages/shared/src/error-handler.test.ts` — isi identik dengan `services/auth-service/src/error-handler.test.ts` saat ini (6 test: ZodError jadi 400, field disebut tanpa dump issues mentah, error tanpa statusCode jadi 500 generik, error 4xx meneruskan pesan, error 5xx disembunyikan, error tetap di-log lengkap). Salin apa adanya, cuma path import `./error-handler.js` tidak berubah karena filenya sekarang di direktori yang sama.

Run: `cd packages/shared && pnpm exec tsx --test "src/error-handler.test.ts"`
Expected: PASS 6/6.

- [ ] **Step 4: Tambahkan ke barrel export**

Di `packages/shared/src/index.ts`, tambahkan 2 baris:

```ts
export * from './tenant-access.js';
export * from './error-handler.js';
```

- [ ] **Step 5: `auth-service` konsumsi lewat re-export, bukan definisi lokal**

Ganti **seluruh isi** `services/auth-service/src/token.ts` — blok `TenantAccess`/`resolveTenantAccess`/`TENANT_BLOCKED_MESSAGE` (baris 16-51 versi saat ini) diganti re-export, sisanya (`ACCESS_TOKEN_TTL`, `hashToken`, `buildJwtPayload`) tetap seperti sekarang. Supaya 5 file yang sudah mengimpor dari `'../token.js'` (`login.ts`, `refresh.ts`, `pin-login.ts`, `impersonate.ts`) **tidak perlu diubah sama sekali**, semua nama yang mereka impor tetap tersedia dari file yang sama:

```ts
import crypto from 'node:crypto';
export { resolveTenantAccess, TENANT_BLOCKED_MESSAGE, type TenantAccess } from '@ipos-cloud/shared';

// Satu sumber untuk masa berlaku access token: dipakai opsi sign di index.ts DAN
// field expires_in di respons. Sebelumnya '15m' dan 900 ditulis terpisah, jadi
// mengubah salah satu membuat klien menjadwalkan refresh di waktu yang salah.
export const ACCESS_TOKEN_TTL = '15m';
export const ACCESS_TOKEN_TTL_SECONDS = 900;

export function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function buildJwtPayload(
  user: { id: string; role: string; tenant_id: string | null; outlet_id: string | null },
  plan: string | null,
  extra?: { impersonated_by?: string }
): Record<string, unknown> {
  return {
    sub: user.id,
    tenant_id: user.tenant_id ?? null,
    role: user.role,
    plan,
    outlet_id: user.outlet_id ?? null,
    ...(extra?.impersonated_by ? { impersonated_by: extra.impersonated_by } : {}),
  };
}
```

- [ ] **Step 6: Hapus salinan lokal di `error-handler.ts` dan wire ke shared**

Hapus `services/auth-service/src/error-handler.ts` dan `services/auth-service/src/error-handler.test.ts` (tesnya sudah pindah ke Step 3).

Di `services/auth-service/src/index.ts`, ganti baris 8:
```ts
import { createDb, createRedis, buildErrorHandler } from '@ipos-cloud/shared';
```
dan hapus baris `import { buildErrorHandler } from './error-handler.js';` yang lama (gabung ke import `@ipos-cloud/shared` yang sudah ada di baris 7).

- [ ] **Step 7: Bersihkan `token.test.ts` — hapus 6 test yang sudah pindah**

Di `services/auth-service/src/token.test.ts`, hapus 6 test `resolveTenantAccess` (tenant aktif/trial/suspended/expired/soft-deleted/akun admin) dan import `resolveTenantAccess` dari daftar import (baris 4-6 jadi `import { ACCESS_TOKEN_TTL_SECONDS, hashToken, buildJwtPayload } from './token.js';`). Sisakan 4 test: `hashToken deterministik`, `buildJwtPayload memuat semua klaim`, `buildJwtPayload menyertakan impersonated_by`, `ACCESS_TOKEN_TTL_SECONDS konsisten 900`.

- [ ] **Step 8: Verifikasi tidak ada regresi — seluruh workspace**

Run: `pnpm build:packages && pnpm -r type-check`
Expected: bersih di 14 project (tidak berubah dari sebelum Task 1).

Run: `pnpm --filter @ipos-cloud/shared test`
Expected: semua PASS, tidak ada FAIL (baseline 20 test + 6 tenant-access + 6 error-handler = 32).

Run: `pnpm --filter auth-service test`
Expected: semua PASS, tidak ada FAIL (baseline 52 test − 6 dipindah − 6 dipindah = 40).

- [ ] **Step 9: Commit**

```bash
git add packages/shared services/auth-service/src
git commit -m "refactor(shared): pindahkan resolveTenantAccess & buildErrorHandler ke packages/shared

Keduanya dipakai identik oleh tenant-service (Modul 3) untuk menolak tenant
suspended/expired/deleted di tenantGuard dan untuk error handler yang tidak
membocorkan pesan Postgres mentah. auth-service tetap jalan tanpa perubahan
perilaku lewat re-export tipis dari token.ts dan index.ts, sama seperti pola
PLAN_FEATURES di Modul 1."
```

---

### Task 2: Test harness tenant-service + `tenantGuard` mengenal role & status tenant

Ini akar temuan A: `tenantGuard` cuma memeriksa `tenant_id` ada, **tidak ada cek role sama sekali** dan tidak pernah memeriksa status tenant. Task ini menambah `requireTenantRole(...roles)` di atas `tenantGuard`, dan membuat `tenantGuard` sendiri menolak tenant yang tidak aktif — otomatis berlaku untuk **semua** route yang sudah memakainya (attendance, branches, customers, loyalty, me, users), bukan cuma yang disentuh modul ini.

tenant-service belum punya test sama sekali — task ini juga membangun harness `fastify.inject()` + `fakeDb`, sama polanya dengan `test-support.ts` milik auth-service (Modul 2 Task 1), supaya route-route berikutnya (Task 3-5) bisa diuji tanpa database hidup.

**Files:**
- Modify: `packages/shared/src/types.ts:1` (lengkapi `UserRole` — `manager`/`outlet_manager`/`waiter` dipakai frontend & `users.role` tapi tidak pernah masuk tipe ini)
- Create: `services/tenant-service/src/test-support.ts`
- Create: `services/tenant-service/src/test-support.test.ts`
- Modify: `services/tenant-service/src/middleware/admin-guard.ts:19-26`
- Create: `services/tenant-service/src/middleware/admin-guard.test.ts`
- Modify: `services/tenant-service/package.json` (tambah script `test`)
- Modify: `services/tenant-service/src/index.ts:59-62` (error handler → `buildErrorHandler` bersama)

**Interfaces:**
- Consumes: `resolveTenantAccess`, `TENANT_BLOCKED_MESSAGE`, `buildErrorHandler`, `UserRole` dari `@ipos-cloud/shared` (Task 1).
- Produces:
  - `tenantGuard(request, reply)` — tanda tangan **tidak berubah**, tapi sekarang juga menolak tenant tidak aktif.
  - `requireTenantRole(...roles: UserRole[]): (request, reply) => Promise<void>` — **baru**, dipakai Task 3 & 4.
  - Dari `./test-support.js`, dipakai semua task berikutnya: `TEST_KEYS`, `buildTestApp(opts)`, `fakeDb(tables)` — pola identik `auth-service/src/test-support.ts` (Modul 2), plus `insert()`/`update()` yang mensintesis `id` acak kalau tidak diberikan, supaya alur "insert lalu link ke baris lain" (Task 5) bisa diuji.

- [ ] **Step 1: Lengkapi `UserRole`**

Di `packages/shared/src/types.ts`, ganti baris 1:

```ts
// waiter/manager/outlet_manager dipakai users.role & UI staf (lihat StaffCard.tsx,
// pin-login/page.tsx) tapi sebelumnya tidak ada di tipe ini — JwtPayload.role bertipe
// UserRole jadi diam-diam tidak mencakup 3 dari 8 role yang benar-benar ada di produksi.
export type UserRole = 'super_admin' | 'admin_staff' | 'owner' | 'manager' | 'outlet_manager' | 'cashier' | 'kitchen_staff' | 'waiter';
```

Run: `pnpm build:packages && pnpm -r type-check`
Expected: bersih — `UserRole` cuma diperluas (superset), tidak ada kode yang mengasumsikan daftar lengkapnya (`grep -rn "Record<UserRole" packages services --include=*.ts` sudah diverifikasi kosong).

- [ ] **Step 2: Tulis harness test**

Buat `services/tenant-service/src/test-support.ts`:

```ts
import crypto from 'node:crypto';
import { generateKeyPairSync } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';

// Keypair ephemeral — test tidak boleh bergantung pada .env atau kunci produksi.
// tenant-service produksi cuma register public key (cuma perlu VERIFY token dari
// auth-service); test butuh private key juga supaya bisa MENANDATANGANI token palsu.
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
export const TEST_KEYS = { private: privateKey, public: publicKey };

type Write = { op: 'insert' | 'update' | 'delete'; table: string; values?: any };

/**
 * Stub Drizzle: rantai select/insert/update/delete yang dipakai route tenant-service.
 * `tables` dikunci dengan nama tabel Postgres (mis. 'tenants', 'users'). insert()/update()
 * mensintesis `id` acak kalau `values` tidak menyertakannya (DB asli mengisi lewat
 * defaultRandom()) supaya alur "insert baris A, lalu tautkan ke baris B" (Task 5) bisa
 * diuji tanpa database hidup. `.transaction(fn)` cuma memanggil fn dengan db yang sama —
 * tidak ada rollback sungguhan, cukup untuk menguji ALUR kode, bukan atomisitas Postgres.
 */
export function fakeDb(tables: Record<string, unknown[]>) {
  const writes: Write[] = [];
  const nameOf = (t: any) => String(t?.[Symbol.for('drizzle:Name')] ?? '');
  const project = (row: any, cols?: Record<string, unknown>) =>
    cols ? Object.fromEntries(Object.keys(cols).map((k) => [k, row[k]])) : row;

  const db: any = {
    _writes: writes,
    select: (_cols?: unknown) => ({
      from: (t: any) => {
        const rows = tables[nameOf(t)] ?? [];
        const chain = {
          where: () => chain,
          orderBy: () => chain,
          limit: () => Promise.resolve(rows),
          then: (r: any, j: any) => Promise.resolve(rows).then(r, j),
        };
        return chain;
      },
    }),
    insert: (t: any) => ({
      values: (v: any) => {
        const row = { id: v?.id ?? crypto.randomUUID(), ...v };
        writes.push({ op: 'insert', table: nameOf(t), values: row });
        return {
          returning: (cols?: Record<string, unknown>) => Promise.resolve([project(row, cols)]),
          then: (r: any, j: any) => Promise.resolve([row]).then(r, j),
        };
      },
    }),
    update: (t: any) => ({
      set: (v: any) => {
        writes.push({ op: 'update', table: nameOf(t), values: v });
        const chain = {
          where: () => chain,
          returning: (cols?: Record<string, unknown>) => Promise.resolve([project(v, cols)]),
          then: (r: any, j: any) => Promise.resolve([v]).then(r, j),
        };
        return chain;
      },
    }),
    delete: (t: any) => {
      writes.push({ op: 'delete', table: nameOf(t) });
      const chain = { where: () => Promise.resolve([]), then: (r: any, j: any) => Promise.resolve([]).then(r, j) };
      return chain;
    },
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return db;
}

export async function buildTestApp(opts: {
  db: unknown;
  routes: Array<[(app: FastifyInstance) => Promise<void>, string]>;
}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  await app.register(jwt, {
    secret: { private: TEST_KEYS.private, public: TEST_KEYS.public },
    sign: { algorithm: 'RS256' },
  });
  app.decorate('db', opts.db);
  for (const [route, prefix] of opts.routes) await app.register(route, { prefix });
  await app.ready();
  return app;
}
```

- [ ] **Step 2b: Self-test harness sebelum dipakai**

Buat `services/tenant-service/src/test-support.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { tenants, users } from '@ipos-cloud/drizzle-schema';
import { fakeDb, TEST_KEYS } from './test-support.js';

test('fakeDb mengenali nama tabel drizzle', async () => {
  const db: any = fakeDb({ tenants: [{ id: 't1', name: 'Toko A' }] });
  const rows = await db.select().from(tenants).where().limit();
  assert.deepEqual(rows, [{ id: 't1', name: 'Toko A' }]);
});

test('fakeDb.insert mensintesis id kalau tidak diberikan, dan mendukung returning terproyeksi', async () => {
  const db: any = fakeDb({ users: [] });
  const [owner] = await db.insert(users).values({ name: 'Owner' }).returning({ id: users.id });
  assert.ok(owner.id, 'insert tanpa id manual harus tetap menghasilkan id — DB asli mengisi lewat defaultRandom()');
  assert.equal(Object.keys(owner).length, 1, 'returning({id}) cuma boleh memuat kolom id, bukan seluruh row');
});

test('fakeDb.transaction memanggil fn dengan db yang sama', async () => {
  const db: any = fakeDb({ tenants: [] });
  const result = await db.transaction(async (tx: any) => {
    await tx.insert(tenants).values({ name: 'X' });
    return 'selesai';
  });
  assert.equal(result, 'selesai');
  assert.equal(db._writes.length, 1);
});

test('TEST_KEYS berisi keypair RSA PEM', () => {
  assert.match(TEST_KEYS.private, /^-----BEGIN RSA PRIVATE KEY-----/);
  assert.match(TEST_KEYS.public, /^-----BEGIN PUBLIC KEY-----/);
});
```

Run: `cd services/tenant-service && pnpm exec tsx --test "src/test-support.test.ts"`
Expected: PASS 4/4. Kalau test pertama atau kedua gagal, harness-nya salah dan **jangan lanjut** — semua test route berikutnya akan jadi false negative.

- [ ] **Step 3: Tambahkan script test**

Di `services/tenant-service/package.json`, tambahkan ke `scripts`:
```json
    "test": "tsx --test \"src/**/*.test.ts\"",
```

- [ ] **Step 4: Tulis test yang gagal untuk `tenantGuard` & `requireTenantRole`**

Buat `services/tenant-service/src/middleware/admin-guard.test.ts`:

```ts
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
```

- [ ] **Step 5: Jalankan test, pastikan GAGAL**

Run: `pnpm --filter tenant-service test`
Expected: 4 harness PASS, lalu di `admin-guard.test.ts`: test suspended/expired/soft-deleted GAGAL (tenantGuard belum cek status — semuanya 200), dan 2 test `requireTenantRole` GAGAL (`Cannot find module`/`requireTenantRole is not a function` — belum ada).

- [ ] **Step 6: Implementasi**

Ganti isi `services/tenant-service/src/middleware/admin-guard.ts`:

```ts
import type { FastifyRequest, FastifyReply } from 'fastify';
import { resolveTenantAccess, TENANT_BLOCKED_MESSAGE, type Db, type UserRole } from '@ipos-cloud/shared';

export async function adminGuard(request: FastifyRequest, reply: FastifyReply) {
  await request.jwtVerify();
  const user = request.user as { role: string };
  if (!['super_admin', 'admin_staff'].includes(user.role)) {
    return reply.code(403).send({ error: 'Admin access required', code: 'ADMIN_ONLY' });
  }
}

export async function superAdminGuard(request: FastifyRequest, reply: FastifyReply) {
  await request.jwtVerify();
  const user = request.user as { role: string };
  if (user.role !== 'super_admin') {
    return reply.code(403).send({ error: 'Super admin only', code: 'SUPER_ADMIN_ONLY' });
  }
}

// Untuk route yang dipakai tenant-app (pemilik toko/staf), bukan admin-app.
export async function tenantGuard(request: FastifyRequest, reply: FastifyReply) {
  await request.jwtVerify();
  const user = request.user as { tenant_id: string | null };
  if (!user.tenant_id) {
    return reply.code(403).send({ error: 'Akun ini tidak terikat ke tenant', code: 'NOT_A_TENANT_USER' });
  }

  // request.server.db AMAN dibaca langsung di sini — beda dari bug requireFeature Modul 1:
  // tenant-service men-decorate 'db' SEKALI di paling atas index.ts, sebelum route apa pun
  // diregistrasi, bukan di 4 service lain yang dulu lupa melakukannya sama sekali.
  //
  // Cek status di SETIAP request (bukan cuma saat login di auth-service): access token
  // berumur 15 menit, jadi tenant yang disuspend PASCA-login tetap bisa memanggil semua
  // route tenant-service sampai token itu kedaluwarsa kalau tidak dicek di sini juga.
  const db = (request.server as any).db as Db;
  const access = await resolveTenantAccess(db, user.tenant_id);
  if (!access.ok) {
    return reply.code(403).send({ error: TENANT_BLOCKED_MESSAGE[access.reason], code: `TENANT_${access.reason}` });
  }
}

/**
 * Sama seperti tenantGuard, plus pembatasan role. Akar temuan A: tenantGuard lama tidak
 * mengenal role sama sekali, jadi kasir bisa memanggil route apa pun yang cuma dijaga
 * tenantGuard — termasuk membuat akun manager dan menonaktifkan owner
 * (routes/tenant/users.ts) atau mengubah profil toko (routes/tenant/me.ts).
 */
export function requireTenantRole(...roles: UserRole[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    await tenantGuard(request, reply);
    if (reply.sent) return;
    const user = request.user as { role: UserRole };
    if (!roles.includes(user.role)) {
      return reply.code(403).send({ error: 'Tidak punya izin untuk aksi ini', code: 'FORBIDDEN_ROLE' });
    }
  };
}
```

- [ ] **Step 7: Jalankan test, pastikan LULUS**

Run: `pnpm --filter tenant-service test`
Expected: PASS 11/11 (4 harness + 7 admin-guard).

- [ ] **Step 8: Type-check seluruh workspace**

Run: `pnpm -r type-check`
Expected: bersih.

- [ ] **Step 8b: Tenant-service pakai `buildErrorHandler` bersama (temuan L)**

`services/tenant-service/src/index.ts:59-62` mengirim `error.message` mentah ke klien untuk **semua** error, termasuk error Postgres yang membocorkan nama constraint/kolom:

```ts
app.setErrorHandler((error: Error & { statusCode?: number; code?: string }, _request, reply) => {
  app.log.error(error);
  reply.code(error.statusCode ?? 500).send({ error: error.message, code: error.code || 'INTERNAL_ERROR' });
});
```

Ini persis temuan L ("error.message mentah dikirim ke klien"), dan `buildErrorHandler` yang menutupnya sudah dipindah ke `packages/shared` di Task 1. Ganti baris 59-62 `services/tenant-service/src/index.ts`:

```ts
app.setErrorHandler(buildErrorHandler(app.log));
```

Tambahkan `buildErrorHandler` ke import `@ipos-cloud/shared` yang sudah ada di baris 6:
```ts
import { createDb, createR2Client, buildErrorHandler } from '@ipos-cloud/shared';
```

Run: `pnpm --filter tenant-service test && pnpm -r type-check`
Expected: semua PASS (tidak ada test yang bergantung pada pesan error mentah), type-check bersih.

- [ ] **Step 9: Commit**

```bash
git add packages/shared/src/types.ts services/tenant-service
git commit -m "fix(tenant)!: tenantGuard kenal role & tolak tenant suspended/expired/deleted

tenantGuard cuma memeriksa tenant_id ada — tidak ada cek role sama sekali
(akar temuan A) dan tidak pernah memeriksa status tenant, jadi tenant yang
disuspend PASCA-login tetap bisa bertransaksi sampai access token-nya
kedaluwarsa (15 menit).

requireTenantRole(...roles) baru dipakai route yang perlu dibatasi ke role
tertentu (Task 3 & 4). Pengecekan status berlaku otomatis untuk SEMUA route
yang sudah memakai tenantGuard (attendance, branches, customers, loyalty,
me, users), bukan cuma yang disentuh modul ini.

Sekaligus melengkapi UserRole yang sebelumnya kehilangan manager/
outlet_manager/waiter — tiga role yang sudah dipakai users.role & frontend
tapi tidak pernah masuk tipe ini, dan mengganti error handler index.ts
dengan buildErrorHandler bersama (temuan L: error.message mentah
sebelumnya dikirim ke klien untuk semua error)."
```

---

### Task 3: `routes/tenant/users.ts` — batasi ke role `owner`

Root cause temuan A. Kasir (atau siapa pun dengan token tenant valid) bisa memanggil **seluruh** route kelola staf: melihat `owner_id`, membuat akun `manager`, mengganti PIN owner, dan menonaktifkan owner — karena `tenantGuard` tidak mengenal role. Task 2 sudah membuat `requireTenantRole` tersedia; task ini memakainya.

**Keputusan cakupan:** dibatasi ke `owner` saja (bukan `owner`+`manager`/`outlet_manager`) — halaman ini dipakai Setup Wizard & Pengaturan > Kasir, area yang secara produk milik pemilik toko. Kalau manager/outlet_manager memang harus bisa kelola staf juga, itu keputusan produk yang butuh konfirmasi terpisah (dicatat di bagian "Butuh keputusan Anda" di akhir plan ini) — modul ini sengaja memilih pembatasan paling ketat yang sudah pasti menutup temuan A, bukan menebak matriks izin yang lebih longgar.

**Files:**
- Modify: `services/tenant-service/src/routes/tenant/users.ts:13, 49-59`
- Create: `services/tenant-service/src/routes/tenant/users.test.ts`

**Interfaces:**
- Consumes: `requireTenantRole` dari Task 2.
- Produces: tidak ada kontrak API baru — bentuk respons semua route tidak berubah, cuma pemanggil non-owner sekarang dapat 403 `FORBIDDEN_ROLE` alih-alih 200.

- [ ] **Step 1: Tulis test yang gagal**

Buat `services/tenant-service/src/routes/tenant/users.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTestApp, fakeDb } from '../../test-support.js';
import { tenantUsersRoutes } from './users.js';

const TENANT = '22222222-2222-2222-2222-222222222222';
const OWNER_ID = '33333333-3333-3333-3333-333333333333';
const CASHIER_ID = '44444444-4444-4444-4444-444444444444';

async function build() {
  const db = fakeDb({
    tenants: [{ id: TENANT, status: 'active', deleted_at: null }],
    users: [
      { id: OWNER_ID, tenant_id: TENANT, name: 'Owner', role: 'owner', is_active: true },
      { id: CASHIER_ID, tenant_id: TENANT, name: 'Kasir', role: 'cashier', is_active: true },
    ],
  });
  const app = await buildTestApp({ db, routes: [[tenantUsersRoutes, '/api/v1/tenants/users']] });
  const asCashier = app.jwt.sign({ sub: CASHIER_ID, tenant_id: TENANT, role: 'cashier' });
  const asOwner = app.jwt.sign({ sub: OWNER_ID, tenant_id: TENANT, role: 'owner' });
  return { app, db, asCashier, asOwner };
}

test('kasir TIDAK BISA melihat daftar staf (bocor owner_id) — akar temuan A', async () => {
  const { app, asCashier } = await build();
  const res = await app.inject({ method: 'GET', url: '/api/v1/tenants/users', headers: { authorization: `Bearer ${asCashier}` } });
  assert.equal(res.statusCode, 403);
  assert.equal(res.json().code, 'FORBIDDEN_ROLE');
  await app.close();
});

test('owner BISA melihat daftar staf', async () => {
  const { app, asOwner } = await build();
  const res = await app.inject({ method: 'GET', url: '/api/v1/tenants/users', headers: { authorization: `Bearer ${asOwner}` } });
  assert.equal(res.statusCode, 200);
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
```

Tidak ada test route-level untuk "owner tidak bisa mengganti PIN dirinya sendiri lewat endpoint ini" — `fakeDb`-nya (Task 2) tidak mengevaluasi kondisi `WHERE` sama sekali (`.where()` cuma meneruskan chain, `.returning()` selalu resolve non-kosong terlepas dari kondisinya), jadi test seperti itu akan LULUS baik kodenya benar maupun salah dan cuma menyesatkan. Penambahan `ne(users.role, 'owner')` di Step 3 di bawah tetap dilakukan — diverifikasi lewat kesamaan pola dengan `reset-password` (baris 77) dan `delete` (baris 90) di file yang sama, yang sudah punya proteksi identik.

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `pnpm --filter tenant-service test`
Expected: 5 test "kasir TIDAK BISA ..." GAGAL karena masih 200 (router belum dibatasi ke `owner`).

- [ ] **Step 3: Implementasi**

Di `services/tenant-service/src/routes/tenant/users.ts`, ganti import (baris 6) dan hook (baris 13):

```ts
import { requireTenantRole } from '../../middleware/admin-guard.js';
```

```ts
export async function tenantUsersRoutes(app: FastifyInstance) {
  // Seluruh router ini cuma boleh diakses owner — mengelola staf lain (lihat siapa,
  // buat akun baru, ganti PIN, nonaktifkan) bukan wewenang kasir/manager/waiter.
  app.addHook('preHandler', requireTenantRole('owner'));
```

Lalu ganti baris 49-59 (`PATCH /:id/pin`) — tambahkan `ne(users.role, 'owner')` seperti pola yang sudah ada di `reset-password` (baris 77) dan `delete` (baris 90) di file yang sama:

```ts
  app.patch('/:id/pin', async (request: any, reply) => {
    const { pin } = z.object({ pin: z.string().regex(/^\d{4}$/) }).parse(request.body);
    const { tenant_id } = request.user as { tenant_id: string };
    const db = (app as any).db;
    const pin_hash = await bcrypt.hash(pin, 10);
    // ne(role,'owner') — sebelumnya tidak ada di endpoint ini padahal reset-password &
    // delete di file yang sama sudah punya proteksi ini. Sekarang router memang sudah
    // dibatasi ke role owner (preHandler di atas), tapi ini tetap dipertahankan sebagai
    // pertahanan berlapis: owner tidak boleh mengganti PIN akun owner lain/dirinya lewat
    // endpoint kelola-staf ini.
    const [updated] = await db.update(users).set({ pin_hash, updated_at: new Date() })
      .where(and(eq(users.id, request.params.id), eq(users.tenant_id, tenant_id), ne(users.role, 'owner')))
      .returning({ id: users.id });
    if (!updated) return reply.code(404).send({ error: 'Staff tidak ditemukan', code: 'NOT_FOUND' });
    return { ok: true };
  });
```

- [ ] **Step 4: Jalankan test, pastikan LULUS**

Run: `pnpm --filter tenant-service test`
Expected: PASS 17/17 (11 dari Task 2 + 6 baru).

- [ ] **Step 5: Type-check**

Run: `pnpm -r type-check`
Expected: bersih.

- [ ] **Step 6: Commit**

```bash
git add services/tenant-service/src
git commit -m "fix(tenant)!: routes/tenant/users.ts dibatasi ke role owner

tenantGuard sebelumnya tidak mengenal role sama sekali, jadi kasir bisa
GET seluruh daftar staf (bocor owner_id), membuat akun manager, mengganti
PIN owner, dan menonaktifkan owner. Router ini sekarang wajib role owner.

Sekaligus menutup celah kecil: endpoint PATCH .../pin tidak punya
ne(role,'owner') padahal reset-password & delete di file yang sama sudah
punya — sekarang konsisten di ketiganya.

BREAKING: staf non-owner (manager/outlet_manager/cashier/kitchen_staff/
waiter) yang sebelumnya bisa memanggil route ini sekarang dapat 403."
```

---

### Task 4: `routes/tenant/me.ts` — batasi rute yang mengubah data ke role `owner`

Bagian dari temuan A: kasir bisa mengubah profil toko, upload logo, dan upload gambar QRIS. `GET /me` tetap terbuka untuk semua role (siapa pun yang login perlu tahu nama tokonya sendiri) — cuma rute yang **menulis** yang dibatasi.

**Files:**
- Modify: `services/tenant-service/src/routes/tenant/me.ts:47, 74, 91, 108`
- Create: `services/tenant-service/src/routes/tenant/me.test.ts`

**Interfaces:**
- Consumes: `requireTenantRole` dari Task 2.
- Produces: `GET /me` tidak berubah. `PATCH /me`, `POST /me/logo`, `POST /me/qris`, `POST /me/test-notification` sekarang butuh role `owner`.

- [ ] **Step 1: Tulis test yang gagal**

Buat `services/tenant-service/src/routes/tenant/me.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTestApp, fakeDb } from '../../test-support.js';
import { tenantMeRoutes } from './me.js';

const TENANT = '55555555-5555-5555-5555-555555555555';
const CASHIER_ID = '66666666-6666-6666-6666-666666666666';

async function build() {
  const db = fakeDb({
    tenants: [{ id: TENANT, status: 'active', deleted_at: null, name: 'Toko A' }],
    users: [{ id: CASHIER_ID, tenant_id: TENANT, name: 'Kasir', role: 'cashier' }],
    tenant_feature_overrides: [],
  });
  const app = await buildTestApp({ db, routes: [[tenantMeRoutes, '/api/v1/tenants']] });
  const asCashier = app.jwt.sign({ sub: CASHIER_ID, tenant_id: TENANT, role: 'cashier' });
  const asOwner = app.jwt.sign({ sub: 'owner-1', tenant_id: TENANT, role: 'owner' });
  return { app, asCashier, asOwner };
}

test('GET /me tetap terbuka untuk kasir', async () => {
  const { app, asCashier } = await build();
  const res = await app.inject({ method: 'GET', url: '/api/v1/tenants/me', headers: { authorization: `Bearer ${asCashier}` } });
  assert.equal(res.statusCode, 200);
  await app.close();
});

test('kasir TIDAK BISA ubah profil toko — akar temuan A', async () => {
  const { app, asCashier } = await build();
  const res = await app.inject({
    method: 'PATCH', url: '/api/v1/tenants/me', headers: { authorization: `Bearer ${asCashier}` },
    payload: { name: 'Nama Diubah Kasir' },
  });
  assert.equal(res.statusCode, 403);
  await app.close();
});

test('owner BISA ubah profil toko', async () => {
  const { app, asOwner } = await build();
  const res = await app.inject({
    method: 'PATCH', url: '/api/v1/tenants/me', headers: { authorization: `Bearer ${asOwner}` },
    payload: { name: 'Nama Baru' },
  });
  assert.equal(res.statusCode, 200);
  await app.close();
});

test('kasir TIDAK BISA upload logo toko', async () => {
  const { app, asCashier } = await build();
  const res = await app.inject({ method: 'POST', url: '/api/v1/tenants/me/logo', headers: { authorization: `Bearer ${asCashier}` } });
  assert.equal(res.statusCode, 403, 'ditolak di preHandler, sebelum request.file() dipanggil');
  await app.close();
});

test('kasir TIDAK BISA upload gambar QRIS', async () => {
  const { app, asCashier } = await build();
  const res = await app.inject({ method: 'POST', url: '/api/v1/tenants/me/qris', headers: { authorization: `Bearer ${asCashier}` } });
  assert.equal(res.statusCode, 403);
  await app.close();
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `pnpm --filter tenant-service test`
Expected: 4 test "kasir TIDAK BISA ..." GAGAL — masih lolos ke handler (kasus logo/qris akan gagal duluan dengan status lain karena tidak ada file, bukan 403).

- [ ] **Step 3: Implementasi**

Di `services/tenant-service/src/routes/tenant/me.ts`, ganti import (baris 6) dan `preHandler` di 4 route penulis (baris 47, 74, 91, 108) — `GET /me` (baris 10) **tidak disentuh**:

```ts
import { tenantGuard, requireTenantRole } from '../../middleware/admin-guard.js';
```

```ts
  // Update profil toko — dipakai Setup Wizard step 1 & Pengaturan. Owner-only: kasir
  // sebelumnya bisa mengubah profil toko lewat route ini (akar temuan A).
  app.patch('/me', { preHandler: requireTenantRole('owner') }, async (request: any) => {
```

```ts
  // Upload logo ke R2 — owner-only, sama alasannya dengan PATCH /me.
  app.post('/me/logo', { preHandler: requireTenantRole('owner') }, async (request: any, reply) => {
```

```ts
  // Upload gambar QRIS statis ke R2 — owner-only, sama alasannya dengan PATCH /me.
  app.post('/me/qris', { preHandler: requireTenantRole('owner') }, async (request: any, reply) => {
```

```ts
  // Kirim email test — owner-only: bagian dari Pengaturan > Notifikasi, konsisten
  // dengan rute penulis lain di file ini.
  app.post('/me/test-notification', { preHandler: requireTenantRole('owner') }, async (request: any, reply) => {
```

`GET /me` (baris 10) tetap `preHandler: tenantGuard` — semua role tenant boleh melihat profil tokonya sendiri.

- [ ] **Step 4: Jalankan test, pastikan LULUS**

Run: `pnpm --filter tenant-service test`
Expected: PASS 22/22 (17 dari Task 2-3 + 5 baru).

- [ ] **Step 5: Type-check & commit**

Run: `pnpm -r type-check`

```bash
git add services/tenant-service/src
git commit -m "fix(tenant)!: routes/tenant/me.ts — ubah profil toko/logo/QRIS dibatasi ke owner

Kasir sebelumnya bisa PATCH /me, upload logo, upload QRIS, dan kirim email
test lewat tenantGuard yang tidak mengenal role (temuan A). GET /me tetap
terbuka untuk semua role tenant — cuma rute yang MENULIS yang dibatasi.

BREAKING: staf non-owner yang sebelumnya bisa memanggil 4 route ini
sekarang dapat 403 FORBIDDEN_ROLE."
```

---

### Task 5: `POST /admin/tenants` — set `owner_id` + transaksi

`POST /admin/tenants` membuat baris `tenants` lalu baris `users` (role `owner`) terpisah, **tidak pernah** mengisi `tenants.owner_id` kembali. Akibatnya kolom email di list admin selalu kosong (join ke `owner_id` yang `NULL`) dan `reset-owner-password` selalu 404. Kalau insert `users` gagal (mis. email dobel), tenant sudah kadung ter-insert **tanpa owner** — yatim permanen. Kedua hal ini diperbaiki bersamaan karena akar masalahnya sama: dua insert yang harus selalu sukses/gagal bersama, dilakukan terpisah.

**Files:**
- Modify: `services/tenant-service/src/routes/admin/tenants.ts:65-118`
- Create: `services/tenant-service/src/routes/admin/tenants.test.ts`

**Interfaces:**
- Consumes: `Db.transaction` (drizzle-orm/node-postgres, sudah tersedia — dipakai pertama kali di modul ini).
- Produces: respons `POST /admin/tenants` **tidak berubah bentuk** (`{...tenant, owner_temp_password}`), tapi `tenant.owner_id` sekarang selalu terisi.

- [ ] **Step 1: Tulis test yang gagal**

Buat `services/tenant-service/src/routes/admin/tenants.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTestApp, fakeDb } from '../../test-support.js';
import { tenantsAdminRoutes } from './tenants.js';

async function build() {
  const db = fakeDb({ tenants: [], users: [], admin_audit_logs: [] });
  const app = await buildTestApp({ db, routes: [[tenantsAdminRoutes, '/api/v1/admin/tenants']] });
  const token = app.jwt.sign({ sub: 'admin-1', role: 'super_admin', tenant_id: null });
  return { app, db, token };
}

test('POST / membuat tenant + owner dalam satu transaksi dan mengisi owner_id', async () => {
  const { app, db, token } = await build();
  const res = await app.inject({
    method: 'POST', url: '/api/v1/admin/tenants', headers: { authorization: `Bearer ${token}` },
    payload: { name: 'Toko Baru', email: 'owner@baru.id' },
  });
  assert.equal(res.statusCode, 201);

  const tenantInsert = db._writes.find((w: any) => w.op === 'insert' && w.table === 'tenants');
  const userInsert = db._writes.find((w: any) => w.op === 'insert' && w.table === 'users');
  const ownerLink = db._writes.find((w: any) => w.op === 'update' && w.table === 'tenants');

  assert.ok(tenantInsert, 'tenant harus dibuat');
  assert.ok(userInsert, 'owner user harus dibuat');
  assert.equal(userInsert.values.role, 'owner');
  assert.ok(ownerLink, 'tenants.owner_id harus di-update setelah user owner dibuat — sebelumnya TIDAK PERNAH terjadi');
  assert.equal(
    ownerLink.values.owner_id, userInsert.values.id,
    'owner_id harus menunjuk ke user owner yang baru dibuat, bukan kosong — tanpa ini email admin selalu null & reset-owner-password selalu 404'
  );
  await app.close();
});

test('POST / balas owner_temp_password sekali, dan tenant hasil akhir punya owner_id', async () => {
  const { app, token } = await build();
  const res = await app.inject({
    method: 'POST', url: '/api/v1/admin/tenants', headers: { authorization: `Bearer ${token}` },
    payload: { name: 'Toko B', email: 'b@toko.id' },
  });
  const body = res.json();
  assert.ok(body.owner_temp_password);
  assert.ok(body.owner_id, 'response tenant yang dikembalikan ke admin-app harus sudah memuat owner_id, bukan hasil SEBELUM link dibuat');
  await app.close();
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `pnpm --filter tenant-service test`
Expected: kedua test baru GAGAL — tidak ada `update` pada tabel `tenants` sama sekali (`ownerLink` `undefined`), dan `body.owner_id` `undefined`.

- [ ] **Step 3: Implementasi**

Ganti baris 76-117 `services/tenant-service/src/routes/admin/tenants.ts` (dari `const db = (app as any).db;` sampai sebelum `return reply.code(201)...`):

```ts
    const db = (app as any).db;
    const slug = slugify(body.name);
    const trial_ends_at = body.mode === 'trial' ? new Date(Date.now() + body.trial_days * 86400000) : null;
    const tempPassword = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    const password_hash = await bcrypt.hash(tempPassword, 10);

    // Tenant + owner user dibuat dalam SATU transaksi: sebelumnya kalau insert user
    // gagal (mis. email dobel), tenant sudah kadung ter-insert TANPA owner — yatim
    // permanen. owner_id juga di-set di sini — sebelumnya TIDAK PERNAH diisi sama
    // sekali, jadi email admin selalu null & reset-owner-password selalu 404.
    const tenant = await db.transaction(async (tx: any) => {
      const [created] = await tx.insert(tenants).values({
        name: body.name, slug, plan_code: body.plan_code, status: body.mode, trial_ends_at, notes: body.notes,
      }).returning();

      const [owner] = await tx.insert(users).values({
        tenant_id: created.id, name: body.name, email: body.email, phone: body.phone, password_hash, role: 'owner',
      }).returning({ id: users.id });

      const [withOwner] = await tx.update(tenants).set({ owner_id: owner.id }).where(eq(tenants.id, created.id)).returning();
      return withOwner;
    });

    await logAdminAction(db, {
      adminId: (request.user as any).sub,
      action: 'tenant.created',
      targetType: 'tenant',
      targetId: tenant.id,
      targetName: tenant.name,
      // ponytail: password TIDAK dicatat di audit log (plaintext permanen di tabel
      // audit itu buruk) — cuma dikembalikan sekali di response HTTP di bawah.
      after: { slug, plan_code: body.plan_code, status: body.mode },
      ipAddress: request.ip,
    });

    // owner_temp_password cuma muncul SEKALI di sini — tidak disimpan plaintext di mana
    // pun, tidak bisa diambil ulang. Email undangan dikirim otomatis; response tetap
    // menyertakan password sebagai fallback kalau pengiriman email gagal.
    await notifyTenantInvitation({ name: body.name, tenant_name: tenant.name, email: body.email, password: tempPassword });
    return reply.code(201).send({ ...tenant, owner_temp_password: tempPassword });
```

`logAdminAction` sengaja **tetap di luar transaksi** — pola yang sama dipakai di seluruh file ini untuk 10+ aksi admin lain (activate/suspend/dst). Mengubah itu jadi keputusan arsitektur terpisah, bukan bagian task ini (lihat "Yang SENGAJA tidak dikerjakan" di akhir plan).

- [ ] **Step 4: Jalankan test, pastikan LULUS**

Run: `pnpm --filter tenant-service test`
Expected: PASS 24/24 (22 dari Task 2-4 + 2 baru).

- [ ] **Step 5: Type-check & commit**

Run: `pnpm -r type-check`

```bash
git add services/tenant-service/src
git commit -m "fix(tenant): POST /admin/tenants set owner_id + transaksi tenant+owner

owner_id TIDAK PERNAH diisi sebelumnya, jadi email pemilik toko selalu
null di list admin dan reset-owner-password selalu 404. Create tenant
juga tanpa transaksi — kalau insert user owner gagal (mis. email dobel),
tenant sudah kadung ter-insert tanpa owner, yatim permanen."
```

---

### Task 6: Klem `page`/`limit` di 4 endpoint list admin

`page`/`limit` dari query string di-`parseInt` tanpa batas atas maupun bawah di 4 endpoint. `limit=-1` atau `limit=999999` diteruskan mentah ke `.limit()`/`.offset()` Drizzle — bisa menarik seluruh tabel dalam satu request, atau (untuk `page`/`limit` negatif/`NaN`) menghasilkan `.offset()` negatif yang berperilaku tidak terdefinisi di Postgres.

**Files:**
- Create: `services/tenant-service/src/lib/pagination.ts`
- Create: `services/tenant-service/src/lib/pagination.test.ts`
- Modify: `services/tenant-service/src/routes/admin/tenants.ts:32-34`
- Modify: `services/tenant-service/src/routes/admin/leads.ts:11, 15`
- Modify: `services/tenant-service/src/routes/admin/offline.ts:27, 29`
- Modify: `services/tenant-service/src/routes/admin/audit.ts:9-10`

**Interfaces:**
- Consumes: —
- Produces: `parsePagination(query: Record<string, string>, defaultLimit?: number): { page: number; limit: number; offset: number }` — `page` diklem minimal `1`, `limit` diklem `1..100`. Bentuk respons endpoint (`{data, total, page, limit}`) tidak berubah — cuma nilai `page`/`limit` sekarang tidak pernah negatif/berlebihan.

- [ ] **Step 1: Tulis test yang gagal**

Buat `services/tenant-service/src/lib/pagination.test.ts`:

```ts
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
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `pnpm --filter tenant-service test`
Expected: FAIL — `Cannot find module './pagination.js'`.

- [ ] **Step 3: Implementasi**

Buat `services/tenant-service/src/lib/pagination.ts`:

```ts
/**
 * Klem page/limit dari query string list admin. Sebelumnya parseInt() dipakai mentah
 * di 4 endpoint tanpa batas atas/bawah — limit=999999 menarik seluruh tabel dalam satu
 * request, dan page/limit negatif/NaN menghasilkan .offset() yang tidak terdefinisi.
 */
export function parsePagination(query: Record<string, string>, defaultLimit = 20) {
  const rawPage = parseInt(query.page ?? '', 10);
  const rawLimit = parseInt(query.limit ?? '', 10);
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit = Math.min(100, Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : defaultLimit);
  return { page, limit, offset: (page - 1) * limit };
}
```

- [ ] **Step 4: Jalankan test, pastikan LULUS**

Run: `pnpm --filter tenant-service test`
Expected: PASS 7/7.

- [ ] **Step 5: Pakai di 4 endpoint**

Di `services/tenant-service/src/routes/admin/tenants.ts`, ganti baris 32-34 (`GET /`):
```ts
    const { status, search, includeDeleted } = request.query as Record<string, string>;
    const db = (app as any).db;
    const { page, limit, offset } = parsePagination(request.query as Record<string, string>);
```
Hapus pemakaian `parseInt(page)`/`parseInt(limit)` di sisa handler (baris 56-57, 61) — ganti langsung dengan `limit`/`offset`/`page` hasil `parsePagination`. Tambahkan import: `import { parsePagination } from '../../lib/pagination.js';`.

Di `services/tenant-service/src/routes/admin/leads.ts`, ganti baris 11 & 15 (`GET /`) dengan pola yang sama, tambahkan import yang sama.

Di `services/tenant-service/src/routes/admin/offline.ts`, ganti baris 27 & 29 (`GET /clients`) dengan pola yang sama.

Di `services/tenant-service/src/routes/admin/audit.ts`, ganti baris 9-10:
```ts
    const { page, limit, offset } = parsePagination(request.query as Record<string, string>, 50);
```
(default `50`, bukan `20` — sama seperti kode aslinya untuk endpoint ini). Tambahkan import yang sama.

- [ ] **Step 6: Jalankan seluruh test tenant-service & type-check**

Run: `pnpm --filter tenant-service test && pnpm -r type-check`
Expected: semua PASS, tidak ada FAIL; type-check bersih.

- [ ] **Step 7: Commit**

```bash
git add services/tenant-service/src
git commit -m "fix(tenant): klem page/limit di 4 endpoint list admin

parseInt() dipakai mentah tanpa batas — limit=999999 menarik seluruh
tabel dalam satu request, page/limit negatif atau bukan angka
menghasilkan .offset() yang tidak terdefinisi. parsePagination() dipakai
bersama oleh keempatnya, limit diklem 1..100."
```

---

### Task 7: `loyalty.ts` — verifikasi tenant sebelum log poin + transaksi redeem

Dua bug independen di jalur poin loyalty:
- `points/earn` menulis `loyalty_point_logs` **sebelum** memverifikasi member itu milik tenant pemanggil — kalau `member_id` bukan milik tenant ini, log tetap tertulis (mencatat "poin didapat" untuk member yang bukan miliknya) sementara UPDATE saldo di baris berikutnya gagal senyap (WHERE tidak match apa pun).
- `points/redeem` meng-UPDATE saldo tanpa filter `tenant_id` di WHERE-nya (cuma filter `id`), dan tidak dalam transaksi bersama insert log — dua redeem bersamaan bisa lolos cek saldo yang sama sebelum salah satu commit, menghasilkan saldo negatif.

**Files:**
- Modify: `services/tenant-service/src/routes/tenant/loyalty.ts:49-78`
- Create: `services/tenant-service/src/routes/tenant/loyalty.test.ts`

**Interfaces:**
- Consumes: `Db.transaction` (sudah dipakai Task 5).
- Produces: bentuk respons `points/earn` dan `points/redeem` tidak berubah.

- [ ] **Step 1: Tulis test yang gagal**

Buat `services/tenant-service/src/routes/tenant/loyalty.test.ts`:

```ts
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
```

Catatan: guard saldo (`sql\`points_balance >= ${body.points}\`` di level `UPDATE`, mencegah dua redeem konkuren membuat saldo negatif) **tidak** ada test route-level untuk itu — `fakeDb` tidak mengevaluasi fragmen SQL sama sekali (`.set()` cuma mencatat apa yang dikirim, tidak pernah menolak). Guard ini diverifikasi lewat pembacaan kode (query WHERE-nya sudah benar secara statis) — memverifikasi race condition sungguhan butuh Postgres asli, di luar cakupan unit test modul ini.

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `pnpm --filter tenant-service test`
Expected: test pertama ("points/earn TIDAK menulis log...") GAGAL — kode lama menulis log tanpa pernah memverifikasi member ketemu dulu, jadi tidak ada jalur yang membalas 404 di sini sama sekali.

- [ ] **Step 3: Implementasi**

Ganti baris 47-78 `services/tenant-service/src/routes/tenant/loyalty.ts` (handler `points/earn` dan `points/redeem`):

```ts
  // Earn poin — dipanggil pos-service best-effort setelah order (1 poin per Rp10.000, dibulatkan bawah).
  const earnBody = z.object({ member_id: z.string().uuid(), order_id: z.string().uuid(), order_total: z.number().int().min(0) });
  app.post('/points/earn', { preHandler: requireFeature(db, 'loyalty_program') }, async (request: any, reply) => {
    const body = earnBody.parse(request.body);
    const { tenant_id } = request.user as { tenant_id: string };
    const points = Math.floor(body.order_total / 10000);
    if (points <= 0) return reply.code(200).send({ ok: true, points_earned: 0 });

    const member = await db.transaction(async (tx: any) => {
      // Verifikasi member milik tenant SEBELUM menulis log — sebelumnya log ditulis
      // dulu, baru UPDATE saldo gagal senyap (WHERE tidak match) kalau member_id
      // ternyata bukan milik tenant pemanggil.
      const [m] = await tx.select().from(loyalty_members)
        .where(and(eq(loyalty_members.id, body.member_id), eq(loyalty_members.tenant_id, tenant_id)));
      if (!m) return null;

      await tx.insert(loyalty_point_logs).values({ tenant_id, member_id: body.member_id, delta: points, reason: 'order_earn', order_id: body.order_id });
      const [updated] = await tx.update(loyalty_members)
        .set({ points_balance: sql`${loyalty_members.points_balance} + ${points}` })
        .where(and(eq(loyalty_members.id, body.member_id), eq(loyalty_members.tenant_id, tenant_id)))
        .returning();
      return updated;
    });
    if (!member) return reply.code(404).send({ error: 'Member tidak ditemukan', code: 'NOT_FOUND' });
    return reply.code(200).send({ ok: true, points_earned: points, member });
  });

  const redeemBody = z.object({ member_id: z.string().uuid(), points: z.number().int().positive() });
  app.post('/points/redeem', { preHandler: requireFeature(db, 'loyalty_program') }, async (request: any, reply) => {
    const body = redeemBody.parse(request.body);
    const { tenant_id } = request.user as { tenant_id: string };

    const [member] = await db.select().from(loyalty_members).where(and(eq(loyalty_members.id, body.member_id), eq(loyalty_members.tenant_id, tenant_id)));
    if (!member) return reply.code(404).send({ error: 'Member tidak ditemukan', code: 'NOT_FOUND' });
    if (member.points_balance < body.points) return reply.code(400).send({ error: 'Poin tidak cukup', code: 'INSUFFICIENT_POINTS' });

    return db.transaction(async (tx: any) => {
      // WHERE menyertakan tenant_id (sebelumnya cuma id) DAN guard saldo ulang di level
      // UPDATE — dua redeem bersamaan bisa lolos cek saldo di atas sebelum salah satu
      // commit; guard ini mencegah saldo jadi negatif dari race itu.
      const [row] = await tx.update(loyalty_members)
        .set({ points_balance: sql`${loyalty_members.points_balance} - ${body.points}` })
        .where(and(
          eq(loyalty_members.id, body.member_id),
          eq(loyalty_members.tenant_id, tenant_id),
          sql`${loyalty_members.points_balance} >= ${body.points}`,
        ))
        .returning();
      if (!row) {
        throw Object.assign(new Error('Poin tidak cukup'), { statusCode: 400, code: 'INSUFFICIENT_POINTS' });
      }
      await tx.insert(loyalty_point_logs).values({ tenant_id, member_id: body.member_id, delta: -body.points, reason: 'manual_redeem' });
      return row;
    });
  });
```

- [ ] **Step 4: Jalankan test, pastikan LULUS**

Run: `pnpm --filter tenant-service test`
Expected: PASS 35/35 (31 dari Task 2-6 + 4 baru).

- [ ] **Step 5: Type-check & commit**

Run: `pnpm -r type-check`

```bash
git add services/tenant-service/src
git commit -m "fix(tenant): loyalty.ts — verifikasi tenant sebelum log poin + transaksi redeem

points/earn menulis loyalty_point_logs SEBELUM memverifikasi member milik
tenant pemanggil — log tetap tertulis walau UPDATE saldo gagal senyap
kalau member ternyata beda tenant. points/redeem meng-UPDATE saldo tanpa
filter tenant_id dan tanpa transaksi bersama insert log, sehingga dua
redeem bersamaan bisa lolos cek saldo yang sama dan menghasilkan saldo
negatif. Keduanya sekarang satu transaksi dengan guard saldo di level
UPDATE."
```

---

### Task 8: Hapus duplikasi soft-delete/restore/bulk-delete

Pola identik ~120 baris terduplikasi 3× di `tenants.ts`, `leads.ts`, `offline.ts` (soft-delete satu baris, restore, bulk soft-delete). Diekstrak ke `packages/shared` karena polanya generic (tabel apa pun dengan kolom `id`+`deleted_at`) dan `logAdminAction` (dependensinya) sudah di sana.

**Files:**
- Create: `packages/shared/src/soft-delete.ts`
- Create: `packages/shared/src/soft-delete.test.ts`
- Modify: `packages/shared/src/index.ts` (tambah 1 barrel export)
- Modify: `services/tenant-service/src/routes/admin/tenants.ts:229-274`
- Modify: `services/tenant-service/src/routes/admin/leads.ts:44-85`
- Modify: `services/tenant-service/src/routes/admin/offline.ts:88-136`

**Interfaces:**
- Consumes: `logAdminAction` (sudah ada di `packages/shared`).
- Produces dari `@ipos-cloud/shared`:
  - `softDeleteOne(opts): Promise<Row | null>`
  - `restoreOne(opts): Promise<Row | null>`
  - `softDeleteBulk(opts): Promise<Row[]>`

  di mana `opts = { db: Db; table: any; nameColumn: any; targetType: string; adminId: string; ipAddress?: string; id?: string; ids?: string[] }` (`id` untuk `softDeleteOne`/`restoreOne`, `ids` untuk `softDeleteBulk`). `table`/`nameColumn` bertipe `any` — konsisten dengan pola `(app as any).db` yang sudah dipakai di seluruh route tenant-service; memaksakan tipe generic Drizizzle di sini menambah kerumitan tanpa manfaat nyata (setiap pemanggil sudah type-safe di sisi call-site lewat import tabel asli).

- [ ] **Step 1: Tulis test yang gagal**

Buat `packages/shared/src/soft-delete.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { softDeleteOne, restoreOne, softDeleteBulk } from './soft-delete.js';

function fakeDb(returning: unknown[]) {
  const inserted: unknown[] = [];
  return {
    update: () => ({ set: () => ({ where: () => ({ returning: async () => returning }) }) }),
    insert: () => ({ values: async (v: unknown) => { inserted.push(v); } }),
    _inserted: inserted,
  } as any;
}

const ctx = { targetType: 'tenant', adminId: 'admin-1', ipAddress: '1.2.3.4' };

test('softDeleteOne mengembalikan baris & mencatat audit log', async () => {
  const db = fakeDb([{ id: 't1', name: 'Toko A' }]);
  const result = await softDeleteOne({ db, table: {}, nameColumn: {}, id: 't1', ...ctx });
  assert.deepEqual(result, { id: 't1', name: 'Toko A' });
  assert.equal(db._inserted.length, 1);
  assert.equal((db._inserted[0] as any).action, 'tenant.deleted');
});

test('softDeleteOne mengembalikan null tanpa mencatat log kalau tidak ada baris ter-update', async () => {
  const db = fakeDb([]);
  const result = await softDeleteOne({ db, table: {}, nameColumn: {}, id: 'tidak-ada', ...ctx });
  assert.equal(result, null);
  assert.equal(db._inserted.length, 0, 'jangan catat audit log untuk operasi yang sebenarnya no-op (404)');
});

test('restoreOne mengembalikan baris & mencatat audit log', async () => {
  const db = fakeDb([{ id: 't1', name: 'Toko A' }]);
  const result = await restoreOne({ db, table: {}, nameColumn: {}, id: 't1', ...ctx });
  assert.deepEqual(result, { id: 't1', name: 'Toko A' });
  assert.equal((db._inserted[0] as any).action, 'tenant.restored');
});

test('restoreOne mengembalikan null kalau baris tidak sedang terhapus', async () => {
  const db = fakeDb([]);
  const result = await restoreOne({ db, table: {}, nameColumn: {}, id: 't1', ...ctx });
  assert.equal(result, null);
});

test('softDeleteBulk mencatat SATU log audit untuk banyak baris + gabungan nama', async () => {
  const db = fakeDb([{ id: 't1', name: 'Toko A' }, { id: 't2', name: 'Toko B' }]);
  const rows = await softDeleteBulk({ db, table: {}, nameColumn: {}, ids: ['t1', 't2'], ...ctx });
  assert.equal(rows.length, 2);
  const logged = db._inserted[0] as any;
  assert.equal(logged.action, 'tenant.bulk_deleted');
  assert.equal(logged.target_name, 'Toko A, Toko B');
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `cd packages/shared && pnpm exec tsx --test "src/soft-delete.test.ts"`
Expected: FAIL — `Cannot find module './soft-delete.js'`.

- [ ] **Step 3: Implementasi**

Buat `packages/shared/src/soft-delete.ts`:

```ts
import { and, eq, inArray, isNull, isNotNull } from 'drizzle-orm';
import type { Db } from './db.js';
import { logAdminAction } from './audit.js';

interface SoftDeleteOpts {
  db: Db;
  table: any; // tabel drizzle dengan kolom id + deleted_at — lihat catatan tipe di plan
  nameColumn: any; // kolom dipakai sebagai nama tampilan di audit log (name / store_name / dst)
  targetType: string; // 'tenant' | 'lead' | 'offline_client' — prefix action & targetType di audit log
  adminId: string;
  ipAddress?: string;
}

/** Hapus sementara satu baris. null kalau id tidak ada / sudah terhapus (operasi no-op, tidak di-log). */
export async function softDeleteOne(opts: SoftDeleteOpts & { id: string }) {
  const { db, table, nameColumn, id, targetType, adminId, ipAddress } = opts;
  const [deleted] = await db.update(table).set({ deleted_at: new Date() })
    .where(and(eq(table.id, id), isNull(table.deleted_at)))
    .returning({ id: table.id, name: nameColumn });
  if (!deleted) return null;
  await logAdminAction(db, { adminId, action: `${targetType}.deleted`, targetType, targetId: deleted.id, targetName: deleted.name, ipAddress });
  return deleted;
}

/** Pulihkan satu baris yang sudah dihapus sementara. null kalau id tidak ada / belum terhapus. */
export async function restoreOne(opts: SoftDeleteOpts & { id: string }) {
  const { db, table, nameColumn, id, targetType, adminId, ipAddress } = opts;
  const [restored] = await db.update(table).set({ deleted_at: null })
    .where(and(eq(table.id, id), isNotNull(table.deleted_at)))
    .returning({ id: table.id, name: nameColumn });
  if (!restored) return null;
  await logAdminAction(db, { adminId, action: `${targetType}.restored`, targetType, targetId: restored.id, targetName: restored.name, ipAddress });
  return restored;
}

/** Hapus sementara banyak baris sekaligus (action bar "N terpilih") — satu audit log untuk seluruh batch. */
export async function softDeleteBulk(opts: SoftDeleteOpts & { ids: string[] }) {
  const { db, table, nameColumn, ids, targetType, adminId, ipAddress } = opts;
  const rows = await db.update(table).set({ deleted_at: new Date() })
    .where(and(inArray(table.id, ids), isNull(table.deleted_at)))
    .returning({ id: table.id, name: nameColumn });
  await logAdminAction(db, {
    adminId, action: `${targetType}.bulk_deleted`, targetType,
    targetName: rows.map((r: any) => r.name).join(', '), after: { ids: rows.map((r: any) => r.id) }, ipAddress,
  });
  return rows;
}
```

- [ ] **Step 4: Jalankan test, pastikan LULUS**

Run: `cd packages/shared && pnpm exec tsx --test "src/soft-delete.test.ts"`
Expected: PASS 5/5.

- [ ] **Step 5: Barrel export**

Di `packages/shared/src/index.ts`, tambahkan:
```ts
export * from './soft-delete.js';
```

- [ ] **Step 6: Pakai di `tenants.ts`**

Ganti baris 229-274 `services/tenant-service/src/routes/admin/tenants.ts` (`/bulk-delete`, `/:id/soft`, `/:id/restore`):

```ts
  // Bulk soft-delete — dipakai action bar "N terpilih" di admin-app.
  app.post('/bulk-delete', { preHandler: adminGuard }, async (request: any) => {
    const { ids } = z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(request.body);
    const db = (app as any).db;
    const rows = await softDeleteBulk({ db, table: tenants, nameColumn: tenants.name, ids, targetType: 'tenant', adminId: (request.user as any).sub, ipAddress: request.ip });
    return { ok: true, count: rows.length };
  });

  // Bulk hard-delete — super_admin only. Konfirmasi ketik "HAPUS PERMANEN" (bukan slug per
  // tenant seperti hard-delete satuan — tidak realistis menyuruh ketik N slug sekaligus).
  app.post('/bulk-delete/hard', { preHandler: superAdminGuard }, async (request: any, reply) => {
    const { ids, confirm_text } = z.object({ ids: z.array(z.string().uuid()).min(1), confirm_text: z.string() }).parse(request.body);
    if (confirm_text !== 'HAPUS PERMANEN') {
      return reply.code(400).send({ error: 'Teks konfirmasi tidak sesuai', code: 'CONFIRM_MISMATCH' });
    }
    const db = (app as any).db;
    const rows = await db.delete(tenants).where(inArray(tenants.id, ids)).returning({ id: tenants.id, name: tenants.name });

    await logAdminAction(db, { adminId: (request.user as any).sub, action: 'tenant.bulk_hard_deleted', targetType: 'tenant', targetName: rows.map((r: any) => r.name).join(', '), after: { ids: rows.map((r: any) => r.id) }, ipAddress: request.ip });
    return { ok: true, count: rows.length };
  });

  // Hapus sementara — hilang dari daftar default, masih ada di DB, bisa dipulihkan.
  // Beda dari Terminate: ini murni visibilitas di admin panel, tidak mengubah status bisnis tenant.
  app.delete('/:id/soft', { preHandler: adminGuard }, async (request: any, reply) => {
    const db = (app as any).db;
    const deleted = await softDeleteOne({ db, table: tenants, nameColumn: tenants.name, id: request.params.id, targetType: 'tenant', adminId: (request.user as any).sub, ipAddress: request.ip });
    if (!deleted) return reply.code(404).send({ error: 'Tenant not found', code: 'NOT_FOUND' });
    return { ok: true };
  });

  app.post('/:id/restore', { preHandler: adminGuard }, async (request: any, reply) => {
    const db = (app as any).db;
    const restored = await restoreOne({ db, table: tenants, nameColumn: tenants.name, id: request.params.id, targetType: 'tenant', adminId: (request.user as any).sub, ipAddress: request.ip });
    if (!restored) return reply.code(404).send({ error: 'Tenant not found or not deleted', code: 'NOT_FOUND' });
    return { ok: true };
  });
```

`/bulk-delete/hard` **tidak diubah** — itu hard-delete, bukan soft-delete, di luar cakupan helper ini. Tambahkan import: `import { softDeleteOne, restoreOne, softDeleteBulk } from '@ipos-cloud/shared';` (gabung ke import `@ipos-cloud/shared` yang sudah ada di baris 6).

- [ ] **Step 7: Pakai di `leads.ts`**

Ganti baris 44-85 `services/tenant-service/src/routes/admin/leads.ts` (`/bulk-delete`, `/:id` DELETE, `/:id/restore`) dengan pola yang sama, `table: leads, nameColumn: leads.name, targetType: 'lead'`:

```ts
  // Bulk soft-delete — dipakai action bar "N terpilih" di admin-app. Sama semantiknya
  // dengan delete satuan, cuma banyak id sekaligus dalam satu round-trip.
  app.post('/bulk-delete', { preHandler: adminGuard }, async (request: any) => {
    const { ids } = z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(request.body);
    const db = (app as any).db;
    const rows = await softDeleteBulk({ db, table: leads, nameColumn: leads.name, ids, targetType: 'lead', adminId: (request.user as any).sub, ipAddress: request.ip });
    return { ok: true, count: rows.length };
  });

  // Bulk hard-delete — super_admin only, dipakai action bar saat user pilih "Hapus Permanen".
  app.post('/bulk-delete/hard', { preHandler: superAdminGuard }, async (request: any) => {
    const { ids } = z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(request.body);
    const db = (app as any).db;
    const rows = await db.delete(leads).where(inArray(leads.id, ids)).returning({ id: leads.id, name: leads.name });

    await logAdminAction(db, { adminId: (request.user as any).sub, action: 'lead.bulk_hard_deleted', targetType: 'lead', targetName: rows.map((r: any) => r.name).join(', '), after: { ids: rows.map((r: any) => r.id) }, ipAddress: request.ip });
    return { ok: true, count: rows.length };
  });

  // Hapus sementara — hilang dari daftar default, masih ada di DB, bisa dipulihkan.
  app.delete('/:id', { preHandler: adminGuard }, async (request: any, reply) => {
    const db = (app as any).db;
    const deleted = await softDeleteOne({ db, table: leads, nameColumn: leads.name, id: request.params.id, targetType: 'lead', adminId: (request.user as any).sub, ipAddress: request.ip });
    if (!deleted) return reply.code(404).send({ error: 'Lead not found', code: 'NOT_FOUND' });
    return { ok: true };
  });

  app.post('/:id/restore', { preHandler: adminGuard }, async (request: any, reply) => {
    const db = (app as any).db;
    const restored = await restoreOne({ db, table: leads, nameColumn: leads.name, id: request.params.id, targetType: 'lead', adminId: (request.user as any).sub, ipAddress: request.ip });
    if (!restored) return reply.code(404).send({ error: 'Lead not found or not deleted', code: 'NOT_FOUND' });
    return { ok: true };
  });
```

Tambahkan import: `import { softDeleteOne, restoreOne, softDeleteBulk } from '@ipos-cloud/shared';` (gabung ke import `@ipos-cloud/shared` di baris 5).

- [ ] **Step 8: Pakai di `offline.ts`**

Ganti baris 88-136 `services/tenant-service/src/routes/admin/offline.ts` (`/clients/bulk-delete`, `/clients/:id` DELETE, `/clients/:id/restore`) dengan pola yang sama, `table: offline_clients, nameColumn: offline_clients.store_name, targetType: 'offline_client'`:

```ts
  // Bulk soft-delete — dipakai action bar "N terpilih" di admin-app.
  app.post('/clients/bulk-delete', { preHandler: adminGuard }, async (request: any) => {
    const { ids } = z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(request.body);
    const db = (app as any).db;
    const rows = await softDeleteBulk({ db, table: offline_clients, nameColumn: offline_clients.store_name, ids, targetType: 'offline_client', adminId: (request.user as any).sub, ipAddress: request.ip });
    return { ok: true, count: rows.length };
  });

  // Bulk hard-delete — super_admin only. Client dengan riwayat lisensi dilewati (bukan bikin
  // seluruh batch gagal), sama proteksinya dengan hard-delete satuan di bawah.
  app.post('/clients/bulk-delete/hard', { preHandler: superAdminGuard }, async (request: any) => {
    const { ids } = z.object({ ids: z.array(z.string().uuid()).min(1) }).parse(request.body);
    const db = (app as any).db;

    const withLicenses = await db.selectDistinct({ id: offline_licenses.client_id }).from(offline_licenses).where(inArray(offline_licenses.client_id, ids));
    const blockedIds = new Set(withLicenses.map((r: any) => r.id));
    const deletableIds = ids.filter((id: string) => !blockedIds.has(id));

    const rows = deletableIds.length
      ? await db.delete(offline_clients).where(inArray(offline_clients.id, deletableIds)).returning({ id: offline_clients.id, store_name: offline_clients.store_name })
      : [];

    await logAdminAction(db, { adminId: (request.user as any).sub, action: 'offline_client.bulk_hard_deleted', targetType: 'offline_client', targetName: rows.map((r: any) => r.store_name).join(', '), after: { ids: rows.map((r: any) => r.id) }, ipAddress: request.ip });
    return { ok: true, count: rows.length, skipped: blockedIds.size };
  });

  // Hapus sementara — hilang dari daftar default, masih ada di DB, bisa dipulihkan.
  app.delete('/clients/:id', { preHandler: adminGuard }, async (request: any, reply) => {
    const db = (app as any).db;
    const deleted = await softDeleteOne({ db, table: offline_clients, nameColumn: offline_clients.store_name, id: request.params.id, targetType: 'offline_client', adminId: (request.user as any).sub, ipAddress: request.ip });
    if (!deleted) return reply.code(404).send({ error: 'Client not found', code: 'NOT_FOUND' });
    return { ok: true };
  });

  app.post('/clients/:id/restore', { preHandler: adminGuard }, async (request: any, reply) => {
    const db = (app as any).db;
    const restored = await restoreOne({ db, table: offline_clients, nameColumn: offline_clients.store_name, id: request.params.id, targetType: 'offline_client', adminId: (request.user as any).sub, ipAddress: request.ip });
    if (!restored) return reply.code(404).send({ error: 'Client not found or not deleted', code: 'NOT_FOUND' });
    return { ok: true };
  });
```

Tambahkan import: `import { softDeleteOne, restoreOne, softDeleteBulk } from '@ipos-cloud/shared';` (gabung ke import `@ipos-cloud/shared` di baris 5).

- [ ] **Step 9: Verifikasi tidak ada regresi**

Run: `pnpm build:packages && pnpm -r type-check`
Expected: bersih.

Run: `pnpm --filter tenant-service test && pnpm --filter @ipos-cloud/shared test`
Expected: semua PASS, tidak ada FAIL.

- [ ] **Step 10: Commit**

```bash
git add packages/shared services/tenant-service/src
git commit -m "refactor(tenant): hapus duplikasi soft-delete/restore/bulk-delete (~120 baris)

Pola identik terduplikasi 3x di tenants.ts/leads.ts/offline.ts. Diekstrak
ke packages/shared (softDeleteOne/restoreOne/softDeleteBulk) karena
generic untuk tabel apa pun berkolom id+deleted_at, dan logAdminAction
yang dipanggilnya sudah ada di sana. Hard-delete tidak disentuh — beda
semantik, di luar cakupan helper ini."
```

---

## Kriteria "selesai" Modul 3

- [ ] `pnpm -r type-check` bersih
- [ ] `pnpm --filter tenant-service test` lulus, minimal **35 test**
- [ ] `pnpm --filter @ipos-cloud/shared test` lulus, minimal **37 test** (baseline 20 + 12 dari Task 1 + 5 soft-delete dari Task 8)
- [ ] `pnpm --filter auth-service test` masih lulus, **40 test** (52 baseline − 12 dipindah ke shared)
- [ ] `grep -rn "Record<UserRole" packages services --include=*.ts | grep -v node_modules` → kosong (belum pernah ada, dipastikan tetap kosong setelah UserRole diperluas)
- [ ] Kasir dengan token tenant valid → `GET /api/v1/tenants/users` → 403 `FORBIDDEN_ROLE`
- [ ] Kasir → `PATCH /api/v1/tenants/me` → 403; owner → 200
- [ ] Tenant `status=suspended` → route apa pun yang dijaga `tenantGuard` → 403 `TENANT_SUSPENDED`
- [ ] `POST /api/v1/admin/tenants` → `tenant.owner_id` terisi di response, bukan `null`
- [ ] `GET /api/v1/admin/tenants?limit=999999` → data dibatasi maksimal 100 baris, bukan seluruh tabel

## Dependency ke modul lain

- **Modul 4 (pos/inventory/kitchen/table-service)** akan menyentuh `requireFeature` call site lain — tidak bergantung pada modul ini.
- **Modul 6 (tenant-app)** perlu tahu 4 route baru yang sekarang 403 untuk non-owner (`GET/POST /tenants/users*`, `PATCH /me`, `POST /me/logo`, `POST /me/qris`, `POST /me/test-notification`) — halaman Pengaturan > Kasir dan Pengaturan (profil/logo/QRIS/notifikasi) di tenant-app perlu menyembunyikan aksi-aksi ini untuk role selain owner, bukan cuma mengandalkan 403 dari backend. Dicatat sebagai perubahan kontrak API berikut (tambahkan ke `docs/audit-fase-1.md` sebelum Modul 6 mulai):
  - `GET/POST /api/v1/tenants/users*` dan `PATCH /api/v1/tenants/me`, `POST /api/v1/tenants/me/logo`, `POST /api/v1/tenants/me/qris`, `POST /api/v1/tenants/me/test-notification` — sekarang 403 `FORBIDDEN_ROLE` untuk role selain `owner`.
  - Semua endpoint tenant-service (bukan cuma auth-service) sekarang bisa membalas 403 `TENANT_SUSPENDED`/`TENANT_EXPIRED`/`TENANT_DELETED` di tengah sesi, bukan cuma saat login.

## Butuh keputusan Anda sebelum tenant-app disesuaikan (Modul 6)

1. **Cakupan role `owner`-only di `users.ts`/`me.ts`** — modul ini membatasi ke `owner` saja. Kalau `manager`/`outlet_manager` memang harus bisa kelola staf/profil toko juga (nama rolenya menyiratkan itu), `requireTenantRole('owner')` di kedua file tinggal diperluas jadi `requireTenantRole('owner', 'manager')` — perubahan satu baris per file, tapi keputusan produk, bukan teknis.

## Yang SENGAJA tidak dikerjakan di modul ini

- **`logAdminAction` tanpa try/catch dan di luar transaksi pemanggil** (`packages/shared/src/audit.ts:16-27`) — Modul 1 mencatat ini "ditentukan pemanggilnya di tenant-service, Modul 3", tapi Task 5 di modul ini sengaja **mempertahankan** pola yang sudah ada (log di luar transaksi, best-effort) karena itu konsisten dengan 10+ call site lain yang tidak disentuh modul ini. Mengubah kebijakan itu (gagal keras vs diam, transaksional vs tidak) berarti menyentuh semua call site sekaligus — task tersendiri.
- **`clock-in` memakai `user_id` dari body tanpa verifikasi milik tenant** (`routes/tenant/attendance.ts:28-46`) dan **`POST /transfers` tidak verifikasi outlet milik tenant** (`routes/tenant/branches.ts:69-81`) — di luar 6 area yang disepakati untuk modul ini. Root cause temuan A (tenantGuard tanpa role) tetap tertutup di file-file ini lewat Task 2; verifikasi kepemilikan tetap terbuka untuk task terpisah.
- **Seed script (`seed-demo.ts`) password hardcoded tanpa pengaman `DATABASE_URL` produksi** — script operasional, bukan jalur request; risiko berbeda kelasnya dari sisa temuan modul ini.
- **`tsconfig.json` meng-include `src/scripts/*`** sehingga `dist/scripts/reset-tenant.js` ikut ke image produksi — ini perubahan build/Dockerfile, sudah dicatat sebagai "task tersendiri" di Modul 0.
- **`billing.ts` tanpa audit/paginasi/404** dan **`GET /customers/:id/detail` N+1** — SEDANG, tidak dipanggil frontend mana pun (billing.ts) atau berdampak kecil (N+1 di endpoint jarang dipanggil); tidak termasuk 6 area yang disepakati.
- **`activate`/`suspend`/`unsuspend`/`change-plan` balas `{ok:true}` walau id tidak ada**, dan **`suspend` menimpa `tenants.notes`** — TINGGI tapi di luar 6 area yang disepakati untuk modul ini (fokusnya eskalasi privilese + integritas create-tenant + pagination + loyalty + soft-delete). Kandidat task berikutnya untuk tenant-service.
