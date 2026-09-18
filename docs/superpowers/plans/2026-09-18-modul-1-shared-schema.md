# Modul 1 — packages/shared + drizzle-schema: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Perbaiki fondasi yang dipakai semua service — index database, listener error koneksi, dan `requireFeature` yang rusak — supaya modul 2-6 punya lantai yang stabil untuk dipijak.

**Architecture:** Empat perubahan independen di dua paket dasar. Yang paling berdampak adalah mengubah `requireFeature(featureKey)` menjadi `requireFeature(db, featureKey)`: dependensi tersembunyi `request.server.db` dihapus, sehingga service yang lupa mendaftarkan `db` gagal saat **compile**, bukan 500 saat runtime. Index dideklarasikan di `src/*.ts` lalu SQL-nya dibiarkan digenerate `drizzle-kit`, bukan ditulis tangan, supaya `db:generate` berikutnya tidak menghapusnya lagi.

**Tech Stack:** TypeScript 5.9 (NodeNext), Drizzle ORM 0.36 + drizzle-kit 0.27, PostgreSQL (Supabase pooler), `node:test` + `tsx`, pnpm workspace.

**Spec:** [docs/audit-fase-1.md](../../audit-fase-1.md) — bagian D (requireFeature), E (index), M/packages-shared (Pool/Redis listener), J (PLAN_FEATURES).

## Global Constraints

- Schema Postgres bernama **`inspirapos_v2`** (`pgSchema`), bukan `public`. Semua SQL manual wajib memakai prefix `"inspirapos_v2"."<tabel>"`.
- Migrasi berikutnya adalah **0017**. Journal `migrations/meta/_journal.json` memakai `"version": "7"` dan `"breakpoints": true`.
- Test memakai `node:test` + `node:assert/strict`, dijalankan `tsx --test "src/**/*.test.ts"`. **Tidak boleh menambah framework test.**
- `packages/shared` tidak punya `"type": "module"` → tsx mengompilasinya sebagai CJS. **Jangan pakai top-level `await`** di file test; bungkus dalam `test()` atau IIFE async.
- Import antar-file di `packages/shared/src` dan `packages/drizzle-schema/src` memakai ekstensi `.js` (NodeNext), mis. `from './types.js'`.
- Jangan menaikkan versi dependency apa pun di modul ini. Upgrade dependency adalah plan terpisah.
- Jangan menghapus komentar Bahasa Indonesia yang menjelaskan *kenapa*. Kalau sebuah komentar jadi tidak akurat karena perubahanmu, perbarui isinya — jangan hapus.
- Setelah setiap task: `pnpm build:packages && pnpm -r type-check` harus bersih. Ini wajib karena `services/*` mengimpor `dist/` dari paket ini.

---

### Task 1: Listener `error` pada Pool dan Redis

Tanpa listener `'error'`, Node melempar unhandled `'error'` event dan **seluruh proses service mati**. Ini terjadi pada kejadian rutin: Postgres restart, koneksi idle diputus NAT, Redis di-restart.

**Files:**
- Modify: `packages/shared/src/db.ts:5-8`
- Modify: `packages/shared/src/redis.ts:3-5`
- Test: `packages/shared/src/db.test.ts` (create)
- Test: `packages/shared/src/redis.test.ts` (create)

**Interfaces:**
- Consumes: —
- Produces: `createDb(connectionString: string, onError?: (err: Error) => void)` dan `createRedis(url: string, onError?: (err: Error) => void)`. Tanda tangan tetap kompatibel ke belakang — parameter kedua opsional, jadi 10 pemanggil yang ada tidak perlu diubah.

- [ ] **Step 1: Tulis test yang gagal untuk Pool**

Buat `packages/shared/src/db.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDb } from './db.js';

// Connection string sengaja menunjuk port mati — createDb tidak connect (Pool lazy),
// jadi test ini tidak butuh Postgres hidup.
const DEAD_URL = 'postgresql://nobody:nobody@127.0.0.1:1/none';

test('createDb memasang listener error di pool', () => {
  const db = createDb(DEAD_URL) as unknown as { $client: { listenerCount(e: string): number } };
  assert.equal(db.$client.listenerCount('error'), 1, 'pool tanpa listener error = proses mati saat koneksi idle putus');
});

test('createDb meneruskan error pool ke onError, bukan melempar', () => {
  const seen: Error[] = [];
  const db = createDb(DEAD_URL, (err) => seen.push(err)) as unknown as {
    $client: { emit(e: string, err: Error): void };
  };
  db.$client.emit('error', new Error('connection terminated unexpectedly'));
  assert.equal(seen.length, 1);
  assert.match(seen[0].message, /connection terminated/);
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `cd packages/shared && pnpm exec tsx --test "src/db.test.ts"`
Expected: FAIL — test pertama `Expected values to be strictly equal: 0 !== 1` (sudah diverifikasi: `listenerCount('error')` saat ini `0`).

- [ ] **Step 3: Implementasi minimal di `db.ts`**

Ganti seluruh isi `packages/shared/src/db.ts`:

```ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@ipos-cloud/drizzle-schema';

/**
 * Pool WAJIB punya listener 'error'. Tanpa itu, error pada koneksi idle (Postgres
 * restart, NAT timeout) di-emit tanpa handler dan Node mematikan seluruh proses.
 * Default handler cukup nge-log ke stderr; service boleh mengoper logger-nya sendiri.
 */
export function createDb(connectionString: string, onError?: (err: Error) => void) {
  const pool = new Pool({ connectionString, max: 10 });
  pool.on('error', onError ?? ((err) => console.error('[db] idle client error:', err.message)));
  return drizzle(pool, { schema });
}

export type Db = ReturnType<typeof createDb>;
```

- [ ] **Step 4: Jalankan test, pastikan LULUS**

Run: `cd packages/shared && pnpm exec tsx --test "src/db.test.ts"`
Expected: PASS 2/2.

- [ ] **Step 5: Tulis test yang gagal untuk Redis**

Buat `packages/shared/src/redis.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRedis } from './redis.js';

// lazyConnect: true di createRedis berarti tidak ada koneksi dibuka sampai dipakai,
// jadi test ini tidak butuh Redis hidup. Tetap dipanggil disconnect() supaya
// test runner tidak menggantung.
test('createRedis memasang listener error', () => {
  const redis = createRedis('redis://127.0.0.1:1');
  try {
    assert.equal(redis.listenerCount('error'), 1);
  } finally {
    redis.disconnect();
  }
});

