# Modul 2 — auth-service: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tutup rantai pengambilalihan akun kasir (temuan B) dan eskalasi privilese yang melewati auth (temuan A), lalu hilangkan duplikasi di jalur penerbitan token.

**Architecture:** Urutannya ditentukan oleh ketergantungan, bukan tingkat keparahan: `trustProxy` dikerjakan lebih dulu karena **setiap** rate limit dan lockout di task berikutnya salah selama `request.ip` masih berisi IP container nginx. Setelah itu tiga task berturut-turut menutup `pin-login.ts` — file terkecil di auth-service (43 baris) tapi sumber tiga temuan KRITIS. Route diuji dengan `fastify.inject()` dan `db` palsu yang disuntikkan lewat `app.decorate('db', fakeDb)`; pola `(app as any).db` yang sudah ada justru membuat ini mungkin tanpa database hidup.

**Tech Stack:** Fastify 5, `@fastify/jwt` 10 (RS256), `@fastify/rate-limit` 11, `@fastify/cookie` 11, bcryptjs 2, Zod 3, Drizzle 0.36, `node:test` + `tsx`.

**Spec:** [docs/audit-fase-1.md](../../audit-fase-1.md) — bagian A dan B.

## Global Constraints

- **Modul 0 dan Modul 1 harus selesai lebih dulu.** Modul 0 Task 2 adalah prasyarat keamanan untuk Task 1 di sini (lihat kotak PRASYARAT di Task 1). Dari Modul 1: Task 6 memakai index `sessions_expires_at_idx`, dan seluruh repo tidak compile sampai perubahan tanda tangan `requireFeature` di Modul 1 Task 2 tuntas.
- Test memakai `node:test` + `node:assert/strict`, dijalankan `tsx --test "src/**/*.test.ts"`. **Tidak boleh menambah framework test** (tanpa vitest/jest/supertest — `fastify.inject()` sudah cukup).
- **Tidak boleh menambah dependency baru.** `ioredis` tersedia transitif lewat `@ipos-cloud/shared` (`createRedis`). `@fastify/rate-limit` sudah terpasang.
- Import antar-file memakai ekstensi `.js` (NodeNext): `from './routes/login.js'`.
- Pesan error yang dikirim ke klien tetap **Bahasa Indonesia** dan tetap generik untuk jalur autentikasi — jangan pernah membedakan "email tidak ada" dari "password salah".
- Kode `code:` pada respons error adalah kontrak dengan frontend. **Jangan mengganti string `code` yang sudah ada** (`INVALID_CREDENTIALS`, `SESSION_EXPIRED`, `INVALID_PIN`, dst). Menambah kode baru boleh.
- JWT ditandatangani RS256 dengan `expiresIn: '15m'` yang diset di `index.ts:20`. Jangan mengubah masa berlaku di modul ini.
- Setelah setiap task: `pnpm -r type-check` bersih dan `pnpm --filter auth-service test` lulus.

---

### Task 1: `trustProxy` + harness test + rate limit khusus `/login`

Tanpa `trustProxy`, `request.ip` selalu IP container nginx untuk **semua** klien. Akibatnya rate limit global 100/menit bukan per-penyerang melainkan satu ember bersama: penyerang tidak terhenti, dan begitu ia menyenggol batasnya seluruh pelanggan sah ikut terkunci. Limit ketat `/forgot-password` (5 per 15 menit) jadi jauh lebih parah — 5 permintaan dari siapa pun mengunci reset password untuk semua orang.

Ini dikerjakan pertama di modul ini karena lockout PIN di Task 4 tidak ada artinya sampai IP klien benar.

> **PRASYARAT: Modul 0 Task 2 harus sudah selesai.** `trustProxy: true` membuat Fastify mengambil entri **paling kiri** dari `X-Forwarded-For`. Selama nginx masih memakai `$proxy_add_x_forwarded_for` (yang *menambahkan* ke header kiriman klien), klien yang mengirim `X-Forwarded-For: 1.2.3.4` sendiri akan terbaca sebagai IP itu — sehingga rate limit di task ini dan lockout di Task 4 bisa dilewati dengan satu header. Itu lebih buruk daripada tidak ada perlindungan, karena memberi rasa aman palsu. Modul 0 Task 2 membuat nginx **menimpa** XFF dari `CF-Connecting-IP`, yang selalu ditimpa Cloudflare dan tidak bisa dikirim klien.
>
> Kalau Modul 0 belum selesai, **jangan lanjut** — kerjakan Modul 0 dulu.

**Files:**
- Modify: `services/auth-service/src/index.ts:9` (opsi Fastify)
- Modify: `services/auth-service/src/routes/login.ts:14` (tambah `config.rateLimit`)
- Create: `services/auth-service/src/test-support.ts`
- Create: `services/auth-service/src/routes/login.test.ts`
- Modify: `services/auth-service/package.json` (tambah script `test`)

**Interfaces:**
- Consumes: —
- Produces dari `./test-support.js`, dipakai semua task berikutnya:
  - `TEST_KEYS: { private: string; public: string }` — keypair RSA ephemeral per proses test.
  - `buildTestApp(opts: { db: unknown; redis?: unknown; routes: Array<[(app: FastifyInstance) => Promise<void>, string]> }): Promise<FastifyInstance>` — Fastify dengan cookie/jwt/rate-limit terdaftar, `db` (dan `redis` kalau diberikan) sudah di-decorate, lalu tiap route didaftarkan dengan prefix yang diberikan.
  - `fakeDb(tables: Record<string, unknown[]>): unknown` — stub Drizzle yang mendukung `select().from().where().limit()`, `insert().values()`, `update().set().where()`, `delete().where()`. Mengembalikan baris dari `tables` berdasarkan nama tabel, dan mencatat mutasi di `._writes`.

- [ ] **Step 1: Tulis harness test**

Buat `services/auth-service/src/test-support.ts`:

```ts
import { generateKeyPairSync } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';

// Keypair ephemeral — test tidak boleh bergantung pada .env atau kunci produksi.
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
export const TEST_KEYS = { private: privateKey, public: publicKey };

type Write = { op: 'insert' | 'update' | 'delete'; table: string; values?: unknown };

/**
 * Stub Drizzle secukupnya untuk route auth: rantai select/insert/update/delete
 * yang dipakai login, refresh, logout, pin-login, forgot/reset-password.
 * `tables` dikunci dengan nama tabel Postgres (mis. 'users', 'sessions').
 */
export function fakeDb(tables: Record<string, unknown[]>) {
  const writes: Write[] = [];
  // Sudah diverifikasi terhadap drizzle-orm 0.36: Symbol.for('drizzle:Name') pada objek
  // tabel mengembalikan nama tabel Postgres ('users', 'sessions', ...). `t._.name` undefined.
  const nameOf = (t: any) => String(t?.[Symbol.for('drizzle:Name')] ?? '');

  const db: any = {
    _writes: writes,
    select: (_cols?: unknown) => ({
      from: (t: any) => {
        const rows = tables[nameOf(t)] ?? [];
        const chain = {
          where: () => chain,
          limit: () => Promise.resolve(rows),
          then: (r: any, j: any) => Promise.resolve(rows).then(r, j),
        };
        return chain;
      },
    }),
    insert: (t: any) => ({
      values: (v: unknown) => {
        writes.push({ op: 'insert', table: nameOf(t), values: v });
        return {
          returning: () => Promise.resolve([v]),
          then: (r: any, j: any) => Promise.resolve([v]).then(r, j),
        };
      },
    }),
    update: (t: any) => ({
      set: (v: unknown) => {
        writes.push({ op: 'update', table: nameOf(t), values: v });
        const chain = {
          where: () => chain,
          returning: () => Promise.resolve([v]),
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
  };
  return db;
}

export async function buildTestApp(opts: {
  db: unknown;
  redis?: unknown;
  routes: Array<[(app: FastifyInstance) => Promise<void>, string]>;
}): Promise<FastifyInstance> {
  // trustProxy: true — sama seperti produksi, supaya test rate limit memakai IP klien sebenarnya.
  const app = Fastify({ logger: false, trustProxy: true });
  await app.register(cookie);
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  await app.register(jwt, {
    secret: { private: TEST_KEYS.private, public: TEST_KEYS.public },
    sign: { algorithm: 'RS256', expiresIn: '15m' },
  });
  app.decorate('db', opts.db);
  if (opts.redis) app.decorate('redis', opts.redis);
  for (const [route, prefix] of opts.routes) await app.register(route, { prefix });
  await app.ready();
  return app;
}
```

- [ ] **Step 1b: Self-test harness sebelum dipakai**

Harness ini jadi fondasi semua test di modul ini, jadi ia diuji dulu. Buat `services/auth-service/src/test-support.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { users, sessions } from '@ipos-cloud/drizzle-schema';
import { fakeDb, TEST_KEYS } from './test-support.js';

test('fakeDb mengenali nama tabel drizzle', async () => {
  const db: any = fakeDb({ users: [{ id: 'u1' }], sessions: [] });
  const rows = await db.select().from(users).where().limit();
  assert.deepEqual(rows, [{ id: 'u1' }], 'nameOf gagal memetakan tabel -> kunci `tables`');
});

test('fakeDb mencatat insert beserta nama tabelnya', async () => {
  const db: any = fakeDb({ users: [], sessions: [] });
  await db.insert(sessions).values({ user_id: 'u1' });
  assert.deepEqual(db._writes, [{ op: 'insert', table: 'sessions', values: { user_id: 'u1' } }]);
});

test('fakeDb mencatat delete', async () => {
  const db: any = fakeDb({ sessions: [] });
  await db.delete(sessions).where();
  assert.deepEqual(db._writes, [{ op: 'delete', table: 'sessions' }]);
});

test('TEST_KEYS berisi keypair RSA PEM', () => {
  assert.match(TEST_KEYS.private, /^-----BEGIN RSA PRIVATE KEY-----/);
  assert.match(TEST_KEYS.public, /^-----BEGIN PUBLIC KEY-----/);
});
```

Run: `pnpm --filter auth-service test`
Expected: PASS 4/4. Kalau test pertama gagal, harness-nya salah dan **jangan lanjut** — semua test berikutnya di modul ini akan menghasilkan false negative.