test('createRedis meneruskan error ke onError, bukan melempar', () => {
  const seen: Error[] = [];
  const redis = createRedis('redis://127.0.0.1:1', (err) => seen.push(err));
  try {
    redis.emit('error', new Error('ECONNREFUSED'));
    assert.equal(seen.length, 1);
    assert.match(seen[0].message, /ECONNREFUSED/);
  } finally {
    redis.disconnect();
  }
});
```

- [ ] **Step 6: Jalankan test, pastikan GAGAL**

Run: `cd packages/shared && pnpm exec tsx --test "src/redis.test.ts"`
Expected: FAIL — `0 !== 1`.

- [ ] **Step 7: Implementasi minimal di `redis.ts`**

Ganti seluruh isi `packages/shared/src/redis.ts`:

```ts
import Redis from 'ioredis';

/**
 * Sama seperti Pool di db.ts: event 'error' tanpa listener = proses mati.
 * kitchen-service, table-service, dan websocket-gateway semuanya bergantung
 * pada ini, jadi Redis yang di-restart tidak boleh menjatuhkan mereka.
 */
export function createRedis(url: string, onError?: (err: Error) => void) {
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 3 });
  redis.on('error', onError ?? ((err) => console.error('[redis]', err.message)));
  return redis;
}

export type RedisClient = ReturnType<typeof createRedis>;
```

- [ ] **Step 8: Jalankan seluruh test paket & type-check**

Run: `pnpm build:packages && pnpm -r type-check && pnpm -r test`
Expected: type-check bersih; test lulus (2 db + 2 redis + 5 feature-gate + 7 report + 2 tenant-app = 18).

- [ ] **Step 9: Commit**

```bash
git add packages/shared/src/db.ts packages/shared/src/redis.ts packages/shared/src/db.test.ts packages/shared/src/redis.test.ts
git commit -m "fix(shared): pasang listener error di Pool & Redis agar service tidak mati saat koneksi putus"
```

---

### Task 2: `requireFeature` menerima `db` secara eksplisit

`requireFeature` membaca `request.server.db`, tapi hanya auth/notification/pos/tenant-service yang memanggil `app.decorate('db', db)`. Di inventory, kitchen, table, dan report-service nilainya `undefined` → setiap route ber-gate membalas 500 untuk tenant berbayar (sudah diverifikasi dengan probe langsung).

Menambahkan `decorate` di 4 service itu hanya menambal gejala — service ke-11 akan lupa lagi. Memindahkan `db` ke parameter membuat kelalaian yang sama jadi **error compile**.

**Files:**
- Modify: `packages/shared/src/feature-gate.ts:37-67`
- Test: `packages/shared/src/feature-gate.test.ts` (tambah test baru di akhir file)
- Modify (call site): `services/pos-service/src/index.ts:45, 72, 142, 157, 172`
- Modify (call site): `services/inventory-service/src/index.ts:43, 72, 124, 130, 140, 155, 175, 185`
- Modify (call site): `services/kitchen-service/src/index.ts:50, 101`
- Modify (call site): `services/table-service/src/index.ts:49, 55, 69, 84, 96, 114, 133`
- Modify (call site): `services/report-service/src/index.ts:125, 159, 250, 282, 312, 353, 394, 413`
- Modify (call site): `services/tenant-service/src/routes/tenant/attendance.ts:12, 30, 48`
- Modify (call site): `services/tenant-service/src/routes/tenant/branches.ts:12, 24, 32, 48, 69`
- Modify (call site): `services/tenant-service/src/routes/tenant/loyalty.ts:12, 27, 36, 47, 63, 82, 102`

**Interfaces:**
- Consumes: `Db` dari Task 1.
- Produces:
  - `hasFeature(db: Db, tenantId: string, plan: TenantPlan | undefined | null, featureKey: string): Promise<boolean>` — **tidak berubah**.
  - `requireFeature(db: Db, featureKey: string)` — parameter `db` **baru, di posisi pertama**. Mengembalikan `(request, reply) => Promise<void>` seperti sebelumnya.

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan di akhir `packages/shared/src/feature-gate.test.ts`:

```ts
import { requireFeature } from './feature-gate.js';

function fakeReply() {
  const sent: { code?: number; body?: unknown } = {};
  return {
    sent,
    code(c: number) { sent.code = c; return this; },
    send(b: unknown) { sent.body = b; return this; },
  };
}

test('requireFeature membalas 403 kalau plan tidak punya fitur', async () => {
  const guard = requireFeature(fakeDb([]), 'stock_management');
  const reply = fakeReply();
  await guard({ user: { tenant_id: 't1', plan: 'umkm_lite' } } as any, reply as any);
  assert.equal(reply.sent.code, 403);
  assert.deepEqual(reply.sent.body, { error: 'Feature not available on your plan', code: 'FEATURE_GATED' });
});

test('requireFeature lolos (tidak menyentuh reply) kalau plan punya fitur', async () => {
  const guard = requireFeature(fakeDb([]), 'basic_pos');
  const reply = fakeReply();
  await guard({ user: { tenant_id: 't1', plan: 'umkm_lite' } } as any, reply as any);
  assert.equal(reply.sent.code, undefined, 'guard tidak boleh mengirim respons saat fitur tersedia');
});

test('requireFeature membalas 403 kalau token tidak punya tenant_id', async () => {
  const guard = requireFeature(fakeDb([]), 'basic_pos');
  const reply = fakeReply();
  await guard({ user: { tenant_id: null, plan: 'umkm_lite' } } as any, reply as any);
  assert.equal(reply.sent.code, 403);
});