- [ ] **Step 2: Tambahkan script test**

Di `services/auth-service/package.json`, tambahkan ke `scripts`:
```json
    "test": "tsx --test \"src/**/*.test.ts\"",
```

- [ ] **Step 3: Tulis test yang gagal**

Buat `services/auth-service/src/routes/login.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { buildTestApp, fakeDb } from '../test-support.js';
import { loginRoute } from './login.js';

const PASSWORD = 'rahasia123';

async function appWithUser(over: Record<string, unknown> = {}) {
  const user = {
    id: '11111111-1111-1111-1111-111111111111',
    tenant_id: null,
    outlet_id: null,
    name: 'Owner Toko',
    email: 'owner@toko.id',
    password_hash: await bcrypt.hash(PASSWORD, 4), // cost 4: test cepat, bukan nilai produksi
    role: 'owner',
    is_active: true,
    ...over,
  };
  const db = fakeDb({ users: [user], sessions: [], tenants: [] });
  const app = await buildTestApp({ db, routes: [[loginRoute, '/api/v1/auth']] });
  return { app, db, user };
}

test('trustProxy aktif: request.ip mengambil X-Forwarded-For', async () => {
  const { app, db } = await appWithUser();
  await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    headers: { 'x-forwarded-for': '203.0.113.7' },
    payload: { email: 'owner@toko.id', password: PASSWORD },
  });
  const session = db._writes.find((w: any) => w.op === 'insert' && w.table === 'sessions');
  assert.ok(session, 'login harus menyimpan baris sessions');
  assert.equal(
    (session.values as any).ip_address,
    '203.0.113.7',
    'tanpa trustProxy, ip_address berisi IP nginx dan rate limit jadi ember global'
  );
  await app.close();
});

test('login sukses mengembalikan access_token', async () => {
  const { app } = await appWithUser();
  const res = await app.inject({
    method: 'POST', url: '/api/v1/auth/login',
    payload: { email: 'owner@toko.id', password: PASSWORD },
  });
  assert.equal(res.statusCode, 200);
  assert.ok(res.json().access_token);
  await app.close();
});

test('password salah balas 401 dengan pesan generik', async () => {
  const { app } = await appWithUser();
  const res = await app.inject({
    method: 'POST', url: '/api/v1/auth/login',
    payload: { email: 'owner@toko.id', password: 'salah-sekali' },
  });
  assert.equal(res.statusCode, 401);
  assert.equal(res.json().code, 'INVALID_CREDENTIALS');
  await app.close();
});

test('/login punya rate limit sendiri, tidak hanya limit global 100/menit', async () => {
  const { app } = await appWithUser();
  const codes: number[] = [];
  for (let i = 0; i < 12; i++) {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/auth/login',
      headers: { 'x-forwarded-for': '198.51.100.9' },
      payload: { email: 'owner@toko.id', password: 'salah-sekali' },
    });
    codes.push(res.statusCode);
  }
  assert.ok(codes.includes(429), `brute force password harus kena 429; dapat ${[...new Set(codes)].join(',')}`);
  await app.close();
});
```

- [ ] **Step 4: Jalankan test, pastikan GAGAL**

Run: `pnpm --filter auth-service test`
Expected: test `trustProxy` GAGAL (`ip_address` berisi `127.0.0.1`, bukan `203.0.113.7`) dan test rate limit GAGAL (tidak ada 429 dalam 12 percobaan).

- [ ] **Step 5: Aktifkan `trustProxy`**

Di `services/auth-service/src/index.ts`, ganti baris 9:

```ts
// trustProxy: service ini SELALU di belakang nginx (lihat nginx/nginx.conf:16-18 yang
// mengirim X-Forwarded-For). Tanpa ini request.ip = IP container nginx untuk semua
// klien, sehingga rate limit jadi satu ember global: penyerang tidak terhenti dan
// pengguna sah ikut terkunci. Juga membuat sessions.ip_address berguna.
const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info' }, trustProxy: true });
```

- [ ] **Step 6: Tambahkan rate limit khusus `/login`**

Di `services/auth-service/src/routes/login.ts`, ganti baris 14:

```ts
  app.post('/login', {
    // Lebih ketat dari limit global 100/menit: /login adalah target brute force password.
    // Sengaja lebih longgar dari forgot-password (5/15m) supaya kasir yang salah ketik
    // beberapa kali tidak langsung terkunci.
    config: { rateLimit: { max: 10, timeWindow: '5 minutes' } },
  }, async (request, reply) => {
```

- [ ] **Step 7: Jalankan test, pastikan LULUS**

Run: `pnpm --filter auth-service test`
Expected: PASS 8/8 (4 harness + 4 login).

- [ ] **Step 8: Terapkan `trustProxy` ke 9 service lain**

Masalah yang sama ada di semua service (semuanya di belakang nginx). Hanya auth-service yang memasang rate-limit hari ini, tapi `request.ip` yang salah juga merusak log. Tambahkan `trustProxy: true` ke opsi Fastify di:

`services/tenant-service/src/index.ts`, `services/pos-service/src/index.ts`, `services/catalog-service/src/index.ts`, `services/inventory-service/src/index.ts`, `services/kitchen-service/src/index.ts`, `services/table-service/src/index.ts`, `services/report-service/src/index.ts`, `services/notification-service/src/index.ts`, `services/websocket-gateway/src/index.ts`.

Run: `grep -c "trustProxy" services/*/src/index.ts`
Expected: setiap file melaporkan `1`.

- [ ] **Step 9: Type-check & commit**

Run: `pnpm -r type-check && pnpm --filter auth-service test`

```bash
git add services/auth-service services/*/src/index.ts
git commit -m "fix(auth)!: aktifkan trustProxy + rate limit khusus /login

Tanpa trustProxy, request.ip = IP container nginx untuk semua klien, jadi
rate limit bukan per-penyerang melainkan satu ember global: brute force
tidak terhenti dan 5 permintaan forgot-password dari siapa pun mengunci
reset password untuk SEMUA pengguna.

Sekaligus menambahkan harness test pertama untuk auth-service
(fastify.inject + db palsu, tanpa dependency baru)."
```

---

### Task 2: Error handler tidak lagi membocorkan internal & ZodError jadi 400

`app.setErrorHandler` memakai `error.statusCode ?? 500` dan meneruskan `error.message` mentah. `ZodError` tidak punya `statusCode`, jadi **setiap kegagalan validasi jadi HTTP 500** berisi dump isu Zod. Error Postgres membocorkan nama tabel, kolom, dan potongan nilai ke browser.

**Files:**
- Modify: `services/auth-service/src/index.ts:49-52`
- Create: `services/auth-service/src/error-handler.ts`
- Create: `services/auth-service/src/error-handler.test.ts`

**Interfaces:**
- Consumes: —
- Produces: `buildErrorHandler(log: { error: (o: unknown) => void })` mengembalikan fungsi error handler Fastify. Dipisah ke file sendiri supaya bisa diuji tanpa boot server, dan supaya 9 service lain bisa memakainya di Modul 3-4.

- [ ] **Step 1: Tulis test yang gagal**

Buat `services/auth-service/src/error-handler.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { buildErrorHandler } from './error-handler.js';

function fakeReply() {
  const sent: { code?: number; body?: any } = {};
  return { sent, code(c: number) { sent.code = c; return this; }, send(b: any) { sent.body = b; return this; } };
}
const silentLog = { error: () => {} };

test('ZodError jadi 400, bukan 500', () => {
  const handler = buildErrorHandler(silentLog);
  let err: unknown;
  try { z.object({ email: z.string().email() }).parse({ email: 'bukan-email' }); } catch (e) { err = e; }
  const reply = fakeReply();
  handler(err as any, {} as any, reply as any);
  assert.equal(reply.sent.code, 400);
  assert.equal(reply.sent.body.code, 'VALIDATION_ERROR');
});

test('ZodError menyebut field yang salah, tanpa dump isu mentah', () => {
  const handler = buildErrorHandler(silentLog);
  let err: unknown;
  try { z.object({ email: z.string().email() }).parse({ email: 'x' }); } catch (e) { err = e; }
  const reply = fakeReply();
  handler(err as any, {} as any, reply as any);
  assert.match(reply.sent.body.error, /email/);
  assert.equal(reply.sent.body.issues, undefined, 'jangan kirim array issues Zod ke klien');
});

test('error tanpa statusCode jadi 500 dengan pesan generik', () => {
  const handler = buildErrorHandler(silentLog);
  const pgErr = Object.assign(new Error('duplicate key value violates unique constraint "users_email_unique"'), {
    code: '23505',
  });
  const reply = fakeReply();
  handler(pgErr as any, {} as any, reply as any);
  assert.equal(reply.sent.code, 500);
  assert.equal(reply.sent.body.code, 'INTERNAL_ERROR');
  assert.doesNotMatch(reply.sent.body.error, /users_email_unique|duplicate key/,
    'nama constraint Postgres tidak boleh bocor ke klien');
});

test('error dengan statusCode 4xx tetap meneruskan pesannya', () => {
  const handler = buildErrorHandler(silentLog);
  const err = Object.assign(new Error('Terlalu banyak percobaan'), { statusCode: 429, code: 'RATE_LIMITED' });
  const reply = fakeReply();
  handler(err as any, {} as any, reply as any);
  assert.equal(reply.sent.code, 429);
  assert.equal(reply.sent.body.error, 'Terlalu banyak percobaan');
  assert.equal(reply.sent.body.code, 'RATE_LIMITED');
});

test('error 5xx dengan statusCode tetap disembunyikan', () => {
  const handler = buildErrorHandler(silentLog);
  const err = Object.assign(new Error('ECONNREFUSED 10.0.0.5:5432'), { statusCode: 503 });
  const reply = fakeReply();
  handler(err as any, {} as any, reply as any);
  assert.equal(reply.sent.code, 503);
  assert.doesNotMatch(reply.sent.body.error, /10\.0\.0\.5/, 'alamat internal tidak boleh bocor');
});

test('error tetap di-log lengkap walau respons disamarkan', () => {
  const logged: unknown[] = [];
  const handler = buildErrorHandler({ error: (o) => logged.push(o) });
  handler(new Error('rahasia internal') as any, {} as any, fakeReply() as any);
  assert.equal(logged.length, 1, 'operator tetap butuh detailnya di log');
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `pnpm --filter auth-service test`
Expected: FAIL — `Cannot find module './error-handler.js'`.

- [ ] **Step 3: Implementasi**

Buat `services/auth-service/src/error-handler.ts`:

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

- [ ] **Step 4: Pakai di `index.ts`**

Ganti baris 49-52 `services/auth-service/src/index.ts` dengan:

```ts
import { buildErrorHandler } from './error-handler.js';
app.setErrorHandler(buildErrorHandler(app.log));
```

Pindahkan `import` itu ke blok import di atas file bersama import lain (baris 31-38 saat ini menaruh import di tengah file; rapikan sekalian dengan memindahkan seluruh blok itu ke atas, karena hoisting membuat urutan baca file menipu).

- [ ] **Step 5: Jalankan test, pastikan LULUS**

Run: `pnpm --filter auth-service test`
Expected: PASS 14/14 (4 harness + 4 login + 6 error-handler).

- [ ] **Step 6: Commit**

```bash
git add services/auth-service/src
git commit -m "fix(auth): ZodError jadi 400 dan berhenti membocorkan error internal

ZodError tidak punya statusCode, jadi setiap kegagalan validasi sebelumnya
jadi HTTP 500 berisi dump isu Zod. Error Postgres juga meneruskan nama
constraint dan kolom ke browser. Detail tetap masuk log, tidak ke klien."
```

---

### Task 3: `GET /pin-login/staff` tidak lagi publik

Endpoint ini tanpa autentikasi dan mengambil `tenant_id` mentah dari query string. Ia mengembalikan `id`, `name`, dan `role` seluruh staf aktif yang punya PIN. Digabung dengan `tenant_id` yang bocor dari `GET /api/v1/tables/qr/:qr_token` dan `GET /api/v1/menus/public/:qr_token`, siapa pun yang memotret QR meja bisa memanen daftar staf beserta `user_id`-nya — bahan langsung untuk brute force di Task 4.

**Keputusan desain:** endpoint tetap ada tapi **wajib JWT valid**, dan `tenant_id` diambil dari klaim token, bukan query string. Fitur "ganti kasir" tetap jalan karena perangkat POS sudah punya sesi dari kasir sebelumnya. Efek sampingnya: `tenant_id` berhenti muncul di URL, riwayat browser, dan header `Referer`.

**Files:**
- Modify: `services/auth-service/src/routes/pin-login.ts:11-18`
- Create: `services/auth-service/src/routes/pin-login.test.ts`

**Interfaces:**
- Consumes: `buildTestApp`, `fakeDb`, `TEST_KEYS` dari Task 1.
- Produces: `GET /api/v1/auth/pin-login/staff` tanpa parameter query, butuh header `Authorization: Bearer <jwt>`. Respons tetap `{ data: Array<{ id, name, role }> }` — bentuknya tidak berubah, jadi frontend hanya perlu berhenti mengirim `?tenant_id=`.

- [ ] **Step 1: Tulis test yang gagal**

Buat `services/auth-service/src/routes/pin-login.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTestApp, fakeDb } from '../test-support.js';
import { pinLoginRoutes } from './pin-login.js';

const TENANT = '22222222-2222-2222-2222-222222222222';
const STAFF = {
  id: '33333333-3333-3333-3333-333333333333',
  tenant_id: TENANT,
  outlet_id: null,
  name: 'Kasir Siti',
  role: 'cashier',
  is_active: true,
  pin_hash: '$2a$04$abcdefghijklmnopqrstuv',
};

async function build() {
  const db = fakeDb({ users: [STAFF], tenants: [{ id: TENANT, plan_code: 'resto_pro' }], sessions: [] });
  const app = await buildTestApp({ db, routes: [[pinLoginRoutes, '/api/v1/auth']] });
  const token = app.jwt.sign({ sub: STAFF.id, tenant_id: TENANT, role: 'cashier', plan: 'resto_pro', outlet_id: null });
  return { app, db, token };
}

test('daftar staf TANPA token balas 401', async () => {
  const { app } = await build();
  const res = await app.inject({ method: 'GET', url: '/api/v1/auth/pin-login/staff' });
  assert.equal(res.statusCode, 401, 'endpoint ini membocorkan seluruh daftar staf kalau publik');
  await app.close();
});

test('tenant_id dari query string TIDAK dipercaya', async () => {
  const { app } = await build();
  const res = await app.inject({
    method: 'GET',
    url: `/api/v1/auth/pin-login/staff?tenant_id=99999999-9999-9999-9999-999999999999`,
  });
  assert.equal(res.statusCode, 401, 'tanpa token harus 401 apa pun isi query');
  await app.close();
});

test('daftar staf DENGAN token valid balas data', async () => {
  const { app, token } = await build();
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/auth/pin-login/staff',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.data.length, 1);
  assert.equal(body.data[0].name, 'Kasir Siti');
  await app.close();
});