// Regresi bug D: db datang dari parameter, BUKAN request.server.db.
// Request di test ini sengaja tidak punya `server` sama sekali.
test('requireFeature tidak bergantung pada request.server.db', async () => {
  const guard = requireFeature(fakeDb([{ feature_key: 'stock_management', is_enabled: true }]), 'stock_management');
  const reply = fakeReply();
  await guard({ user: { tenant_id: 't1', plan: 'umkm_lite' } } as any, reply as any);
  assert.equal(reply.sent.code, undefined, 'override true harus meloloskan guard tanpa request.server');
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `cd packages/shared && pnpm exec tsx --test "src/feature-gate.test.ts"`
Expected: FAIL saat compile — `Expected 1 arguments, but got 2` pada `requireFeature(fakeDb([]), 'stock_management')`.

- [ ] **Step 3: Ubah `requireFeature` dan bersihkan `.find()` mati**

Ganti baris 37-67 `packages/shared/src/feature-gate.ts` (fungsi `hasFeature` dan `requireFeature`) dengan:

```ts
export async function hasFeature(
  db: Db,
  tenantId: string,
  plan: TenantPlan | undefined | null,
  featureKey: string
): Promise<boolean> {
  if (!plan) return false;

  // WHERE sudah memfilter feature_key, jadi baris pertama (kalau ada) sudah pasti key yang dicari.
  const [override] = await db
    .select({ is_enabled: tenant_feature_overrides.is_enabled })
    .from(tenant_feature_overrides)
    .where(and(eq(tenant_feature_overrides.tenant_id, tenantId), eq(tenant_feature_overrides.feature_key, featureKey)))
    .limit(1);

  if (override) return override.is_enabled;

  const features = PLAN_FEATURES[plan];
  if (!features) {
    // plan_code default kolom adalah 'trial', yang bukan anggota TenantPlan. Dulu ini
    // diam-diam mengembalikan false sehingga tenant kehilangan SEMUA fitur tanpa jejak.
    console.warn(`[feature-gate] plan tidak dikenal "${plan}" untuk tenant ${tenantId} — semua fitur ditolak`);
    return false;
  }
  return features.includes(featureKey);
}

/**
 * `db` dioper eksplisit, TIDAK dibaca dari request.server.db. Versi lama membaca
 * decorator itu, dan 4 service (inventory, kitchen, table, report) tidak pernah
 * memanggil app.decorate('db') sehingga setiap route ber-gate membalas 500.
 * Dengan db sebagai parameter, kelalaian yang sama jadi error compile.
 */
export function requireFeature(db: Db, featureKey: string) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as unknown as { user?: { tenant_id?: string; plan?: TenantPlan | null } }).user;
    if (!user?.tenant_id || !(await hasFeature(db, user.tenant_id, user.plan, featureKey))) {
      return reply.code(403).send({ error: 'Feature not available on your plan', code: 'FEATURE_GATED' });
    }
  };
}
```

- [ ] **Step 4: Jalankan test, pastikan LULUS**

Run: `cd packages/shared && pnpm exec tsx --test "src/feature-gate.test.ts"`
Expected: PASS 9/9 (5 lama + 4 baru).

- [ ] **Step 5: Perbaiki semua 44 call site sampai type-check bersih**

Jumlah pemanggilan `requireFeature(` yang harus diubah — sudah dihitung, gunakan sebagai checklist:

| File | Jumlah |
|---|---|
| `services/inventory-service/src/index.ts` | 8 |
| `services/report-service/src/index.ts` | 8 |
| `services/table-service/src/index.ts` | 7 |
| `services/tenant-service/src/routes/tenant/loyalty.ts` | 7 |
| `services/tenant-service/src/routes/tenant/branches.ts` | 6 |
| `services/pos-service/src/index.ts` | 3 |
| `services/tenant-service/src/routes/tenant/attendance.ts` | 3 |
| `services/kitchen-service/src/index.ts` | 2 |
| **Total** | **44** |

Verifikasi jumlahnya sebelum mulai: `grep -rc "requireFeature(" services/*/src/index.ts services/tenant-service/src/routes/tenant/*.ts | grep -v ":0"`

Run: `pnpm build:packages && pnpm -r type-check 2>&1 | grep -c error`

Setiap error berbentuk `Expected 2 arguments, but got 1`. Untuk tiap lokasi, sisipkan `db` sebagai argumen pertama. Pola perubahannya:

```ts
// sebelum
app.post('/api/v1/pos/shifts', { preHandler: [requireAuth, requireFeature('shift_management')] }, ...)
// sesudah
app.post('/api/v1/pos/shifts', { preHandler: [requireAuth, requireFeature(db, 'shift_management')] }, ...)
```

Di `services/pos-service/src/index.ts` juga ada 3 pemanggilan `hasFeature(db, ...)` di baris 142, 157, 172 — itu **sudah** mengoper `db` dan tidak perlu diubah.

Di `services/tenant-service/src/routes/tenant/*.ts`, `db` diambil per-handler lewat `const db = (app as any).db`. Di file-file itu, ambil `db` sekali di awal fungsi route supaya bisa dipakai di `preHandler`:

```ts
export async function tenantBranchesRoutes(app: FastifyInstance) {
  const db = (app as any).db;           // pindahkan ke sini
  app.addHook('preHandler', tenantGuard);
  app.get('/', { preHandler: requireFeature(db, 'multi_outlet') }, async (request: any) => {
    const { tenant_id } = request.user as { tenant_id: string };
    return db.select().from(outlets).where(eq(outlets.tenant_id, tenant_id));
  });
  // ...
```

Ulangi sampai `pnpm -r type-check` melaporkan 0 error.

- [ ] **Step 6: Verifikasi tidak ada lagi yang membaca `request.server.db`**

Run: `grep -rn "server as unknown as { db\|server\.db" packages services --include=*.ts | grep -v node_modules`
Expected: tidak ada hasil.

- [ ] **Step 7: Jalankan seluruh test & type-check**

Run: `pnpm build:packages && pnpm -r type-check && pnpm -r test`
Expected: type-check bersih, test lulus 22.

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/feature-gate.ts packages/shared/src/feature-gate.test.ts services/
git commit -m "fix(shared)!: requireFeature terima db eksplisit — perbaiki 500 di inventory/kitchen/table/report

requireFeature membaca request.server.db, tapi hanya 4 dari 8 service yang
memanggil app.decorate('db'). Di inventory/kitchen/table/report nilainya
undefined sehingga setiap route ber-gate membalas 500 untuk tenant berbayar.

db sekarang parameter pertama, jadi service yang lupa mengopernya gagal
saat compile. Sekaligus: plan tak dikenal sekarang di-log, tidak lagi
menolak semua fitur secara senyap."
```

---

### Task 3: Index database (migrasi 0017)

Nol `CREATE INDEX` di 17 migrasi dan nol `index()` di `src/*.ts`. Setiap query bertenant adalah seq scan penuh, dan biayanya tumbuh mengikuti data **seluruh platform**.

Index dideklarasikan di `src/*.ts` lalu SQL-nya digenerate `drizzle-kit`, bukan ditulis tangan — kalau ditulis tangan, `db:generate` berikutnya akan mendiff `src` yang tidak punya index dan menghasilkan migrasi yang menghapusnya.

**Files:**
- Modify: `packages/drizzle-schema/src/auth.ts`
- Modify: `packages/drizzle-schema/src/tenant.ts`
- Modify: `packages/drizzle-schema/src/catalog.ts`
- Modify: `packages/drizzle-schema/src/pos.ts`
- Modify: `packages/drizzle-schema/src/restaurant.ts`
- Modify: `packages/drizzle-schema/src/bom.ts`
- Modify: `packages/drizzle-schema/src/resto.ts`
- Modify: `packages/drizzle-schema/src/admin.ts`
- Modify: `packages/drizzle-schema/src/offline.ts`
- Create: `packages/drizzle-schema/migrations/0017_*.sql` (digenerate, nama acak dari drizzle-kit)
- Modify: `packages/drizzle-schema/migrations/meta/_journal.json` (digenerate)

**Interfaces:**
- Consumes: —
- Produces: tidak ada API baru. Nama tabel/kolom tidak berubah, jadi tidak ada task lain yang terpengaruh.

- [ ] **Step 1: Tambahkan index di `auth.ts`**

Tambahkan `index` ke import baris 1, lalu tambahkan callback tabel ke `sessions` dan `otp_codes`. `users.email` dan `sessions.refresh_token` dan `password_reset_tokens.token_hash` sudah `.unique()` (Postgres otomatis membuat index untuk unique constraint), jadi jangan ditambah lagi.

```ts
import { pgSchema, uuid, varchar, boolean, timestamp, inet, text, index } from 'drizzle-orm/pg-core';
```

Pada `users` (tutup dengan callback setelah object kolom):
```ts
}, (t) => ({
  // users.tenant_id dipakai tenant-service untuk list staf; tidak punya FK jadi tidak dapat index gratis.
  tenantIdx: index('users_tenant_id_idx').on(t.tenant_id),
}));
```

Pada `sessions`:
```ts
}, (t) => ({
  userIdx: index('sessions_user_id_idx').on(t.user_id),
  // dipakai job pembersihan sesi kedaluwarsa (Task modul 2).
  expiresIdx: index('sessions_expires_at_idx').on(t.expires_at),
}));
```

Pada `otp_codes`:
```ts
}, (t) => ({
  // verifikasi OTP mencari (user_id, code) bersamaan.
  userCodeIdx: index('otp_codes_user_id_code_idx').on(t.user_id, t.code),
}));
```

Pada `password_reset_tokens`:
```ts
}, (t) => ({
  userIdx: index('password_reset_tokens_user_id_idx').on(t.user_id),
}));
```

- [ ] **Step 2: Tambahkan index di `tenant.ts`**

Tambahkan `index` ke import baris 1. Pada `tenants`:
```ts
}, (t) => ({
  // semua list admin memfilter deleted_at IS NULL.
  deletedIdx: index('tenants_deleted_at_idx').on(t.deleted_at),
  statusIdx: index('tenants_status_idx').on(t.status),
}));
```
Pada `outlets`: `tenantIdx: index('outlets_tenant_id_idx').on(t.tenant_id)`.
Pada `customers`: `tenantIdx: index('customers_tenant_id_idx').on(t.tenant_id)`.
`tenant_feature_overrides` sudah punya unique `(tenant_id, feature_key)` — kolom pertamanya `tenant_id`, jadi index itu sudah melayani filter per-tenant. **Jangan ditambah.**

- [ ] **Step 3: Tambahkan index di `catalog.ts`**

```ts
// categories
}, (t) => ({ tenantIdx: index('categories_tenant_id_idx').on(t.tenant_id) }));
// menus — halaman menu memfilter tenant lalu mengelompokkan per kategori
}, (t) => ({ tenantCategoryIdx: index('menus_tenant_id_category_id_idx').on(t.tenant_id, t.category_id) }));
// variant_groups
}, (t) => ({ tenantIdx: index('variant_groups_tenant_id_idx').on(t.tenant_id) }));
// variant_options
}, (t) => ({ groupIdx: index('variant_options_group_id_idx').on(t.group_id) }));
// menu_variant_groups — tabel join, kedua arah dipakai
}, (t) => ({
  menuIdx: index('menu_variant_groups_menu_id_idx').on(t.menu_id),
  groupIdx: index('menu_variant_groups_variant_group_id_idx').on(t.variant_group_id),
}));
// stock_levels — menu_id sudah .unique(); yang kurang hanya tenant_id
}, (t) => ({ tenantIdx: index('stock_levels_tenant_id_idx').on(t.tenant_id) }));
```

- [ ] **Step 4: Tambahkan index di `pos.ts` — ini yang paling penting**

```ts
// pos_shifts
}, (t) => ({
  // cek "ada shift terbuka?" memfilter tenant + status.
  tenantStatusIdx: index('pos_shifts_tenant_id_status_idx').on(t.tenant_id, t.status),
}));
// pos_orders — index terpenting di seluruh database:
// dipakai SEMUA laporan, dashboard, dan list order.
}, (t) => ({
  tenantCreatedIdx: index('pos_orders_tenant_id_created_at_idx').on(t.tenant_id, t.created_at),
  shiftIdx: index('pos_orders_shift_id_idx').on(t.shift_id),
}));
// pos_order_items — FK order_id tanpa index; setiap join struk & laporan lewat sini
}, (t) => ({ orderIdx: index('pos_order_items_order_id_idx').on(t.order_id) }));
```

- [ ] **Step 5: Tambahkan index di `restaurant.ts`, `bom.ts`, `resto.ts`, `admin.ts`, `offline.ts`**

```ts
// restaurant_tables — CATATAN: qr_token sudah .notNull().unique() (restaurant.ts:18),
// jadi Postgres sudah membuat index untuknya. JANGAN tambah index qr_token lagi.
}, (t) => ({
  tenantIdx: index('restaurant_tables_tenant_id_idx').on(t.tenant_id),
}));
// kitchen_tickets — KDS memfilter tenant + status; order_id sudah .unique()
}, (t) => ({ tenantStatusIdx: index('kitchen_tickets_tenant_id_status_idx').on(t.tenant_id, t.status) }));

// ingredients
}, (t) => ({ tenantIdx: index('ingredients_tenant_id_idx').on(t.tenant_id) }));
// recipe_items — BOM dibaca per menu
}, (t) => ({ tenantMenuIdx: index('recipe_items_tenant_id_menu_id_idx').on(t.tenant_id, t.menu_id) }));

// branch_transfers
}, (t) => ({ tenantIdx: index('branch_transfers_tenant_id_idx').on(t.tenant_id) }));
// branch_transfer_items
}, (t) => ({ transferIdx: index('branch_transfer_items_transfer_id_idx').on(t.transfer_id) }));
// loyalty_members — lookup member pakai nomor HP
}, (t) => ({ tenantPhoneIdx: index('loyalty_members_tenant_id_phone_idx').on(t.tenant_id, t.phone) }));
// loyalty_point_logs
}, (t) => ({ tenantMemberIdx: index('loyalty_point_logs_tenant_id_member_id_idx').on(t.tenant_id, t.member_id) }));
// loyalty_broadcasts
}, (t) => ({ tenantIdx: index('loyalty_broadcasts_tenant_id_idx').on(t.tenant_id) }));
// attendance_logs — rekap absensi per tenant per tanggal
}, (t) => ({ tenantDateIdx: index('attendance_logs_tenant_id_date_idx').on(t.tenant_id, t.date) }));
// operational_expenses — laporan P&L memfilter tenant + rentang tanggal
}, (t) => ({ tenantSpentIdx: index('operational_expenses_tenant_id_spent_at_idx').on(t.tenant_id, t.spent_at) }));
// ingredient_waste_logs
}, (t) => ({ tenantIdx: index('ingredient_waste_logs_tenant_id_idx').on(t.tenant_id) }));

// leads
}, (t) => ({
  deletedIdx: index('leads_deleted_at_idx').on(t.deleted_at),
  statusIdx: index('leads_status_idx').on(t.status),
}));
// lead_notes
}, (t) => ({ leadIdx: index('lead_notes_lead_id_idx').on(t.lead_id) }));
// billing_records
}, (t) => ({ tenantIdx: index('billing_records_tenant_id_idx').on(t.tenant_id) }));
// admin_audit_logs — halaman audit mengurut created_at desc
}, (t) => ({ createdIdx: index('admin_audit_logs_created_at_idx').on(t.created_at) }));

// offline_clients
}, (t) => ({ deletedIdx: index('offline_clients_deleted_at_idx').on(t.deleted_at) }));
// offline_licenses
}, (t) => ({ clientIdx: index('offline_licenses_client_id_idx').on(t.client_id) }));
```

Nama kolom di atas sudah diverifikasi terhadap schema: `leads.status` ada (`admin.ts:15`), `leads.deleted_at` ada (`admin.ts:23`), `restaurant_tables.status` ada (`restaurant.ts:12`), `kitchen_tickets.status` ada (`restaurant.ts:28`). Total `CREATE INDEX` yang diharapkan: **39** (auth 5, tenant 4, catalog 7, pos 4, restaurant 2, bom 2, resto 8, admin 5, offline 2).

- [ ] **Step 6: Type-check schema sebelum generate**

Run: `cd packages/drizzle-schema && pnpm exec tsc --noEmit`
Expected: 0 error. Kalau ada error "Object literal may only specify known properties", berarti ada tabel yang sudah punya callback (mis. `tenant_feature_overrides`) — gabungkan entry index ke callback yang sudah ada, jangan tambah callback kedua.

- [ ] **Step 7: Generate migrasi 0017**

`drizzle.config.ts` membaca skema dari `./dist/index.js`, jadi **wajib build dulu** — script `db:generate` sudah melakukannya (`tsc && drizzle-kit generate`).

Run: `cd packages/drizzle-schema && pnpm db:generate`
Expected: file baru `migrations/0017_<nama-acak>.sql` dan entry `"idx": 17` di `migrations/meta/_journal.json`.

- [ ] **Step 8: Review SQL yang digenerate**

Run: `cat packages/drizzle-schema/migrations/0017_*.sql`

Verifikasi manual:
- Setiap statement adalah `CREATE INDEX` (atau `CREATE INDEX IF NOT EXISTS`), **tidak ada** `DROP`, `ALTER TABLE ... DROP COLUMN`, atau `ALTER COLUMN`. Kalau ada, berarti `dist/` tadi basi — jalankan `pnpm --filter @ipos-cloud/drizzle-schema build` lalu generate ulang.
- Semua nama tabel berprefix `"inspirapos_v2"."..."`.
- Jumlah `CREATE INDEX` = **39**. Kalau 40, kemungkinan index `qr_token` ikut terdeklarasi padahal kolomnya sudah unique — hapus. Kalau kurang dari 39, ada tabel yang callback-nya belum ditambahkan.

Run: `grep -c "CREATE INDEX" packages/drizzle-schema/migrations/0017_*.sql`
Run: `grep -iE "DROP|ALTER COLUMN" packages/drizzle-schema/migrations/0017_*.sql || echo "bersih: tidak ada statement destruktif"`

- [ ] **Step 9: Tambahkan `CONCURRENTLY` untuk tabel besar — HANYA kalau produksi sudah punya data**

Drizzle menggenerate `CREATE INDEX` biasa, yang mengambil lock tulis pada tabel. Untuk `pos_orders` dan `pos_order_items` di database yang sudah berisi data produksi, ini memblokir kasir selama index dibangun.

Kalau database target masih kosong/kecil: **lewati step ini**.

Kalau sudah ada data produksi: jangan ubah file migrasi (drizzle-kit menjalankan migrasi dalam transaksi, dan `CREATE INDEX CONCURRENTLY` tidak bisa jalan di dalam transaksi). Sebagai gantinya, catat di `docs/audit-fase-1.md` bahwa dua index ini harus dibuat manual di luar `pnpm db:migrate`:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS pos_orders_tenant_id_created_at_idx
  ON "inspirapos_v2"."pos_orders" (tenant_id, created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS pos_order_items_order_id_idx
  ON "inspirapos_v2"."pos_order_items" (order_id);
```
lalu hapus dua statement itu dari `0017_*.sql` sebelum commit.

- [ ] **Step 10: Type-check & test seluruh workspace**

Run: `pnpm build:packages && pnpm -r type-check && pnpm -r test`
Expected: bersih. (Migrasi belum diterapkan ke DB — itu langkah operasional terpisah, bukan bagian task ini.)

- [ ] **Step 11: Commit**

```bash
git add packages/drizzle-schema/src packages/drizzle-schema/migrations
git commit -m "perf(schema): tambah 34 index — sebelumnya nol index di 37 tabel

Tidak ada satu pun CREATE INDEX di 17 migrasi sebelumnya, sehingga setiap
query bertenant adalah seq scan penuh dan biayanya tumbuh mengikuti data
seluruh platform, bukan data tenant itu saja.

Index dideklarasikan di src/*.ts (bukan SQL tangan) supaya db:generate
berikutnya tidak menghapusnya lagi."
```

---

### Task 4: Hapus duplikasi `PLAN_FEATURES` antara backend dan frontend

`apps/tenant-app/lib/plan-features.ts` menyalin `PLAN_FEATURES` dari `packages/shared/src/feature-gate.ts`. Komentarnya menyebut alasannya: `@ipos-cloud/shared` me-re-export `db.ts`/`redis.ts`, jadi mengimpornya menarik `pg` + `ioredis` + `@aws-sdk/client-s3` ke bundle browser.

Hari ini kedua salinan **identik byte-per-byte** (sudah diverifikasi). Yang diperbaiki di sini bukan drift-nya, tapi penyebabnya: barrel export yang memaksa duplikasi.

**Files:**
- Create: `packages/shared/src/plan-features.ts`
- Modify: `packages/shared/src/feature-gate.ts` (hapus `PLAN_FEATURES`, re-export dari file baru)
- Modify: `packages/shared/package.json` (tambah `exports` map)
- Modify: `packages/shared/tsconfig.json` (pastikan `declaration: true` — cek dulu, kemungkinan sudah)
- Modify: `apps/tenant-app/package.json` (tambah dependency `@ipos-cloud/shared`)
- Modify: `apps/tenant-app/lib/plan-features.ts` (jadi re-export tipis, atau dihapus)
- Test: `packages/shared/src/plan-features.test.ts` (create)

**Interfaces:**
- Consumes: `TenantPlan` dari `./types.js`.
- Produces dari `@ipos-cloud/shared/plan-features` (tanpa dependency runtime apa pun):
  - `PLAN_FEATURES: Record<TenantPlan, string[]>`
  - `planHasFeature(plan: TenantPlan | null | undefined, featureKey: string, overrides?: Record<string, boolean>): boolean`

- [ ] **Step 1: Tulis test yang gagal**

Buat `packages/shared/src/plan-features.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAN_FEATURES, planHasFeature } from './plan-features.js';

test('plan-features tidak menarik dependency native', () => {
  // Kalau file ini sampai mengimpor db/redis/r2, require.cache akan memuat pg.
  // Ini penjaga agar file tetap aman dipakai di bundle browser.
  const loaded = Object.keys(require.cache).filter((p) => /node_modules[\\/](pg|ioredis|@aws-sdk)[\\/]/.test(p));
  assert.deepEqual(loaded, [], `plan-features menarik dependency native: ${loaded.join(', ')}`);
});

test('umkm_lite punya basic_pos tapi tidak punya stock_management', () => {
  assert.equal(planHasFeature('umkm_lite', 'basic_pos'), true);
  assert.equal(planHasFeature('umkm_lite', 'stock_management'), false);
});

test('override true memberi fitur yang tidak ada di plan', () => {
  assert.equal(planHasFeature('umkm_lite', 'stock_management', { stock_management: true }), true);
});

test('override false mencabut fitur yang ada di plan', () => {
  assert.equal(planHasFeature('umkm_pro', 'void_transaction', { void_transaction: false }), false);
});

test('plan null selalu false walau ada override', () => {
  assert.equal(planHasFeature(null, 'basic_pos', { basic_pos: true }), false);
});

test('resto_business adalah superset resto_pro', () => {
  for (const f of PLAN_FEATURES.resto_pro) {
    assert.ok(PLAN_FEATURES.resto_business.includes(f), `resto_business kehilangan ${f}`);
  }
});
```

- [ ] **Step 2: Jalankan test, pastikan GAGAL**

Run: `cd packages/shared && pnpm exec tsx --test "src/plan-features.test.ts"`
Expected: FAIL — `Cannot find module './plan-features.js'`.

- [ ] **Step 3: Buat `plan-features.ts`**

Buat `packages/shared/src/plan-features.ts`. Pindahkan blok `PLAN_FEATURES` **apa adanya** dari `feature-gate.ts:7-35` (jangan diubah isinya — perubahan daftar fitur adalah keputusan produk, bukan bagian task ini):

Isi file: header di bawah ini, lalu **potong-tempel baris 7-35 `feature-gate.ts` apa adanya** (blok `export const PLAN_FEATURES: Record<TenantPlan, string[]> = { ... };`). Jangan mengetik ulang daftar fiturnya — 6 plan × sampai 20 fitur, dan salah ketik satu string berarti tenant kehilangan fitur yang dibayar. Perubahan isi daftar adalah keputusan produk, bukan bagian task ini.

```ts
import type { TenantPlan } from './types.js';

// File ini SENGAJA tidak mengimpor apa pun selain tipe: dipakai bareng oleh
// backend (feature-gate.ts) dan bundle browser tenant-app. Jangan tambahkan
// import ke db.ts/redis.ts/r2.ts di sini.

// <-- blok PLAN_FEATURES yang dipotong dari feature-gate.ts:7-35 masuk di sini -->


/** Evaluasi fitur murni di memori — overrides sudah di tangan pemanggil. */
export function planHasFeature(
  plan: TenantPlan | null | undefined,
  featureKey: string,
  overrides?: Record<string, boolean>
): boolean {
  if (!plan) return false;
  if (overrides && featureKey in overrides) return overrides[featureKey];
  return PLAN_FEATURES[plan]?.includes(featureKey) ?? false;
}
```

- [ ] **Step 4: `feature-gate.ts` mengonsumsi file baru dan mendelegasikan cek tier**

Di `packages/shared/src/feature-gate.ts`: hapus deklarasi `PLAN_FEATURES` (baris 7-35) dan ganti dengan re-export, supaya pemanggil backend yang sudah ada tidak rusak:

```ts
export { PLAN_FEATURES, planHasFeature } from './plan-features.js';
import { PLAN_FEATURES, planHasFeature } from './plan-features.js';
```

Lalu **ganti bagian akhir `hasFeature`** (blok `const features = PLAN_FEATURES[plan]; ...` yang ditulis di Task 2) supaya mendelegasikan ke `planHasFeature`, bukan mengulang logikanya:

```ts
export async function hasFeature(
  db: Db,
  tenantId: string,
  plan: TenantPlan | undefined | null,
  featureKey: string
): Promise<boolean> {
  if (!plan) return false;

  // WHERE sudah memfilter feature_key, jadi baris pertama (kalau ada) sudah pasti key yang dicari.
  const [override] = await db
    .select({ is_enabled: tenant_feature_overrides.is_enabled })
    .from(tenant_feature_overrides)
    .where(and(eq(tenant_feature_overrides.tenant_id, tenantId), eq(tenant_feature_overrides.feature_key, featureKey)))
    .limit(1);

  if (override) return override.is_enabled;

  if (!PLAN_FEATURES[plan]) {
    // plan_code default kolom adalah 'trial', yang bukan anggota TenantPlan. Dulu ini
    // diam-diam mengembalikan false sehingga tenant kehilangan SEMUA fitur tanpa jejak.
    console.warn(`[feature-gate] plan tidak dikenal "${plan}" untuk tenant ${tenantId} — semua fitur ditolak`);
    return false;
  }

  // Delegasi, bukan duplikasi: satu-satunya beda antara versi backend dan versi
  // browser adalah DARI MANA override-nya datang (query DB vs sudah di tangan).
  // Cek tier-nya sama, jadi hanya ada satu implementasi.
  return planHasFeature(plan, featureKey);
}
```

Jangan disederhanakan lebih jauh: `PLAN_FEATURES[plan]` masih diperiksa untuk membedakan "plan tidak dikenal" dari "plan dikenal tapi tidak punya fitur itu". `planHasFeature` mengembalikan `false` untuk keduanya, jadi menghapus cek itu akan menghilangkan log peringatannya.

- [ ] **Step 4b: Verifikasi blok PLAN_FEATURES benar-benar dipindah, bukan diketik ulang**

Run: `cd packages/shared && git diff -U0 src/feature-gate.ts src/plan-features.ts | grep -E '^[+-]\s+(umkm|resto)_' | sed 's/^[+-]//' | sort | uniq -c | awk '$1 != 2 { print "TIDAK SIMETRIS:", $0 }'`

Expected: tidak ada output. Setiap baris plan yang hilang dari `feature-gate.ts` harus muncul identik di `plan-features.ts`. Kalau ada baris "TIDAK SIMETRIS", ada karakter yang berubah saat pindah — perbaiki sebelum lanjut.

- [ ] **Step 5: Jalankan test, pastikan LULUS**

Run: `cd packages/shared && pnpm exec tsx --test "src/**/*.test.ts"`
Expected: PASS semua (db 2 + redis 2 + feature-gate 9 + plan-features 6 = 19).

- [ ] **Step 6: Tambahkan `exports` map**

Di `packages/shared/package.json`, tambahkan di samping `main`/`types` yang sudah ada (biarkan keduanya untuk resolver lama):

```json
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "./plan-features": { "types": "./dist/plan-features.d.ts", "default": "./dist/plan-features.js" }
  },
```

- [ ] **Step 7: Verifikasi subpath benar-benar resolve**

Run: `pnpm --filter @ipos-cloud/shared build && ls packages/shared/dist/plan-features.js packages/shared/dist/plan-features.d.ts`
Expected: kedua file ada. Kalau `.d.ts` tidak ada, tambahkan `"declaration": true` di `packages/shared/tsconfig.json`.

- [ ] **Step 8: Tenant-app mengonsumsi subpath**

Tambahkan ke `apps/tenant-app/package.json` bagian `dependencies`:
```json
    "@ipos-cloud/shared": "workspace:*",
```

Run: `pnpm install`

Ganti seluruh isi `apps/tenant-app/lib/plan-features.ts` dengan re-export tipis, supaya 12+ pengimpor yang ada tidak perlu diubah:

```ts
// Satu sumber kebenaran: packages/shared/src/plan-features.ts.
// Subpath ini sengaja tidak menarik pg/ioredis/aws-sdk, jadi aman di bundle browser.
export { PLAN_FEATURES, planHasFeature } from '@ipos-cloud/shared/plan-features';

// Nama lama yang dipakai PlanGate/Sidebar/menu/insight. Tanda tangannya identik dengan
// planHasFeature, jadi tidak ada call site yang perlu diubah.
export { planHasFeature as hasFeature } from '@ipos-cloud/shared/plan-features';
```

Tanda tangan `hasFeature` lama sudah diverifikasi **identik** dengan `planHasFeature` — `(plan, featureKey, overrides?)`, dengan urutan cek yang sama. Keempat pemanggil (`components/PlanGate.tsx:14`, `components/layout/Sidebar.tsx:24`, `app/(dashboard)/menu/page.tsx:261`, `app/laporan/insight/page.tsx:30`) tidak perlu disentuh di task ini.

Catatan untuk Modul 6, **jangan diperbaiki di sini**: `Sidebar.tsx:24` memanggil `hasFeature(tenant.plan, item.featureKey)` tanpa argumen ketiga, sementara `PlanGate.tsx:14` mengopernya. Itulah sebabnya menu tampak bergembok padahal halamannya terbuka untuk tenant yang diberi override. Perbaikannya satu baris, tapi menyentuh perilaku UI — biarkan Modul 6 yang mengerjakan supaya perubahan dan verifikasi visualnya satu commit.

- [ ] **Step 9: Build tenant-app & pastikan bundle tidak menarik `pg`**

Run: `pnpm --filter tenant-app build`
Expected: build sukses.

Run: `grep -rl "pg-connection-string\|ioredis" apps/tenant-app/.next/static 2>/dev/null || echo "bersih: tidak ada dependency native di bundle klien"`
Expected: pesan "bersih".

- [ ] **Step 10: Type-check & test seluruh workspace**

Run: `pnpm build:packages && pnpm -r type-check && pnpm -r test`
Expected: bersih.

- [ ] **Step 11: Commit**

```bash
git add packages/shared apps/tenant-app/package.json apps/tenant-app/lib/plan-features.ts pnpm-lock.yaml
git commit -m "refactor(shared): PLAN_FEATURES jadi satu sumber lewat subpath export

Duplikasi frontend/backend ada karena barrel export @ipos-cloud/shared
menarik pg+ioredis+aws-sdk ke bundle browser. Diperbaiki di penyebabnya:
plan-features.ts tanpa dependency runtime + exports map subpath, sehingga
salinan di tenant-app bisa dihapus dan drift jadi mustahil."
```

---

### Task 5: Constraint unik yang hilang (`menu_variant_groups`, `attendance_logs`)

`menu_variant_groups` tidak punya primary key maupun unique — grup variasi bisa terpasang ganda ke satu menu dan tidak ada cara menghapus satu baris secara pasti. `attendance_logs` tidak punya unique `(tenant_id, user_id, date)` — satu karyawan bisa punya banyak baris absensi untuk hari yang sama, dan rekapnya salah.

Task ini **menyentuh data yang sudah ada**, jadi dedupe harus jalan sebelum constraint dipasang.

**Files:**
- Modify: `packages/drizzle-schema/src/catalog.ts` (`menu_variant_groups`)
- Modify: `packages/drizzle-schema/src/resto.ts` (`attendance_logs`)
- Create: `packages/drizzle-schema/migrations/0018_*.sql` (digenerate, lalu **diedit tangan** untuk menyisipkan dedupe)

**Interfaces:**
- Consumes: —
- Produces: tidak ada API baru.

- [ ] **Step 1: Deklarasikan constraint di schema**

Di `packages/drizzle-schema/src/catalog.ts`, tambahkan `primaryKey` ke import dari `drizzle-orm/pg-core`, lalu pada `menu_variant_groups` gabungkan ke callback yang sudah dibuat di Task 3:

```ts
}, (t) => ({
  pk: primaryKey({ columns: [t.menu_id, t.variant_group_id] }),
  menuIdx: index('menu_variant_groups_menu_id_idx').on(t.menu_id),
  groupIdx: index('menu_variant_groups_variant_group_id_idx').on(t.variant_group_id),
}));
```

Di `packages/drizzle-schema/src/resto.ts`, tambahkan `unique` ke import, lalu pada `attendance_logs`:

```ts
}, (t) => ({
  tenantDateIdx: index('attendance_logs_tenant_id_date_idx').on(t.tenant_id, t.date),
  perUserPerDay: unique('attendance_logs_tenant_id_user_id_date_unique').on(t.tenant_id, t.user_id, t.date),
}));
```

- [ ] **Step 2: Generate migrasi 0018**

Run: `cd packages/drizzle-schema && pnpm db:generate`
Expected: `migrations/0018_<nama-acak>.sql` berisi `ALTER TABLE ... ADD CONSTRAINT`.

- [ ] **Step 3: Sisipkan dedupe SEBELUM setiap ADD CONSTRAINT**

Buka `migrations/0018_*.sql`. Di paling atas file, sebelum statement `ADD CONSTRAINT` mana pun, sisipkan dua blok dedupe. Tanpa ini, migrasi gagal keras di database yang sudah punya baris duplikat.

```sql
-- Dedupe menu_variant_groups: sisakan satu baris per (menu_id, variant_group_id).
-- Tabel ini tidak punya kolom id, jadi dedupe memakai ctid (alamat fisik baris).
DELETE FROM "inspirapos_v2"."menu_variant_groups" a
  USING "inspirapos_v2"."menu_variant_groups" b
  WHERE a.ctid > b.ctid
    AND a.menu_id = b.menu_id
    AND a.variant_group_id = b.variant_group_id;