test('respons daftar staf tidak memuat pin_hash atau email', async () => {
  const { app, token } = await build();
  const res = await app.inject({
    method: 'GET', url: '/api/v1/auth/pin-login/staff',
    headers: { authorization: `Bearer ${token}` },
  });
  const row = res.json().data[0];
  assert.equal(row.pin_hash, undefined);
  assert.equal(row.email, undefined);
  await app.close();
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `pnpm --filter auth-service test`
Expected: dua test pertama FAIL dengan `200 !== 401`.

- [ ] **Step 3: Implementasi**

Ganti baris 10-18 `services/auth-service/src/routes/pin-login.ts`:

```ts
  // Daftar nama staff yang punya PIN aktif, buat picker "pilih nama" — tanpa password/email.
  // WAJIB token: sebelumnya endpoint ini publik dan tenant_id diambil dari query string,
  // sehingga siapa pun yang punya tenant_id (bocor dari endpoint QR publik) bisa memanen
  // seluruh daftar staf + user_id-nya. tenant_id sekarang HANYA dari klaim token.
  app.get('/pin-login/staff', {
    preHandler: async (request, reply) => {
      try {
        await request.jwtVerify();
      } catch {
        return reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
      }
    },
  }, async (request, reply) => {
    const { tenant_id } = request.user as { tenant_id: string | null };
    if (!tenant_id) {
      return reply.code(403).send({ error: 'Akun ini tidak terikat ke tenant', code: 'NOT_A_TENANT_USER' });
    }
    const db = (app as any).db;
    const rows = await db.select({ id: users.id, name: users.name, role: users.role })
      .from(users)
      .where(and(eq(users.tenant_id, tenant_id), isNotNull(users.pin_hash), eq(users.is_active, true)));
    return { data: rows };
  });
```

Hapus `z` dari import kalau sudah tidak dipakai di baris itu — `z` masih dipakai `POST /pin-login` di bawahnya, jadi **biarkan import-nya**.

- [ ] **Step 4: Jalankan test, pastikan LULUS**

Run: `pnpm --filter auth-service test`
Expected: PASS 18/18.

- [ ] **Step 5: Catat perubahan kontrak untuk Modul 6**

Tambahkan ke akhir `docs/audit-fase-1.md` di bagian baru:

```markdown
## Perubahan kontrak API dari Fase 3

- `GET /api/v1/auth/pin-login/staff` — sekarang butuh `Authorization: Bearer <jwt>`
  dan TIDAK lagi menerima `?tenant_id=`. Frontend: `apps/tenant-app/app/pin-login/page.tsx:45`
  harus mengirim token dari `getToken()` dan berhenti membaca `tenant_id` dari query.
  Dikerjakan di Modul 6.
```

- [ ] **Step 6: Commit**

```bash
git add services/auth-service/src docs/audit-fase-1.md
git commit -m "fix(auth)!: GET /pin-login/staff wajib JWT, tenant_id dari klaim bukan query

Endpoint ini publik dan mengembalikan id+nama+role seluruh staf aktif.
Digabung dengan tenant_id yang bocor dari endpoint QR publik, siapa pun
yang memotret QR meja bisa memanen daftar staf beserta user_id-nya.

BREAKING: tenant-app/app/pin-login/page.tsx harus kirim Bearer token
dan berhenti mengirim ?tenant_id= (dikerjakan di Modul 6)."
```

---

### Task 4: Lockout percobaan PIN

PIN hanya 4 digit — 10.000 kombinasi. `POST /pin-login` tidak punya rate limit endpoint, tidak menghitung percobaan, dan tidak punya lockout. Setelah Task 3, `user_id` tidak lagi gratis, tapi itu menaikkan biaya serangan, bukan menutupnya: penyerang yang punya akun kasir sah tetap bisa menebak PIN rekannya.

Penghitung disimpan di Redis (`INCR` + `EXPIRE`). `REDIS_URL` sudah diberikan ke auth-service di `docker-compose.yml:25` tapi belum dipakai, dan `createRedis` tersedia dari `@ipos-cloud/shared` — jadi tidak ada dependency maupun env baru.

**Files:**
- Modify: `services/auth-service/src/index.ts` (buat & decorate redis)
- Modify: `services/auth-service/src/routes/pin-login.ts:20-42`
- Create: `services/auth-service/src/pin-attempts.ts`
- Create: `services/auth-service/src/pin-attempts.test.ts`
- Modify: `services/auth-service/src/routes/pin-login.test.ts` (tambah test lockout)

**Interfaces:**
- Consumes: `createRedis` dari `@ipos-cloud/shared`.
- Produces dari `./pin-attempts.js`:
  - `MAX_PIN_ATTEMPTS = 5`
  - `PIN_LOCKOUT_SECONDS = 900`
  - `registerFailedPin(redis: RedisLike, userId: string): Promise<number>` — mengembalikan jumlah percobaan gagal setelah increment.
  - `isPinLocked(redis: RedisLike, userId: string): Promise<boolean>`
  - `clearPinAttempts(redis: RedisLike, userId: string): Promise<void>`
  - `type RedisLike = { incr(k: string): Promise<number>; expire(k: string, s: number): Promise<unknown>; get(k: string): Promise<string | null>; del(k: string): Promise<unknown> }`

- [ ] **Step 1: Tulis test yang gagal untuk penghitungnya**

Buat `services/auth-service/src/pin-attempts.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PIN_ATTEMPTS, registerFailedPin, isPinLocked, clearPinAttempts,
} from './pin-attempts.js';

// Redis palsu in-memory: cukup incr/expire/get/del.
function fakeRedis() {
  const store = new Map<string, number>();
  const ttl = new Map<string, number>();
  return {
    store, ttl,
    async incr(k: string) { const v = (store.get(k) ?? 0) + 1; store.set(k, v); return v; },
    async expire(k: string, s: number) { ttl.set(k, s); return 1; },
    async get(k: string) { const v = store.get(k); return v === undefined ? null : String(v); },
    async del(k: string) { store.delete(k); ttl.delete(k); return 1; },
  };
}

test('belum terkunci saat nol percobaan', async () => {
  assert.equal(await isPinLocked(fakeRedis(), 'u1'), false);
});

test('terkunci setelah MAX_PIN_ATTEMPTS percobaan gagal', async () => {
  const r = fakeRedis();
  for (let i = 0; i < MAX_PIN_ATTEMPTS; i++) await registerFailedPin(r, 'u1');
  assert.equal(await isPinLocked(r, 'u1'), true);
});

test('belum terkunci satu percobaan sebelum batas', async () => {
  const r = fakeRedis();
  for (let i = 0; i < MAX_PIN_ATTEMPTS - 1; i++) await registerFailedPin(r, 'u1');
  assert.equal(await isPinLocked(r, 'u1'), false);
});

test('kunci selalu diberi TTL — lockout tidak boleh permanen', async () => {
  const r = fakeRedis();
  await registerFailedPin(r, 'u1');
  assert.equal(r.ttl.size, 1, 'tanpa EXPIRE, kasir terkunci selamanya sampai Redis dibersihkan manual');
});

test('lockout terpisah per user', async () => {
  const r = fakeRedis();
  for (let i = 0; i < MAX_PIN_ATTEMPTS; i++) await registerFailedPin(r, 'u1');
  assert.equal(await isPinLocked(r, 'u2'), false, 'satu kasir salah PIN tidak boleh mengunci kasir lain');
});

test('PIN benar menghapus penghitung', async () => {
  const r = fakeRedis();
  for (let i = 0; i < MAX_PIN_ATTEMPTS; i++) await registerFailedPin(r, 'u1');
  await clearPinAttempts(r, 'u1');
  assert.equal(await isPinLocked(r, 'u1'), false);
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `pnpm --filter auth-service test`
Expected: FAIL — `Cannot find module './pin-attempts.js'`.

- [ ] **Step 3: Implementasi penghitung**

Buat `services/auth-service/src/pin-attempts.ts`:

```ts
export const MAX_PIN_ATTEMPTS = 5;
export const PIN_LOCKOUT_SECONDS = 900; // 15 menit

export type RedisLike = {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<unknown>;
};

// Dikunci per user_id, BUKAN per IP: beberapa kasir berbagi satu perangkat & satu IP,
// jadi kunci per-IP akan mengunci seluruh toko begitu satu orang salah ketik.
const key = (userId: string) => `pin:fail:${userId}`;

/** Naikkan penghitung gagal dan pastikan TTL selalu terpasang. Mengembalikan jumlah gagal terkini. */
export async function registerFailedPin(redis: RedisLike, userId: string): Promise<number> {
  const k = key(userId);
  const count = await redis.incr(k);
  // EXPIRE di-set tiap kali (bukan cuma saat count === 1): lockout memanjang selama
  // penyerang terus mencoba, dan kasir yang berhenti mencoba pulih otomatis.
  await redis.expire(k, PIN_LOCKOUT_SECONDS);
  return count;
}

export async function isPinLocked(redis: RedisLike, userId: string): Promise<boolean> {
  const raw = await redis.get(key(userId));
  return raw !== null && Number(raw) >= MAX_PIN_ATTEMPTS;
}

export async function clearPinAttempts(redis: RedisLike, userId: string): Promise<void> {
  await redis.del(key(userId));
}
```

- [ ] **Step 4: Jalankan test, pastikan LULUS**

Run: `pnpm --filter auth-service test`
Expected: PASS 24/24.

- [ ] **Step 5: Buat & decorate redis di `index.ts`**

Di `services/auth-service/src/index.ts`, tambahkan ke blok import: `createRedis` ke import `@ipos-cloud/shared` yang sudah ada. Setelah `app.decorate('db', db)` (baris 26), tambahkan:

```ts
// REDIS_URL sudah diberikan ke service ini di docker-compose.yml:25 tapi sebelumnya
// tidak dipakai. Sekarang jadi tempat penghitung percobaan PIN (lihat pin-attempts.ts).
const redis = createRedis(process.env.REDIS_URL || 'redis://localhost:6379', (err) =>
  app.log.error({ err: err.message }, 'redis error')
);
app.decorate('redis', redis);
```

- [ ] **Step 6: Tambahkan test lockout di `pin-login.test.ts`**

Tambahkan di akhir file, dan ubah helper `build()` agar menerima redis palsu:

```ts
import bcrypt from 'bcryptjs';
import { MAX_PIN_ATTEMPTS } from '../pin-attempts.js';

function fakeRedisForApp() {
  const store = new Map<string, number>();
  return {
    async incr(k: string) { const v = (store.get(k) ?? 0) + 1; store.set(k, v); return v; },
    async expire() { return 1; },
    async get(k: string) { const v = store.get(k); return v === undefined ? null : String(v); },
    async del(k: string) { store.delete(k); return 1; },
  };
}

test('PIN salah berulang mengunci akun', async () => {
  const pin_hash = await bcrypt.hash('1234', 4);
  const db = fakeDb({
    users: [{ ...STAFF, pin_hash }],
    tenants: [{ id: TENANT, plan_code: 'resto_pro' }],
    sessions: [],
  });
  const app = await buildTestApp({ db, redis: fakeRedisForApp(), routes: [[pinLoginRoutes, '/api/v1/auth']] });
  const body = { tenant_id: TENANT, user_id: STAFF.id, pin: '9999' };

  for (let i = 0; i < MAX_PIN_ATTEMPTS; i++) {
    const res = await app.inject({ method: 'POST', url: '/api/v1/auth/pin-login', payload: body });
    assert.equal(res.statusCode, 401, `percobaan ke-${i + 1} harus 401`);
  }
  const locked = await app.inject({ method: 'POST', url: '/api/v1/auth/pin-login', payload: body });
  assert.equal(locked.statusCode, 429);
  assert.equal(locked.json().code, 'PIN_LOCKED');

  // PIN yang BENAR pun harus ditolak selama terkunci.
  const correct = await app.inject({
    method: 'POST', url: '/api/v1/auth/pin-login',
    payload: { ...body, pin: '1234' },
  });
  assert.equal(correct.statusCode, 429, 'lockout harus berlaku walau PIN-nya benar');
  await app.close();
});
```

- [ ] **Step 7: Jalankan test, pastikan GAGAL**

Run: `pnpm --filter auth-service test`
Expected: test lockout FAIL — percobaan ke-6 masih 401, bukan 429.

- [ ] **Step 8: Terapkan lockout di route**

Di `services/auth-service/src/routes/pin-login.ts`, ganti handler `POST /pin-login` (baris 20-42). Tambahkan import:

```ts
import { MAX_PIN_ATTEMPTS, isPinLocked, registerFailedPin, clearPinAttempts } from '../pin-attempts.js';
```

Lalu sisipkan pemeriksaan sebelum dan sesudah verifikasi PIN:

```ts
  app.post('/pin-login', {
    // Lapis kedua di atas lockout per-user: membatasi laju dari satu sumber jaringan.
    config: { rateLimit: { max: 20, timeWindow: '5 minutes' } },
  }, async (request: any, reply) => {
    const body = z.object({
      tenant_id: z.string().uuid(),
      user_id: z.string().uuid(),
      pin: z.string().regex(/^\d{4}$/),
    }).parse(request.body);
    const db = (app as any).db;
    const redis = (app as any).redis;

    // Dicek SEBELUM bcrypt.compare: akun terkunci tidak boleh bisa dites sama sekali,
    // walau PIN-nya kebetulan benar.
    if (await isPinLocked(redis, body.user_id)) {
      return reply.code(429).send({
        error: `PIN terkunci setelah ${MAX_PIN_ATTEMPTS} percobaan gagal. Coba lagi 15 menit lagi atau minta owner reset PIN.`,
        code: 'PIN_LOCKED',
      });
    }

    const [user] = await db.select().from(users)
      .where(and(eq(users.id, body.user_id), eq(users.tenant_id, body.tenant_id), eq(users.is_active, true)))
      .limit(1);

    if (!user?.pin_hash || !(await bcrypt.compare(body.pin, user.pin_hash))) {
      await registerFailedPin(redis, body.user_id);
      return reply.code(401).send({ error: 'PIN salah', code: 'INVALID_PIN' });
    }

    await clearPinAttempts(redis, body.user_id);
    // ... lanjut ke penerbitan token (diubah lagi di Task 5) ...
```

- [ ] **Step 9: Jalankan test, pastikan LULUS**

Run: `pnpm --filter auth-service test`
Expected: PASS 25/25.

- [ ] **Step 10: Commit**

```bash
git add services/auth-service/src
git commit -m "fix(auth): lockout 5 percobaan untuk PIN 4 digit

PIN 4 digit = 10.000 kombinasi, tanpa lockout, tanpa rate limit endpoint.
Penghitung disimpan per user_id di Redis (bukan per IP — beberapa kasir
berbagi satu perangkat), dengan TTL supaya lockout tidak permanen.
REDIS_URL sudah diberikan ke service ini di compose tapi belum dipakai."
```

---

### Task 5: PIN-login membuat sesi dan mengganti cookie refresh

`POST /pin-login` menerbitkan access token tapi **tidak** membuat baris `sessions` dan **tidak** menyentuh cookie `refresh_token`. Cookie kasir sebelumnya tetap utuh, jadi setelah access token 15 menit habis, `POST /refresh` mengembalikan identitas **kasir lama**. Di mesin POS bersama, transaksi berikutnya tercatat atas nama orang yang salah — diam-diam, tanpa error.

**Files:**
- Modify: `services/auth-service/src/routes/pin-login.ts` (bagian penerbitan token)
- Modify: `services/auth-service/src/routes/pin-login.test.ts` (tambah test)

**Interfaces:**
- Consumes: `buildTestApp`, `fakeDb` dari Task 1; `MAX_PIN_ATTEMPTS` dkk dari Task 4.
- Produces: `POST /api/v1/auth/pin-login` sekarang men-`Set-Cookie: refresh_token=...`, menghapus baris `sessions` milik cookie lama, dan menyisipkan satu baris `sessions` baru. Bentuk respons JSON tidak berubah.

Blok pembuatan sesi ini sengaja ditulis **inline** dan sengaja menduplikasi `login.ts:49-65`. Task 7 menyatukan lookup tenant, payload JWT, dan `expires_in` — tapi **tidak** menyatukan pembuatan sesi, karena `login` dan `pin-login` punya perilaku berbeda (pin-login mencabut sesi sebelumnya di perangkat yang sama, login tidak). Menyatukannya akan butuh flag, dan flag untuk satu perbedaan perilaku lebih buruk daripada dua blok yang jujur. Kalau kelak ada pemanggil ketiga, baru ekstraksi itu berbayar.

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan di `services/auth-service/src/routes/pin-login.test.ts`:

```ts
test('pin-login membuat baris sessions dan mengganti cookie refresh_token', async () => {
  const pin_hash = await bcrypt.hash('1234', 4);
  const db = fakeDb({
    users: [{ ...STAFF, pin_hash }],
    tenants: [{ id: TENANT, plan_code: 'resto_pro' }],
    sessions: [],
  });
  const app = await buildTestApp({ db, redis: fakeRedisForApp(), routes: [[pinLoginRoutes, '/api/v1/auth']] });

  const res = await app.inject({
    method: 'POST', url: '/api/v1/auth/pin-login',
    // Cookie kasir SEBELUMNYA masih terpasang di perangkat.
    headers: { cookie: 'refresh_token=token-kasir-lama' },
    payload: { tenant_id: TENANT, user_id: STAFF.id, pin: '1234' },
  });

  assert.equal(res.statusCode, 200);

  const inserted = db._writes.find((w: any) => w.op === 'insert' && w.table === 'sessions');
  assert.ok(inserted, 'pin-login harus membuat baris sessions untuk kasir baru');
  assert.equal((inserted.values as any).user_id, STAFF.id);

  const setCookie = String(res.headers['set-cookie'] ?? '');
  assert.match(setCookie, /refresh_token=/, 'cookie refresh harus diganti');
  assert.doesNotMatch(setCookie, /token-kasir-lama/,
    'cookie kasir lama harus tergantikan, kalau tidak /refresh akan memulihkan identitas kasir sebelumnya');
  await app.close();
});

test('pin-login menghapus sesi kasir sebelumnya di perangkat yang sama', async () => {
  const pin_hash = await bcrypt.hash('1234', 4);
  const db = fakeDb({
    users: [{ ...STAFF, pin_hash }],
    tenants: [{ id: TENANT, plan_code: 'resto_pro' }],
    sessions: [],
  });
  const app = await buildTestApp({ db, redis: fakeRedisForApp(), routes: [[pinLoginRoutes, '/api/v1/auth']] });
  await app.inject({
    method: 'POST', url: '/api/v1/auth/pin-login',
    headers: { cookie: 'refresh_token=token-kasir-lama' },
    payload: { tenant_id: TENANT, user_id: STAFF.id, pin: '1234' },
  });
  const deleted = db._writes.find((w: any) => w.op === 'delete' && w.table === 'sessions');
  assert.ok(deleted, 'sesi kasir lama di perangkat ini harus dicabut, bukan dibiarkan hidup 30 hari');
  await app.close();
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `pnpm --filter auth-service test`
Expected: dua test baru FAIL — tidak ada insert `sessions` dan tidak ada `set-cookie`.

- [ ] **Step 3: Implementasi**

Di `services/auth-service/src/routes/pin-login.ts`, tambahkan `sessions` ke import dari `@ipos-cloud/drizzle-schema`, lalu ganti bagian penerbitan token (baris 35-41 versi lama) dengan:

```ts
    const [tenant] = await db.select({ plan_code: tenants.plan_code }).from(tenants)
      .where(eq(tenants.id, body.tenant_id)).limit(1);

    const token = app.jwt.sign({
      sub: user.id, tenant_id: body.tenant_id, role: user.role,
      plan: tenant?.plan_code ?? null, outlet_id: user.outlet_id ?? null,
    });

    // Ganti kasir HARUS mengganti sesi, bukan cuma menerbitkan access token baru.
    // Sebelumnya cookie refresh_token kasir lama dibiarkan utuh, jadi setelah 15 menit
    // /refresh mengembalikan identitas kasir SEBELUMNYA dan transaksi tercatat atas
    // nama orang yang salah.
    const previous = request.cookies.refresh_token;
    if (previous) {
      await db.delete(sessions).where(eq(sessions.refresh_token, previous));
    }

    const refresh_token = crypto.randomUUID();
    const expires_at = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await db.insert(sessions).values({
      user_id: user.id,
      refresh_token,
      expires_at,
      ip_address: request.ip,
      user_agent: request.headers['user-agent'],
    });

    reply.setCookie('refresh_token', refresh_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      expires: expires_at,
    });

    return { access_token: token, expires_in: 900, user: { id: user.id, name: user.name, role: user.role } };
```

`crypto.randomUUID()` tersedia sebagai global di Node 22 — tidak perlu import, sama seperti di `login.ts:49`.

- [ ] **Step 4: Jalankan test, pastikan LULUS**

Run: `pnpm --filter auth-service test`
Expected: PASS 27/27.

- [ ] **Step 5: Commit**

```bash
git add services/auth-service/src
git commit -m "fix(auth): pin-login bikin sesi baru & cabut sesi kasir sebelumnya

pin-login menerbitkan access token tanpa menyentuh sessions maupun cookie
refresh_token. Akibatnya setelah 15 menit, /refresh memulihkan identitas
kasir SEBELUMNYA dan transaksi tercatat atas nama orang yang salah."
```

---

### Task 6: Reset password mencabut sesi & token reset lain

Setelah korban mengganti password, penyerang yang sudah memegang `refresh_token` tetap punya akses **30 hari**. Selain itu `forgot-password` tidak membatalkan token reset yang masih hidup, jadi beberapa link reset valid bersamaan selama 1 jam.

**Files:**
- Modify: `services/auth-service/src/routes/reset-password.ts:31-35`
- Modify: `services/auth-service/src/routes/forgot-password.ts:36-41`
- Create: `services/auth-service/src/routes/reset-password.test.ts`

**Interfaces:**
- Consumes: `buildTestApp`, `fakeDb`.
- Produces: tidak ada API baru. Respons `{ ok: true }` tidak berubah.

- [ ] **Step 1: Tulis test yang gagal**

Buat `services/auth-service/src/routes/reset-password.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { buildTestApp, fakeDb } from '../test-support.js';
import { resetPasswordRoute } from './reset-password.js';

const USER_ID = '44444444-4444-4444-4444-444444444444';
const TOKEN = 'token-reset-mentah';
const tokenHash = crypto.createHash('sha256').update(TOKEN).digest('hex');

async function build() {
  const db = fakeDb({
    password_reset_tokens: [{
      id: '55555555-5555-5555-5555-555555555555',
      user_id: USER_ID,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 3600_000),
      used_at: null,
    }],
    users: [{ id: USER_ID }],
    sessions: [],
  });
  const app = await buildTestApp({ db, routes: [[resetPasswordRoute, '/api/v1/auth']] });
  return { app, db };
}

test('reset password sukses balas ok', async () => {
  const { app } = await build();
  const res = await app.inject({
    method: 'POST', url: '/api/v1/auth/reset-password',
    payload: { token: TOKEN, password: 'passwordbaru123' },
  });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().ok, true);
  await app.close();
});

test('reset password MENCABUT semua sesi aktif user', async () => {
  const { app, db } = await build();
  await app.inject({
    method: 'POST', url: '/api/v1/auth/reset-password',
    payload: { token: TOKEN, password: 'passwordbaru123' },
  });
  const deleted = db._writes.find((w: any) => w.op === 'delete' && w.table === 'sessions');
  assert.ok(deleted,
    'tanpa ini, penyerang yang sudah punya refresh_token tetap punya akses 30 hari setelah korban ganti password');
  await app.close();
});

test('reset password menandai token terpakai', async () => {
  const { app, db } = await build();
  await app.inject({
    method: 'POST', url: '/api/v1/auth/reset-password',
    payload: { token: TOKEN, password: 'passwordbaru123' },
  });
  const used = db._writes.find(
    (w: any) => w.op === 'update' && w.table === 'password_reset_tokens' && (w.values as any).used_at
  );
  assert.ok(used, 'token reset harus sekali pakai');
  await app.close();
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `pnpm --filter auth-service test`
Expected: test "MENCABUT semua sesi aktif" FAIL — tidak ada delete pada `sessions`.

- [ ] **Step 3: Implementasi di `reset-password.ts`**

Tambahkan `sessions` ke import `@ipos-cloud/drizzle-schema`, lalu ganti baris 31-35:

```ts
    const password_hash = await bcrypt.hash(password, 10);
    await db.update(users).set({ password_hash, updated_at: new Date() }).where(eq(users.id, row.user_id));
    await db.update(password_reset_tokens).set({ used_at: new Date() }).where(eq(password_reset_tokens.id, row.id));

    // Ganti password HARUS mencabut sesi yang sudah ada. Tanpa ini, penyerang yang
    // sudah memegang refresh_token tetap punya akses 30 hari walau korban sudah
    // mengganti passwordnya — justru skenario yang membuat orang mereset password.
    await db.delete(sessions).where(eq(sessions.user_id, row.user_id));

    return { ok: true };
```

- [ ] **Step 4: Batalkan token reset lain di `forgot-password.ts`**

Ganti baris 36-38 `services/auth-service/src/routes/forgot-password.ts`:

```ts
      const token = crypto.randomBytes(32).toString('base64url');
      const expires_at = new Date(Date.now() + 60 * 60 * 1000); // 1 jam

      // Batalkan token reset yang masih hidup sebelum menerbitkan yang baru — kalau tidak,
      // beberapa link reset valid bersamaan dan link lama yang bocor tetap bisa dipakai.
      await db.update(password_reset_tokens)
        .set({ used_at: new Date() })
        .where(and(eq(password_reset_tokens.user_id, user.id), isNull(password_reset_tokens.used_at)));

      await db.insert(password_reset_tokens).values({ user_id: user.id, token_hash: hashToken(token), expires_at });
```

Tambahkan `and` dan `isNull` ke import `drizzle-orm` di baris 4 (`import { eq, and, isNull } from 'drizzle-orm';`).

- [ ] **Step 5: Beri log saat pengiriman email reset gagal**

`catch {}` kosong di baris 21-23 membuat notification-service yang mati jadi tak terdeteksi. Ubah `sendResetEmail` agar menerima logger:

```ts
async function sendResetEmail(log: { warn: (o: unknown, m: string) => void }, vars: { name: string; email: string; reset_url: string }) {
  const url = process.env.NOTIFICATION_SERVICE_URL;
  if (!url || !process.env.INTERNAL_API_KEY) {
    log.warn({}, 'NOTIFICATION_SERVICE_URL/INTERNAL_API_KEY belum diset — email reset tidak dikirim');
    return;
  }
  try {
    const res = await fetch(`${url}/api/v1/notify/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-internal-api-key': process.env.INTERNAL_API_KEY },
      body: JSON.stringify({ template_key: 'password.reset', to: vars.email, vars }),
      signal: AbortSignal.timeout(5000),
    });
    // Respons TETAP { ok: true } ke klien apa pun hasilnya — jangan bocorkan keberadaan akun.
    // Tapi operator wajib tahu kalau pengiriman gagal.
    if (!res.ok) log.warn({ status: res.status }, 'notification-service menolak email reset password');
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'gagal memanggil notification-service untuk email reset');
  }
}
```

Perbarui pemanggilnya di baris 41: `await sendResetEmail(app.log, { name: user.name, email: user.email, reset_url: ... });`

- [ ] **Step 6: Jalankan test, pastikan LULUS**

Run: `pnpm --filter auth-service test`
Expected: PASS 30/30.

- [ ] **Step 7: Commit**

```bash
git add services/auth-service/src
git commit -m "fix(auth): reset password cabut semua sesi + batalkan token reset lain

Penyerang yang sudah memegang refresh_token tetap punya akses 30 hari
setelah korban ganti password — justru skenario yang membuat orang
mereset password. Sekaligus: kegagalan kirim email reset sekarang di-log
(respons ke klien tetap { ok: true } agar tidak membocorkan akun)."
```

---

### Task 7: Helper bersama — status tenant, payload JWT, `expires_in`

Empat duplikasi di jalur penerbitan token, dan satu lubang yang muncul justru karena duplikasi itu:

- Lookup plan tenant disalin 3× (`login.ts:32-36`, `refresh.ts:26-30`, `pin-login.ts:35`) — dan **tidak satu pun** memeriksa `tenants.status` atau `deleted_at`, sehingga tenant `suspended`/`expired`/soft-deleted tetap bisa login dan bertransaksi. Fitur suspend langganan praktis kosmetik.
- Konstruksi payload JWT disalin 4× (`login.ts:38-44`, `refresh.ts:32-38`, `pin-login.ts:36-39`, `impersonate.ts:23-30`) — terbukti membuat `impersonated_by` hanya ada di satu tempat.
- `expires_in: 900` ditulis keras 3× dan tidak terikat ke `sign: { expiresIn: '15m' }` di `index.ts:20`.
- `hashToken` identik di `forgot-password.ts:7-9` dan `reset-password.ts:8-10`.

**Files:**
- Create: `services/auth-service/src/token.ts`
- Create: `services/auth-service/src/token.test.ts`
- Modify: `services/auth-service/src/routes/login.ts:32-44, 67`
- Modify: `services/auth-service/src/routes/refresh.ts:26-40`
- Modify: `services/auth-service/src/routes/pin-login.ts`
- Modify: `services/auth-service/src/routes/forgot-password.ts:7-9`
- Modify: `services/auth-service/src/routes/reset-password.ts:8-10`
- Modify: `services/auth-service/src/index.ts:20`

**Interfaces:**
- Consumes: `Db` dari `@ipos-cloud/shared`.
- Produces dari `./token.js`:
  - `ACCESS_TOKEN_TTL = '15m'` dan `ACCESS_TOKEN_TTL_SECONDS = 900` — dipakai `index.ts` **dan** respons, jadi keduanya tidak bisa lagi menyimpang.
  - `hashToken(token: string): string`
  - `type TenantAccess = { ok: true; plan: string | null } | { ok: false; reason: 'SUSPENDED' | 'EXPIRED' | 'DELETED' | 'NOT_FOUND' }`
  - `resolveTenantAccess(db: Db, tenantId: string | null): Promise<TenantAccess>` — `tenantId` null (akun admin InspiraLabs) mengembalikan `{ ok: true, plan: null }`.
  - `buildJwtPayload(user: { id: string; role: string; tenant_id: string | null; outlet_id: string | null }, plan: string | null, extra?: { impersonated_by?: string }): Record<string, unknown>`

- [ ] **Step 1: Tulis test yang gagal**

Buat `services/auth-service/src/token.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeDb } from './test-support.js';
import {
  ACCESS_TOKEN_TTL_SECONDS, hashToken, resolveTenantAccess, buildJwtPayload,
} from './token.js';

const TENANT = '66666666-6666-6666-6666-666666666666';

test('hashToken deterministik dan bukan token mentah', () => {
  assert.equal(hashToken('abc'), hashToken('abc'));
  assert.notEqual(hashToken('abc'), 'abc');
  assert.equal(hashToken('abc').length, 64);
});

test('tenant aktif lolos dengan plan-nya', async () => {
  const db = fakeDb({ tenants: [{ id: TENANT, plan_code: 'resto_pro', status: 'active', deleted_at: null }] });
  assert.deepEqual(await resolveTenantAccess(db as any, TENANT), { ok: true, plan: 'resto_pro' });
});

test('tenant trial lolos', async () => {
  const db = fakeDb({ tenants: [{ id: TENANT, plan_code: 'umkm_lite', status: 'trial', deleted_at: null }] });
  assert.deepEqual(await resolveTenantAccess(db as any, TENANT), { ok: true, plan: 'umkm_lite' });
});

test('tenant suspended DITOLAK', async () => {
  const db = fakeDb({ tenants: [{ id: TENANT, plan_code: 'resto_pro', status: 'suspended', deleted_at: null }] });
  assert.deepEqual(await resolveTenantAccess(db as any, TENANT), { ok: false, reason: 'SUSPENDED' });
});

test('tenant expired DITOLAK', async () => {
  const db = fakeDb({ tenants: [{ id: TENANT, plan_code: 'resto_pro', status: 'expired', deleted_at: null }] });
  assert.deepEqual(await resolveTenantAccess(db as any, TENANT), { ok: false, reason: 'EXPIRED' });
});

test('tenant soft-deleted DITOLAK', async () => {
  const db = fakeDb({ tenants: [{ id: TENANT, plan_code: 'resto_pro', status: 'active', deleted_at: new Date() }] });
  assert.deepEqual(await resolveTenantAccess(db as any, TENANT), { ok: false, reason: 'DELETED' });
});

test('akun admin InspiraLabs (tenant_id null) lolos tanpa plan', async () => {
  const db = fakeDb({ tenants: [] });
  assert.deepEqual(await resolveTenantAccess(db as any, null), { ok: true, plan: null });
});

test('buildJwtPayload memuat semua klaim yang dipakai service hilir', () => {
  const p = buildJwtPayload(
    { id: 'u1', role: 'owner', tenant_id: 't1', outlet_id: 'o1' },
    'resto_pro'
  );
  assert.deepEqual(p, { sub: 'u1', tenant_id: 't1', role: 'owner', plan: 'resto_pro', outlet_id: 'o1' });
});

test('buildJwtPayload menyertakan impersonated_by kalau diberikan', () => {
  const p = buildJwtPayload(
    { id: 'u1', role: 'owner', tenant_id: 't1', outlet_id: null },
    'resto_pro',
    { impersonated_by: 'admin-1' }
  );
  assert.equal(p.impersonated_by, 'admin-1');
});

test('ACCESS_TOKEN_TTL_SECONDS konsisten 900', () => {
  assert.equal(ACCESS_TOKEN_TTL_SECONDS, 900);
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `pnpm --filter auth-service test`
Expected: FAIL — `Cannot find module './token.js'`.

- [ ] **Step 3: Implementasi**

Buat `services/auth-service/src/token.ts`:

```ts
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { tenants } from '@ipos-cloud/drizzle-schema';
import type { Db } from '@ipos-cloud/shared';

// Satu sumber untuk masa berlaku access token: dipakai opsi sign di index.ts DAN
// field expires_in di respons. Sebelumnya '15m' dan 900 ditulis terpisah, jadi
// mengubah salah satu membuat klien menjadwalkan refresh di waktu yang salah.
export const ACCESS_TOKEN_TTL = '15m';
export const ACCESS_TOKEN_TTL_SECONDS = 900;

export function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export type TenantAccess =
  | { ok: true; plan: string | null }
  | { ok: false; reason: 'SUSPENDED' | 'EXPIRED' | 'DELETED' | 'NOT_FOUND' };

/**
 * Satu tempat yang memutuskan boleh-tidaknya tenant menerbitkan token.
 * Sebelumnya lookup plan disalin di login/refresh/pin-login dan TIDAK SATU PUN
 * memeriksa status, sehingga tenant suspended/expired tetap bisa bertransaksi
 * dan fitur suspend langganan cuma kosmetik.
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

- [ ] **Step 4: Jalankan test, pastikan LULUS**

Run: `pnpm --filter auth-service test`
Expected: PASS 40/40.

- [ ] **Step 5: Tulis test bahwa login menolak tenant suspended**

Tambahkan di `services/auth-service/src/routes/login.test.ts`:

```ts
test('login DITOLAK kalau tenant sedang suspended', async () => {
  const user = {
    id: '11111111-1111-1111-1111-111111111111',
    tenant_id: '77777777-7777-7777-7777-777777777777',
    outlet_id: null, name: 'Owner', email: 'owner@toko.id',
    password_hash: await bcrypt.hash(PASSWORD, 4), role: 'owner', is_active: true,
  };
  const db = fakeDb({
    users: [user], sessions: [],
    tenants: [{ id: user.tenant_id, plan_code: 'resto_pro', status: 'suspended', deleted_at: null }],
  });
  const app = await buildTestApp({ db, routes: [[loginRoute, '/api/v1/auth']] });
  const res = await app.inject({
    method: 'POST', url: '/api/v1/auth/login',
    payload: { email: 'owner@toko.id', password: PASSWORD },
  });
  assert.equal(res.statusCode, 403, 'tenant suspended tidak boleh bisa login dan bertransaksi');
  assert.equal(res.json().code, 'TENANT_SUSPENDED');
  await app.close();
});
```

- [ ] **Step 6: Jalankan test, pastikan GAGAL**

Run: `pnpm --filter auth-service test`
Expected: FAIL — login masih 200.

- [ ] **Step 7: Pakai helper di `login.ts`**

Ganti baris 32-44 dengan:

```ts
    const access = await resolveTenantAccess(db, user.tenant_id ?? null);
    if (!access.ok) {
      return reply.code(403).send({
        error: TENANT_BLOCKED_MESSAGE[access.reason],
        code: `TENANT_${access.reason}`,
      });
    }

    const payload = buildJwtPayload(user, access.plan);
```

Ganti baris 67 `expires_in: 900` menjadi `expires_in: ACCESS_TOKEN_TTL_SECONDS`.

Tambahkan import:
```ts
import { resolveTenantAccess, buildJwtPayload, TENANT_BLOCKED_MESSAGE, ACCESS_TOKEN_TTL_SECONDS } from '../token.js';
```

- [ ] **Step 8: Pakai helper di `refresh.ts` dan `pin-login.ts`**

`refresh.ts` — ganti baris 26-40 dengan pola yang sama (`resolveTenantAccess` → 403 kalau tidak ok → `buildJwtPayload` → `expires_in: ACCESS_TOKEN_TTL_SECONDS`). Ini penting: tenant yang disuspend di tengah sesi harus kehilangan akses pada refresh berikutnya, bukan 30 hari kemudian.

`pin-login.ts` — ganti lookup `tenants` dengan `resolveTenantAccess(db, body.tenant_id)` dan tolak 403 kalau tidak ok; ganti `expires_in: 900` dengan konstanta.

- [ ] **Step 9: Pakai `hashToken` bersama & ikat TTL di `index.ts`**

Di `forgot-password.ts` dan `reset-password.ts`: hapus fungsi `hashToken` lokal, ganti dengan `import { hashToken } from '../token.js';`.

Di `index.ts` baris 20, ganti `expiresIn: '15m'` dengan `expiresIn: ACCESS_TOKEN_TTL` dan tambahkan import dari `./token.js`.

- [ ] **Step 10: Verifikasi tidak ada lagi duplikasi**

Run: `grep -rn "expires_in: 900\|function hashToken\|plan_code: tenants.plan_code" services/auth-service/src`
Expected: hanya satu hasil untuk `plan_code: tenants.plan_code` (di `token.ts`), dan tidak ada hasil untuk dua pola lainnya.

- [ ] **Step 11: Jalankan seluruh test & type-check**

Run: `pnpm -r type-check && pnpm --filter auth-service test`
Expected: PASS 41/41, type-check bersih.

- [ ] **Step 12: Commit**

```bash
git add services/auth-service/src
git commit -m "fix(auth)!: tolak login tenant suspended/expired + satukan penerbitan token

Lookup plan tenant disalin 3x di login/refresh/pin-login dan TIDAK SATU
PUN memeriksa tenants.status atau deleted_at, sehingga tenant yang
disuspend tetap bisa login dan bertransaksi — fitur suspend langganan
cuma kosmetik.

resolveTenantAccess/buildJwtPayload/hashToken/ACCESS_TOKEN_TTL sekarang
satu tempat, jadi cek baru otomatis berlaku di semua jalur penerbitan
token. '15m' dan 900 juga tidak bisa lagi menyimpang.

BREAKING: klien harus menangani 403 TENANT_SUSPENDED / TENANT_EXPIRED."
```

---

### Task 8: CORS gagal-tertutup, validasi env saat boot, `clearCookie` konsisten

Tiga lubang kecil di bootstrap yang semuanya bertipe "satu env salah → terbuka":

- `process.env.CORS_ORIGIN?.split(',')... || true` — kalau `CORS_ORIGIN` kosong atau salah nama, hasilnya `origin: true` (refleksikan **origin apa pun**) digabung `credentials: true`. Satu env yang lupa diisi di produksi langsung membuka endpoint auth ke situs mana pun.
- `process.env.JWT_PRIVATE_KEY!.replace(...)` — env yang kurang menghasilkan `TypeError: Cannot read properties of undefined (reading 'replace')` saat boot, bukan pesan yang bisa ditindaklanjuti. README repo bahkan sudah mendokumentasikan error ini sebagai jebakan yang diketahui.
- `reply.clearCookie('refresh_token', { path: '/' })` tidak menyertakan `secure`/`sameSite` seperti saat cookie di-set, sehingga sebagian browser tidak benar-benar menghapusnya.

**Files:**
- Create: `services/auth-service/src/env.ts`
- Create: `services/auth-service/src/env.test.ts`
- Modify: `services/auth-service/src/index.ts:11, 17-18, 23`
- Modify: `services/auth-service/src/routes/logout.ts:12`
- Modify: `services/auth-service/src/routes/login.ts` (opsi cookie → konstanta bersama)
- Modify: `services/auth-service/src/routes/pin-login.ts` (opsi cookie → konstanta bersama)

**Interfaces:**
- Consumes: —
- Produces dari `./env.js`:
  - `requireEnv(keys: string[], env?: NodeJS.ProcessEnv): void` — melempar `Error` dengan pesan yang menyebut **semua** key yang kurang sekaligus, bukan satu per satu.
  - `resolveCorsOrigin(raw: string | undefined, nodeEnv: string | undefined): string[] | boolean` — di produksi melempar kalau `raw` kosong; di dev mengembalikan `true`.
  - `REFRESH_COOKIE_OPTIONS` — opsi yang dipakai **bareng** oleh `setCookie` dan `clearCookie`, jadi atributnya tidak bisa lagi menyimpang.

- [ ] **Step 1: Tulis test yang gagal**

Buat `services/auth-service/src/env.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { requireEnv, resolveCorsOrigin, REFRESH_COOKIE_OPTIONS } from './env.js';

test('requireEnv lolos kalau semua key ada', () => {
  requireEnv(['A', 'B'], { A: '1', B: '2' } as any);
});

test('requireEnv menyebut SEMUA key yang kurang dalam satu pesan', () => {
  assert.throws(
    () => requireEnv(['A', 'B', 'C'], { B: '2' } as any),
    (err: Error) => {
      assert.match(err.message, /A/);
      assert.match(err.message, /C/);
      assert.doesNotMatch(err.message, /\bB\b/, 'key yang sudah ada jangan ikut disebut');
      return true;
    }
  );
});

test('requireEnv menolak env berisi string kosong', () => {
  assert.throws(() => requireEnv(['A'], { A: '' } as any), /A/);
});

test('CORS_ORIGIN kosong di produksi MELEMPAR, tidak jatuh ke origin: true', () => {
  assert.throws(
    () => resolveCorsOrigin(undefined, 'production'),
    /CORS_ORIGIN/,
    'origin: true + credentials: true membuka endpoint auth ke situs mana pun'
  );
});

test('CORS_ORIGIN kosong di dev mengembalikan true', () => {
  assert.equal(resolveCorsOrigin(undefined, undefined), true);
});

test('CORS_ORIGIN di-split dan di-trim', () => {
  assert.deepEqual(
    resolveCorsOrigin('https://a.id, https://b.id ', 'production'),
    ['https://a.id', 'https://b.id']
  );
});

test('CORS_ORIGIN berisi hanya koma/spasi dianggap kosong di produksi', () => {
  assert.throws(() => resolveCorsOrigin(' , ', 'production'), /CORS_ORIGIN/);
});

test('opsi cookie refresh punya httpOnly dan sameSite', () => {
  assert.equal(REFRESH_COOKIE_OPTIONS.httpOnly, true);
  assert.equal(REFRESH_COOKIE_OPTIONS.sameSite, 'strict');
  assert.equal(REFRESH_COOKIE_OPTIONS.path, '/');
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `pnpm --filter auth-service test`
Expected: FAIL — `Cannot find module './env.js'`.

- [ ] **Step 3: Implementasi**

Buat `services/auth-service/src/env.ts`:

```ts
/**
 * Gagal saat boot dengan pesan yang bisa ditindaklanjuti, bukan
 * "TypeError: Cannot read properties of undefined (reading 'replace')"
 * yang sudah didokumentasikan di README sebagai jebakan yang diketahui.
 */
export function requireEnv(keys: string[], env: NodeJS.ProcessEnv = process.env): void {
  const missing = keys.filter((k) => !env[k]);
  if (missing.length) {
    throw new Error(
      `Env wajib belum diisi: ${missing.join(', ')}. ` +
        `Copy .env.example ke .env di folder service ini (lihat README bagian "Isi .env per service").`
    );
  }
}

/**
 * Gagal-tertutup. Versi lama memakai `CORS_ORIGIN?.split(',') || true`, jadi env
 * yang kosong/salah nama menghasilkan origin: true — refleksikan origin apa pun —
 * digabung credentials: true. Di dev itu memang yang kita mau; di produksi itu lubang.
 */
export function resolveCorsOrigin(raw: string | undefined, nodeEnv: string | undefined): string[] | boolean {
  const list = (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (list.length) return list;
  if (nodeEnv === 'production') {
    throw new Error(
      'CORS_ORIGIN wajib diisi saat NODE_ENV=production. ' +
        'Isi daftar origin yang boleh akses API ini, pisah pakai koma (lihat .env.example).'
    );
  }
  return true;
}

/** Dipakai BARENG setCookie dan clearCookie — atributnya tidak boleh menyimpang. */
export const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/',
} as const;
```

- [ ] **Step 4: Jalankan test, pastikan LULUS**

Run: `pnpm --filter auth-service test`
Expected: PASS 49/49.

- [ ] **Step 5: Pakai di `index.ts`**

Tambahkan import `./env.js`, lalu sebelum pembuatan `app`:

```ts
requireEnv(['DATABASE_URL', 'JWT_PRIVATE_KEY', 'JWT_PUBLIC_KEY']);
```

Ganti registrasi cors (baris 11):
```ts
app.register(cors, {
  origin: resolveCorsOrigin(process.env.CORS_ORIGIN, process.env.NODE_ENV),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
});
```

- [ ] **Step 6: Satukan opsi cookie**

Di `login.ts` (baris 59-65) dan `pin-login.ts`, ganti object opsi cookie inline dengan:
```ts
    reply.setCookie('refresh_token', refresh_token, { ...REFRESH_COOKIE_OPTIONS, expires: expires_at });
```

Di `logout.ts` baris 12:
```ts
    // Atribut HARUS sama dengan saat di-set, kalau tidak sebagian browser tidak menghapusnya.
    reply.clearCookie('refresh_token', REFRESH_COOKIE_OPTIONS);
```

- [ ] **Step 7: Verifikasi tidak ada lagi opsi cookie tersebar**

Run: `grep -rn "httpOnly: true" services/auth-service/src`
Expected: satu hasil saja, di `env.ts`.

- [ ] **Step 8: Verifikasi service masih boot dengan env lengkap**

Run: `cd services/auth-service && DATABASE_URL=postgresql://x/y JWT_PRIVATE_KEY=x JWT_PUBLIC_KEY=y pnpm exec tsx -e "import('./src/env.js').then(m => { m.requireEnv(['DATABASE_URL','JWT_PRIVATE_KEY','JWT_PUBLIC_KEY']); console.log('env ok'); })"`
Expected: mencetak `env ok`.

Run: `cd services/auth-service && pnpm exec tsx -e "import('./src/env.js').then(m => { try { m.requireEnv(['DATABASE_URL','JWT_PRIVATE_KEY','JWT_PUBLIC_KEY'], {}); } catch (e) { console.log('pesan:', e.message); } })"`
Expected: pesan menyebut ketiga key sekaligus.

- [ ] **Step 9: Type-check & commit**

Run: `pnpm -r type-check && pnpm --filter auth-service test`

```bash
git add services/auth-service/src
git commit -m "fix(auth): CORS gagal-tertutup, validasi env saat boot, opsi cookie satu sumber

CORS_ORIGIN yang kosong sebelumnya jatuh ke origin: true (refleksikan
origin apa pun) digabung credentials: true — satu env yang lupa diisi
membuka endpoint auth ke situs mana pun. Sekarang melempar di produksi,
tetap permisif di dev.

Env yang kurang sekarang gagal dengan pesan yang menyebut semua key yang
hilang, bukan TypeError ... reading 'replace' yang README sendiri sudah
catat sebagai jebakan. clearCookie juga memakai atribut yang sama dengan
setCookie supaya cookie benar-benar terhapus."
```

---

## Kriteria "selesai" Modul 2

- [ ] `pnpm -r type-check` bersih
- [ ] `pnpm --filter auth-service test` lulus, minimal **49 test** (auth-service dari nol test)
- [ ] `grep -c "trustProxy" services/*/src/index.ts` → semua `1`
- [ ] `grep -rn "expires_in: 900\|function hashToken" services/auth-service/src` → kosong
- [ ] `grep -rn "httpOnly: true" services/auth-service/src` → satu hasil (`env.ts`)
- [ ] `grep -rn "|| true" services/auth-service/src/index.ts` → kosong (CORS tidak lagi gagal-terbuka)
- [ ] `GET /api/v1/auth/pin-login/staff` tanpa Bearer token → 401
- [ ] 6 percobaan PIN salah → 429 `PIN_LOCKED`, dan PIN benar tetap ditolak selama terkunci
- [ ] Login dengan tenant `status='suspended'` → 403 `TENANT_SUSPENDED`
- [ ] Bagian "Perubahan kontrak API dari Fase 3" di `docs/audit-fase-1.md` memuat dua breaking change untuk Modul 6

## Dependency ke modul lain

- **Modul 1 wajib selesai** sebelum modul ini dimulai.
- **Modul 6 (tenant-app)** harus menyesuaikan dua breaking change: `pin-login/staff` butuh Bearer token dan tidak lagi menerima `?tenant_id=`; login/refresh sekarang bisa membalas 403 `TENANT_SUSPENDED`/`TENANT_EXPIRED` yang perlu layar khusus (`lib/trial.ts:12` juga belum menangani status ini — satu perbaikan menutup keduanya).
- **Modul 3 (tenant-service)** mewarisi `buildErrorHandler` dari Task 2 dan `resolveTenantAccess` dari Task 7 untuk memperbaiki `tenantGuard` yang tidak mengecek status tenant.
- **Task 3 + Task 4 bersama-sama** menutup rantai temuan B, tapi **tidak** menutup temuan A (eskalasi kasir → owner). Akar temuan A ada di `tenant-service` (`tenantGuard` tanpa cek role dan route PIN tanpa `ne(role,'owner')`) — itu Modul 3. Sampai Modul 3 selesai, eskalasi masih mungkin bagi siapa pun yang punya akun kasir sah.

## Butuh keputusan Anda sebelum dieksekusi

1. **OTP (`routes/otp.ts`) — saya usul DIHAPUS, bukan diperbaiki.** Fitur ini memakai `Math.random()` (bukan PRNG kriptografis), mencatat kodenya plaintext ke log, tidak punya rate limit maupun batas percobaan, `/verify` hanya mengembalikan `user_id` tanpa menerbitkan token, dan **tidak ada satu pun klien yang memanggilnya**. Memperbaikinya berarti menyelesaikan fitur yang belum pernah dipakai; menghapusnya menutup permukaan serang tanpa auth dan menghapus ~37 baris. Kalau OTP memang ada di roadmap, saya buat plan pengerasannya sebagai task terpisah.
2. **Impersonate** terdaftar di prefix `/api/v1/admin` yang nginx rutekan ke tenant-service, jadi fiturnya mati total di produksi. Ada dua arah perbaikan: pindahkan route-nya ke prefix yang dirutekan ke auth-service (mis. `/api/v1/auth/admin`), atau tambahkan `location` khusus di nginx. Yang pertama lebih rapi, tapi mengubah URL yang mungkin sudah dipakai admin-app. Mana yang Anda pilih? Selain itu, cabang suksesnya juga tak tercapai karena `tenants.owner_id` tidak pernah di-set — itu diperbaiki di Modul 3, jadi impersonate baru benar-benar hidup setelah keduanya selesai.

## Yang SENGAJA tidak dikerjakan di modul ini

- **Refresh token plaintext di `sessions.refresh_token`** dan **rotasi + deteksi reuse**. Keduanya benar dan penting, tapi mengubah skema `sessions` sekaligus alur refresh; digabung ke satu task tersendiri supaya bisa diuji sebagai satu perilaku, bukan disebar.
- **Pembersihan `sessions`/`otp_codes`/`password_reset_tokens` yang tumbuh tanpa batas.** Butuh keputusan mekanisme (cron container vs `pg_cron` vs pembersihan oportunistik saat login). Index `sessions_expires_at_idx` dari Modul 1 sudah disiapkan untuk ini.
- **Enumerasi user lewat timing di login** (`bcrypt.compare` dilewati kalau user tidak ada). Pesan error-nya sudah benar-benar generik; memperbaiki timing butuh dummy hash comparison. Prioritas rendah dibanding sisanya.
- **`seed-admin` menerima password lewat `process.argv`** (masuk shell history dan terlihat di `ps`), dan tidak memvalidasi `role` terhadap daftar role yang sah sehingga typo `super-admin` membuat user yang lolos semua guard `role !== 'super_admin'`. Perbaikannya kecil, tapi menyentuh alur operasional yang mungkin sudah Anda pakai — butuh konfirmasi dulu.
- **`POST /logout` tidak pernah dipanggil klien mana pun.** Route-nya sendiri sudah benar (hapus baris `sessions` + clear cookie), dan Task 8 memperbaiki atribut `clearCookie`-nya. Yang kurang adalah pemanggilnya: `tenant-app/components/layout/Topbar.tsx:16-19` dan `admin-app/lib/store.ts:14` hanya membuang token di state. **Modul 5 & 6.**
- **Kebijakan password hanya `min(6)`** di `login.ts:9` dan `reset-password.ts:16`, tanpa aturan lain dan tanpa konstanta bersama. Menaikkannya adalah keputusan produk (pengguna existing dengan password 6 karakter akan terdampak saat reset berikutnya), bukan keputusan teknis.
- **Biaya bcrypt `10` ditulis keras terpisah** di `reset-password.ts:31` dan `scripts/seed-admin.ts:17`. Menaikkan cost factor menambah latensi login yang terukur — butuh pengukuran di perangkat target, bukan diubah buta.
- **Graceful shutdown / handler SIGTERM.** Deploy Docker memutus request berjalan dan meninggalkan koneksi Postgres menggantung. Perbaikannya sama untuk 10 service, jadi lebih baik satu task lintas-service setelah `createDb` dari Modul 1 stabil — bukan ditambal di auth-service saja.
- **`/health` tidak memeriksa DB** dan mengembalikan versi hardcoded `'0.1.0'`. Berpasangan dengan `HEALTHCHECK` di Dockerfile yang juga belum ada (temuan infra G) — kerjakan bersama supaya health check punya arti, bukan dua setengah perbaikan.
- **`app.listen` dipanggil saat `register` masih async.** Diperiksa dan **bukan bug**: Fastify menunda seluruh `register` sampai `ready`, yang dipicu `listen`. Tidak ada yang perlu diubah — dicatat di sini supaya tidak diaudit ulang.