--> statement-breakpoint

-- Dedupe attendance_logs: sisakan baris paling lengkap per (tenant_id, user_id, date).
-- Tabel ini TIDAK punya kolom created_at (sudah diverifikasi, resto.ts:65-73), jadi
-- urutan memakai clock_out_at lalu clock_in_at — baris yang sudah clock-out dimenangkan.
DELETE FROM "inspirapos_v2"."attendance_logs"
  WHERE id NOT IN (
    SELECT DISTINCT ON (tenant_id, user_id, date) id
      FROM "inspirapos_v2"."attendance_logs"
      ORDER BY tenant_id, user_id, date,
               clock_out_at DESC NULLS LAST,
               clock_in_at DESC NULLS LAST
  );
--> statement-breakpoint
```

Kolom `attendance_logs` yang tersedia (terverifikasi): `id`, `tenant_id`, `user_id`, `date`, `clock_in_at`, `clock_out_at`, `status`.

- [ ] **Step 4: Verifikasi urutan statement**

Run: `cat packages/drizzle-schema/migrations/0018_*.sql`
Expected: dua `DELETE` muncul **sebelum** `ADD CONSTRAINT` mana pun. Kalau tidak, pindahkan.

- [ ] **Step 5: Type-check & test**

Run: `pnpm build:packages && pnpm -r type-check && pnpm -r test`
Expected: bersih.

- [ ] **Step 6: Commit**

```bash
git add packages/drizzle-schema/src packages/drizzle-schema/migrations
git commit -m "fix(schema): PK untuk menu_variant_groups + unique absensi per user per hari

Keduanya disertai dedupe di migrasi yang sama, karena constraint ini
dipasang ke tabel yang mungkin sudah punya baris duplikat di produksi."
```

---

## Kriteria "selesai" Modul 1

- [ ] `pnpm -r type-check` bersih
- [ ] `pnpm -r test` lulus, **28 test** total di workspace: `packages/shared` 19 (db 2 + redis 2 + feature-gate 9 + plan-features 6) + `report-service` 7 + `tenant-app` 2
- [ ] `grep -rn "server\.db" packages services --include=*.ts | grep -v node_modules` → kosong
- [ ] `grep -c "CREATE INDEX" packages/drizzle-schema/migrations/0017_*.sql` → 39
- [ ] `apps/tenant-app/lib/plan-features.ts` tidak lagi memuat literal daftar fitur
- [ ] Bundle `apps/tenant-app/.next/static` tidak memuat `pg`/`ioredis`
- [ ] `pnpm --filter tenant-app build` dan `pnpm --filter admin-app build` sukses

## Dependency ke modul lain

- **Task 2 wajib menyentuh call site di 5 service** (pos, inventory, kitchen, table, report) dan 3 file tenant-service. Itu tidak bisa ditunda ke modul 4, karena perubahan tanda tangan bersifat atomik — repo tidak akan compile kalau dikerjakan separuh. Yang disentuh **hanya** baris pemanggilan `requireFeature`; jangan perbaiki masalah lain di file-file itu, biarkan untuk modul masing-masing.
- **Modul 2 (auth-service)** bergantung pada `sessions_expires_at_idx` dari Task 3 untuk job pembersihan sesi.
- **Modul 4** bergantung pada `requireFeature` yang sudah benar sebelum bisa memperbaiki query KDS tak berfilter — dua bug itu saling menutupi.
- **Modul 6 (tenant-app)** bergantung pada Task 4 sebelum menyentuh `PlanGate`/`Sidebar`.

## Yang SENGAJA tidak dikerjakan di modul ini

- `users.tenant_id`/`outlet_id` tanpa FK — menambahkan FK butuh pembersihan user yatim lebih dulu, dan itu keputusan data, bukan skema. Masuk daftar tersendiri.
- `tenants.plan_code` default `'trial'` — mengubah default kolom mempengaruhi alur pembuatan tenant di tenant-service. Dipindah ke modul 3 supaya perubahan dan pemanggilnya satu commit.
- `ingredients.cost_per_unit` integer yang membulatkan harga < Rp1/gram — perubahan tipe kolom uang butuh migrasi data. Butuh keputusan produk soal presisi.
- Pembersihan `sessions`/`otp_codes`/`password_reset_tokens` yang tumbuh tanpa batas — masuk modul 2 bersama perbaikan sesi lainnya.
- `JwtPayload`/`ApiError`/`UserRole` diekspor tapi tidak pernah diimpor; route auth memakai `as any` (`src/types.ts:5-18`). Membuat tipe ini benar-benar dipakai berarti menyentuh setiap handler di auth-service — itu pekerjaan modul 2, dan `JwtPayload` juga perlu field `impersonated_by` yang baru ditambahkan di sana. Menunggu modul 2.
- `logAdminAction` tanpa try/catch dan di luar transaksi pemanggil (`src/audit.ts:16-27`) — perilaku yang benar (gagal keras vs diam) ditentukan oleh pemanggilnya di tenant-service. **Modul 3.**
- Event `order.created` yang dideklarasikan tapi tidak pernah di-publish, dan `tenantEventsChannel` yang punya dua sumber kebenaran (`src/realtime.ts:5` vs `websocket-gateway/src/index.ts:45`) — yang harus berubah adalah pos-service (publisher-nya) dan gateway. **Modul 4.**
