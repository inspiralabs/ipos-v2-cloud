# tenant-app Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Selaraskan tenant-app (Next.js) dengan design handoff baru (`docs/design_handoff_tenant_app_redesign/`) di semua 10 area screen, dan bangun backend pendukung (migration + 3 service) yang sebelumnya belum ada sehingga data binding nyata (bukan mock).

**Architecture:** 4 lapisan, eksekusi bottom-up: (1) migration DB `stock_levels`, (2) 3 endpoint backend baru + 1 fix data, (3) token global + komponen shared (ink-fill nav-active, Badge variant), (4) redesign 10 screen memakai hasil lapisan 2-3. Setiap screen task mandiri secara fungsional (tidak saling bergantung satu sama lain di lapisan 4), tapi semuanya bergantung pada lapisan 1-3 selesai lebih dulu.

**Tech Stack:** Next.js 15 App Router, React, Tailwind CSS v4, Fastify + Drizzle ORM (Postgres/Supabase), `@fastify/jwt`, Zod, Recharts, framer-motion, lucide-react.

## Global Constraints

- Warna: `--primary` (maroon, bisa diganti owner via 9 preset) HANYA untuk CTA primer (Bayar/Simpan/Tambah/Konfirmasi) dan penekanan harga/diskon — TIDAK PERNAH untuk chip/tab/filter aktif.
- Chip/tab/filter/pill navigasi aktif (kategori POS, period switcher Laporan, tab Pelanggan/Kelola Staf) pakai token ink-fill baru `--nav-active` (`oklch` setara `#1a1310`), teks putih.
- `--accent` (gold `#d0a139`) tetap fixed, tidak ikut berubah saat owner ganti warna toko — dipakai badge trial/premium saja.
- Semua target sentuh ≥44px, feedback tekan `active:scale-95` — kecuali qty stepper cart POS yang secara eksplisit 28px di handoff (perkecualian yang didokumentasikan di handoff, bukan pelanggaran aturan 44px).
- Semua angka uang pakai `tabular-nums` (Tailwind class `tabular-nums`) dan bold.
- Bahasa: Indonesia sehari-hari, hindari istilah sistem ("record", "database", "sinkronisasi gagal").
- Ikuti `apps/tenant-app/DESIGN.md` untuk radius (12-16px), shadow vocabulary (`shadow-sm`+border untuk card-rest, `shadow-lg`/`shadow-xl` untuk overlay), Do's/Don'ts (tidak ada gradient text, tidak ada nested card, tidak ada border-left/right tebal sebagai aksen).
- Backend: setiap endpoint tenant-scoped WAJIB filter `tenant_id` dari JWT (`request.user.tenant_id`), pola error `{ error: string, code: string }`, auth via `requireAuth`/`tenantGuard` preHandler sesuai service.
- Style testing backend: assert-based self-check script dijalankan via `tsx` (ikuti pola `services/report-service/src/date-range.test.ts`), BUKAN framework test — tidak ada test runner terpasang di monorepo ini.
- Frontend tenant-app TIDAK punya test setup — verifikasi lewat `pnpm type-check` + manual run (dev server + browser) per screen, bukan unit test palsu.
- JANGAN jalankan `db:migrate` terhadap database (kredensial Supabase production di `.env`) tanpa konfirmasi eksplisit user di sesi ini — generate migration file saja, migrate dikonfirmasi terpisah.

---

## Bagian A — Migration & Backend (Lapisan 1-2)

### Task A1: Migration `stock_levels`

**Files:**
- Modify: `packages/drizzle-schema/src/catalog.ts` (tambah tabel baru di akhir file)

**Interfaces:**
- Produces: `stock_levels` table — kolom `id`, `tenant_id`, `menu_id` (unique), `stock_qty`, `low_stock_threshold`, `updated_at`. Dipakai Task A2 (inventory-service) dan Task D6 (UI Inventory).

- [ ] **Step 1: Tambah definisi tabel**

Tambahkan di akhir `packages/drizzle-schema/src/catalog.ts`:

```typescript
export const stock_levels = inspirapos.table('stock_levels', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  menu_id: uuid('menu_id').notNull().references(() => menus.id, { onDelete: 'cascade' }).unique(),
  stock_qty: integer('stock_qty').notNull().default(0),
  low_stock_threshold: integer('low_stock_threshold').notNull().default(5),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Cek export barrel**

Buka `packages/drizzle-schema/src/index.ts`, pastikan sudah `export *` dari `catalog.js` (tidak perlu tambahan kalau sudah wildcard export).

- [ ] **Step 3: Generate migration file**

Run dari root `ipos-cloud`:
```bash
pnpm db:generate
```
Expected: file SQL baru muncul di `packages/drizzle-schema/migrations/` berisi `CREATE TABLE stock_levels`. JANGAN jalankan `pnpm db:migrate` — itu menyentuh database production, tunggu konfirmasi user terpisah.

- [ ] **Step 4: Build package**

```bash
pnpm --filter @ipos-cloud/drizzle-schema build
```
Expected: build sukses tanpa error TypeScript.

- [ ] **Step 5: Commit**

```bash
git add packages/drizzle-schema/src/catalog.ts packages/drizzle-schema/migrations packages/drizzle-schema/dist
git commit -m "feat(drizzle-schema): tambah tabel stock_levels untuk fitur inventory"
```

---

### Task A2: `inventory-service` — endpoint stok

**Files:**
- Modify: `services/inventory-service/package.json` (tambah dependency)
- Modify: `services/inventory-service/src/index.ts` (full rewrite — service ini masih skeleton)
- Modify: `services/inventory-service/.env` — pastikan `DATABASE_URL`, `JWT_PUBLIC_KEY`, `PORT` ada (copy pola dari `services/report-service/.env` kalau belum ada; JANGAN tempel nilai kredensial baru di sini, gunakan file `.env` service ini sendiri yang sudah ada di working directory)

**Interfaces:**
- Consumes: `stock_levels`, `menus` dari `@ipos-cloud/drizzle-schema` (Task A1). `createDb`, `requireFeature` dari `@ipos-cloud/shared` (pola sama seperti `services/report-service/src/index.ts:7`).
- Produces:
  - `GET /api/v1/inventory/stock-levels` → `{ menu_id: string, menu_name: string, stock_qty: number, low_stock_threshold: number }[]`
  - `POST /api/v1/inventory/stock-levels/:menu_id/restock` body `{ qty_added: number }` → `{ menu_id, menu_name, stock_qty, low_stock_threshold }` (row setelah update)
  - Dipakai Task D6 (UI Inventory redesign).

- [ ] **Step 1: Tambah dependency**

Edit `services/inventory-service/package.json`, tambahkan ke `dependencies` (samakan versi dengan `services/report-service/package.json`):

```json
    "@fastify/jwt": "^10.1.0",
    "@ipos-cloud/drizzle-schema": "workspace:*",
    "@ipos-cloud/shared": "workspace:*",
    "drizzle-orm": "^0.36.0",
    "zod": "^3.23.8"
```

Run:
```bash
pnpm install
```
Expected: lockfile update sukses, tidak ada error resolusi dependency.

- [ ] **Step 2: Tulis ulang `src/index.ts` dengan auth + endpoint**

Ganti seluruh isi `services/inventory-service/src/index.ts`:

```typescript
import 'dotenv/config';
import Fastify, { type FastifyRequest, type FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';
import { createDb, requireFeature } from '@ipos-cloud/shared';
import { menus, stock_levels } from '@ipos-cloud/drizzle-schema';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info' } });
app.register(cors, { origin: process.env.CORS_ORIGIN || true, credentials: true });
app.register(jwt, {
  secret: { public: process.env.JWT_PUBLIC_KEY!.replace(/\\n/g, '\n') },
});

const db = createDb(process.env.DATABASE_URL!);

async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    reply.code(401).send({ error: 'Unauthorized', code: 'UNAUTHORIZED' });
  }
}

type JwtUser = { sub: string; tenant_id: string; plan: string | null; role: string };
const jwtUser = (req: FastifyRequest) => (req as unknown as { user: JwtUser }).user;

app.get('/health', async () => ({ status: 'ok', service: 'inventory-service', version: '0.1.0' }));

// ── GET /api/v1/inventory/stock-levels ────────────────────────────────────────

app.get(
  '/api/v1/inventory/stock-levels',
  { preHandler: [requireAuth, requireFeature('stock_management')] },
  async (req) => {
    const user = jwtUser(req);
    const rows = await db
      .select({
        menu_id: menus.id,
        menu_name: menus.name,
        stock_qty: stock_levels.stock_qty,
        low_stock_threshold: stock_levels.low_stock_threshold,
      })
      .from(menus)
      .innerJoin(stock_levels, eq(stock_levels.menu_id, menus.id))
      .where(and(eq(menus.tenant_id, user.tenant_id), eq(menus.is_active, true)));

    return rows.map((r) => ({
      menu_id: r.menu_id,
      menu_name: r.menu_name,
      stock_qty: Number(r.stock_qty),
      low_stock_threshold: Number(r.low_stock_threshold),
    }));
  }
);

// ── POST /api/v1/inventory/stock-levels/:menu_id/restock ─────────────────────

const restockBody = z.object({ qty_added: z.number().int().positive() });

app.post(
  '/api/v1/inventory/stock-levels/:menu_id/restock',
  { preHandler: [requireAuth, requireFeature('stock_management')] },
  async (req, reply) => {
    const { qty_added } = restockBody.parse(req.body);
    const { menu_id } = req.params as { menu_id: string };
    const user = jwtUser(req);

    const [menu] = await db
      .select({ id: menus.id, name: menus.name })
      .from(menus)
      .where(and(eq(menus.id, menu_id), eq(menus.tenant_id, user.tenant_id)));
    if (!menu) return reply.code(404).send({ error: 'Menu tidak ditemukan', code: 'NOT_FOUND' });

    const [existing] = await db
      .select()
      .from(stock_levels)
      .where(and(eq(stock_levels.menu_id, menu_id), eq(stock_levels.tenant_id, user.tenant_id)));

    const row = existing
      ? (
          await db
            .update(stock_levels)
            .set({ stock_qty: existing.stock_qty + qty_added, updated_at: new Date() })
            .where(eq(stock_levels.id, existing.id))
            .returning()
        )[0]
      : (
          await db
            .insert(stock_levels)
            .values({ tenant_id: user.tenant_id, menu_id, stock_qty: qty_added })
            .returning()
        )[0];

    return {
      menu_id: menu.id,
      menu_name: menu.name,
      stock_qty: row.stock_qty,
      low_stock_threshold: row.low_stock_threshold,
    };
  }
);

app.setErrorHandler((error: Error & { statusCode?: number; code?: string }, _req, reply) => {
  app.log.error(error);
  reply.code(error.statusCode ?? 500).send({ error: error.message, code: error.code || 'INTERNAL_ERROR' });
});

const port = parseInt(process.env.PORT || '3005');
app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) { app.log.error(err); process.exit(1); }
});
```

- [ ] **Step 3: Type-check**

```bash
pnpm --filter inventory-service type-check
```
Expected: PASS tanpa error.

- [ ] **Step 4: Smoke-test lokal (opsional, butuh `.env` valid dan service lain berjalan)**

```bash
pnpm --filter inventory-service dev
```
Di terminal lain: `curl http://localhost:3005/health` — expected `{"status":"ok","service":"inventory-service","version":"0.1.0"}`. Hentikan service setelah verifikasi (`Ctrl+C`).

- [ ] **Step 5: Commit**

```bash
git add services/inventory-service/package.json services/inventory-service/src/index.ts pnpm-lock.yaml
git commit -m "feat(inventory-service): tambah endpoint stock-levels dan restock"
```

---

### Task A3: `report-service` — endpoint timeseries

**Files:**
- Modify: `services/report-service/src/index.ts` (tambah route baru sebelum error handler di baris 200)
- Test: `services/report-service/src/timeseries.test.ts` (baru, pola sama seperti `date-range.test.ts`)
- Create: `services/report-service/src/timeseries.ts` (helper murni untuk SQL bucket expression, dipisah supaya testable tanpa boot Fastify — ikuti pola `date-range.ts`)

**Interfaces:**
- Consumes: `pos_orders` dari `@ipos-cloud/drizzle-schema` (sudah dipakai service ini).
- Produces: `GET /api/v1/reports/timeseries?from&to&granularity=hour|day|week|month` →
  `{ bucket: string, omzet: number, transaction_count: number }[]`, `bucket` adalah label ISO
  (hour: `"2026-07-16T14:00"`, day: `"2026-07-16"`, week: `"2026-W29"`, month: `"2026-07"`).
  Dipakai Task D8 (UI Laporan chart).

- [ ] **Step 1: Tulis helper `bucketExpr` murni + failing test**

Buat `services/report-service/src/timeseries.ts`:

```typescript
// ponytail: satu helper murni supaya granularity->SQL truncation testable tanpa boot Fastify.
export type Granularity = 'hour' | 'day' | 'week' | 'month';

export function bucketLabel(date: Date, granularity: Granularity): string {
  const iso = date.toISOString();
  if (granularity === 'hour') return iso.slice(0, 13) + ':00'; // 2026-07-16T14:00
  if (granularity === 'day') return iso.slice(0, 10); // 2026-07-16
  if (granularity === 'month') return iso.slice(0, 7); // 2026-07
  // week: ISO week number
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}
```

Buat `services/report-service/src/timeseries.test.ts`:

```typescript
import { bucketLabel } from './timeseries.js';

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exitCode = 1;
  } else {
    console.log(`PASS: ${msg}`);
  }
}

assert(bucketLabel(new Date('2026-07-16T14:32:00Z'), 'hour') === '2026-07-16T14:00', 'hour bucket benar');
assert(bucketLabel(new Date('2026-07-16T14:32:00Z'), 'day') === '2026-07-16', 'day bucket benar');
assert(bucketLabel(new Date('2026-07-16T14:32:00Z'), 'month') === '2026-07', 'month bucket benar');
assert(bucketLabel(new Date('2026-01-01T00:00:00Z'), 'week') === '2026-W01', 'week bucket awal tahun benar');

if (process.exitCode) {
  console.error('Ada assertion gagal.');
} else {
  console.log('Semua assertion lolos.');
}
```

- [ ] **Step 2: Run test untuk verifikasi lolos**

```bash
pnpm --filter report-service exec tsx src/timeseries.test.ts
```
Expected: semua baris `PASS`, exit code 0.

- [ ] **Step 3: Tambah route timeseries di `index.ts`**

Tambahkan import di puncak `services/report-service/src/index.ts` (dekat import `parseRange` baris 9):

```typescript
import { bucketLabel, type Granularity } from './timeseries.js';
```

Tambahkan route baru SEBELUM `app.setErrorHandler` (baris 200):

```typescript
// ── GET /api/v1/reports/timeseries ────────────────────────────────────────────

const timeseriesQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  granularity: z.enum(['hour', 'day', 'week', 'month']),
});

app.get('/api/v1/reports/timeseries', { preHandler: requireAuth }, async (req) => {
  const { from, to, granularity } = timeseriesQuery.parse(req.query);
  const user = jwtUser(req);
  const { fromDate, toDate } = parseRange(from, to);

  const rows = await db
    .select({
      created_at: pos_orders.created_at,
      total: pos_orders.total,
    })
    .from(pos_orders)
    .where(
      and(
        eq(pos_orders.tenant_id, user.tenant_id),
        eq(pos_orders.status, 'paid'),
        between(pos_orders.created_at, fromDate, toDate)
      )
    );

  const buckets = new Map<string, { omzet: number; transaction_count: number }>();
  for (const row of rows) {
    const label = bucketLabel(row.created_at, granularity as Granularity);
    const entry = buckets.get(label) ?? { omzet: 0, transaction_count: 0 };
    entry.omzet += Number(row.total);
    entry.transaction_count += 1;
    buckets.set(label, entry);
  }

  return Array.from(buckets.entries())
    .map(([bucket, v]) => ({ bucket, ...v }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket));
});
```

- [ ] **Step 4: Type-check**

```bash
pnpm --filter report-service type-check
```
Expected: PASS tanpa error.

- [ ] **Step 5: Commit**

```bash
git add services/report-service/src/index.ts services/report-service/src/timeseries.ts services/report-service/src/timeseries.test.ts
git commit -m "feat(report-service): tambah endpoint timeseries untuk chart tren Laporan"
```

---

### Task A4: `tenant-service` — endpoint detail pelanggan

**Files:**
- Modify: `services/tenant-service/src/routes/tenant/customers.ts` (tambah route di akhir fungsi, sebelum penutup `}`)

**Interfaces:**
- Consumes: `customers`, `pos_orders`, `pos_order_items` dari `@ipos-cloud/drizzle-schema`.
- Produces: `GET /api/v1/tenants/customers/:id/detail` →
  `{ customer: { id, name, phone }, total_spend: number, visit_count: number, favorite_menu: { product_name: string, order_count: number }[], recent_orders: { id: string, created_at: string, total: number, payment_method: string, item_summary: string }[] }`.
  Dipakai Task D5 (UI Pelanggan — modal Detail).

- [ ] **Step 1: Tambah import**

Di puncak `services/tenant-service/src/routes/tenant/customers.ts`, ganti baris import (baris 3-4):

```typescript
import { eq, and, ilike, or, desc, sql } from 'drizzle-orm';
import { customers, pos_orders, pos_order_items } from '@ipos-cloud/drizzle-schema';
```

- [ ] **Step 2: Tambah route detail sebelum penutup fungsi**

Tambahkan sebelum baris `}` penutup terakhir (setelah `app.delete('/:id', ...)`, baris 54):

```typescript
  // Detail pelanggan: agregat belanja, menu favorit, riwayat transaksi — untuk modal Detail Pelanggan.
  app.get('/:id/detail', async (request: any, reply) => {
    const { tenant_id } = request.user as { tenant_id: string };
    const db = (app as any).db;
    const { id } = request.params as { id: string };

    const [customer] = await db.select().from(customers)
      .where(and(eq(customers.id, id), eq(customers.tenant_id, tenant_id)));
    if (!customer) return reply.code(404).send({ error: 'Pelanggan tidak ditemukan', code: 'NOT_FOUND' });

    const [agg] = await db
      .select({
        total_spend: sql<number>`coalesce(sum(${pos_orders.total}), 0)`,
        visit_count: sql<number>`count(*)`,
      })
      .from(pos_orders)
      .where(and(eq(pos_orders.customer_id, id), eq(pos_orders.tenant_id, tenant_id), eq(pos_orders.status, 'paid')));

    const favoriteMenu = await db
      .select({
        product_name: pos_order_items.product_name,
        order_count: sql<number>`count(*)`,
      })
      .from(pos_order_items)
      .innerJoin(pos_orders, eq(pos_order_items.order_id, pos_orders.id))
      .where(and(eq(pos_orders.customer_id, id), eq(pos_orders.tenant_id, tenant_id), eq(pos_orders.status, 'paid')))
      .groupBy(pos_order_items.product_name)
      .orderBy(sql`count(*) desc`)
      .limit(5);

    const recentOrdersRaw = await db
      .select()
      .from(pos_orders)
      .where(and(eq(pos_orders.customer_id, id), eq(pos_orders.tenant_id, tenant_id), eq(pos_orders.status, 'paid')))
      .orderBy(desc(pos_orders.created_at))
      .limit(10);

    const recentOrders = await Promise.all(
      recentOrdersRaw.map(async (order: typeof pos_orders.$inferSelect) => {
        const items = await db.select({ product_name: pos_order_items.product_name, qty: pos_order_items.qty })
          .from(pos_order_items).where(eq(pos_order_items.order_id, order.id));
        return {
          id: order.id,
          created_at: order.created_at.toISOString(),
          total: order.total,
          payment_method: order.payment_method,
          item_summary: items.map((i: { product_name: string; qty: number }) => `${i.product_name} x${i.qty}`).join(', '),
        };
      })
    );

    return {
      customer: { id: customer.id, name: customer.name, phone: customer.phone },
      total_spend: Number(agg?.total_spend ?? 0),
      visit_count: Number(agg?.visit_count ?? 0),
      favorite_menu: favoriteMenu.map((f: { product_name: string; order_count: number }) => ({
        product_name: f.product_name,
        order_count: Number(f.order_count),
      })),
      recent_orders: recentOrders,
    };
  });
```

- [ ] **Step 3: Type-check**

```bash
pnpm --filter tenant-service type-check
```
Expected: PASS tanpa error.

- [ ] **Step 4: Commit**

```bash
git add services/tenant-service/src/routes/tenant/customers.ts
git commit -m "feat(tenant-service): tambah endpoint detail pelanggan (agregat, favorit, riwayat)"
```

---

### Task A5: Fix nomor WhatsApp admin billing

**Files:**
- Modify: `apps/tenant-app/app/(dashboard)/pengaturan/billing/page.tsx`

- [ ] **Step 1: Baca file untuk cari baris `WHATSAPP_ADMIN`**

Cari baris berisi `WHATSAPP_ADMIN = 'https://wa.me/6281234567890'` dan komentar `// TODO: ganti nomor WA admin asli sebelum rilis`.

- [ ] **Step 2: Ganti nilai dan hapus TODO**

Ganti ke:
```typescript
const WHATSAPP_ADMIN = 'https://wa.me/6282124533265';
```
(hapus baris komentar TODO — sudah tidak relevan setelah diganti)

- [ ] **Step 3: Update label tombol untuk tampilkan nomor**

Cari tombol "Hubungi Admin untuk Upgrade", ubah teksnya jadi menampilkan nomor:
```tsx
Hubungi Admin untuk Upgrade (WA +62 821-2453-3265)
```

- [ ] **Step 4: Commit**

```bash
git add "apps/tenant-app/app/(dashboard)/pengaturan/billing/page.tsx"
git commit -m "fix(tenant-app): update nomor WhatsApp admin billing ke nomor resmi"
```

---

## Bagian B — Token & Komponen Shared (Lapisan 3)

### Task B1: Token `--nav-active` di globals.css

**Files:**
- Modify: `apps/tenant-app/app/globals.css`

**Interfaces:**
- Produces: CSS custom property `--nav-active` dan Tailwind var `--color-nav-active`. Dipakai semua task Bagian D yang menyentuh chip/tab/pill navigasi aktif.

- [ ] **Step 1: Tambah variable di `:root`**

Di `apps/tenant-app/app/globals.css`, tambahkan setelah baris `--accent-ink: oklch(0.22 0 0);` (baris 14):

```css
  --nav-active: oklch(0.19 0.02 40); /* ink-fill #1a1310 setara — chip/tab/pill navigasi aktif, BUKAN maroon */
  --nav-active-ink: oklch(1 0 0);
```

- [ ] **Step 2: Tambah ke `@theme inline`**

Setelah baris `--color-accent-ink: var(--accent-ink);` (baris 32):

```css
  --color-nav-active: var(--nav-active);
  --color-nav-active-ink: var(--nav-active-ink);
```

- [ ] **Step 3: Tambah juga ke blok `[data-theme='dark']` dan `@media (prefers-color-scheme: dark)`**

Sama seperti pola existing (nilai identik ke light, sesuai komentar "PRD tidak minta dark mode"), tambahkan `--nav-active` dan `--nav-active-ink` dengan nilai sama di kedua blok tersebut.

- [ ] **Step 4: Verifikasi visual cepat**

```bash
pnpm --filter tenant-app dev
```
Buka browser ke halaman apapun, buka devtools, cek `getComputedStyle(document.documentElement).getPropertyValue('--nav-active')` mengembalikan nilai oklch. Hentikan dev server setelah verifikasi.

- [ ] **Step 5: Commit**

```bash
git add apps/tenant-app/app/globals.css
git commit -m "feat(tenant-app): tambah token --nav-active untuk ink-fill chip/tab aktif"
```

---

### Task B2: Badge variant warna disesuaikan ke handoff

**Files:**
- Modify: `apps/tenant-app/components/ui/badge.tsx`

**Interfaces:**
- Consumes: tidak ada perubahan API (`variant` prop values tetap sama: `neutral`/`primary`/`accent`/`warning`/`success`/`destructive`).
- Produces: warna hex disesuaikan ke handoff — konsumen existing (semua pemakaian `<Badge variant="...">`) tidak perlu berubah signature.

- [ ] **Step 1: Ganti warna variant di `badgeVariants`**

Edit `apps/tenant-app/components/ui/badge.tsx` baris 8-13, ganti isi objek `variant`:

```typescript
    variant: {
      neutral: 'bg-[var(--surface-2)] text-[var(--muted)]',
      primary: 'bg-[var(--primary)] text-[var(--primary-ink)]',
      accent: 'bg-[var(--accent)]/20 text-[var(--ink)]',
      warning: 'bg-[#fdf3e3] text-[#8a6a1f]',
      success: 'bg-[#eaf5ee] text-[#2f7a4d]',
      destructive: 'bg-[#fbe9e7] text-[#b23b2e]',
    },
```

(Nilai hex diambil dari `docs/design_handoff_tenant_app_redesign/README.md` — Success `#5fa876`/bg tint `#5fa87618`, Danger `#c0392b`/`#b23b2e`, Warning `#fdf3e3` bg — dipadankan supaya kontras teks tetap ≥4.5:1.)

- [ ] **Step 2: Type-check**

```bash
pnpm --filter tenant-app type-check
```
Expected: PASS (perubahan hanya nilai string class, tidak mengubah tipe).

- [ ] **Step 3: Commit**

```bash
git add apps/tenant-app/components/ui/badge.tsx
git commit -m "feat(tenant-app): sesuaikan warna Badge variant ke palet handoff"
```

---

## Bagian C — Screen Redesign Bagian 1: POS, Menu, Login, Setup (Lapisan 4)

### Task C1: Kasir/POS — chip kategori ink-fill + tabular-nums + badge diskon + kembalian card

**Files:**
- Modify: `apps/tenant-app/app/pos/page.tsx`

**Interfaces:**
- Consumes: `--nav-active` (Task B1).

- [ ] **Step 1: Ganti warna `CategoryChip` aktif ke ink-fill**

Di `apps/tenant-app/app/pos/page.tsx:397-410`, ganti class aktif dari `bg-[var(--primary)] text-[var(--primary-ink)]` ke `bg-[var(--nav-active)] text-[var(--nav-active-ink)]`:

```tsx
function CategoryChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`h-10 shrink-0 rounded-full px-4 text-sm font-medium transition-colors ${
        active
          ? 'bg-[var(--nav-active)] text-[var(--nav-active-ink)]'
          : 'border border-[var(--border)] text-[var(--ink)] hover:bg-[var(--surface-2)]'
      }`}
    >
      {label}
    </button>
  );
}
```

- [ ] **Step 2: Tambah `tabular-nums` ke semua angka uang**

Di `MenuCard` (baris 412-452), tambahkan `tabular-nums` ke class harga (baris 443-444, 447):
```tsx
            <span className="text-xs text-[var(--muted)] line-through tabular-nums">{formatRupiah(menu.price)}</span>
            <span className="text-sm font-bold text-[var(--primary)] tabular-nums">{formatRupiah(menu.discount_price!)}</span>
```
dan
```tsx
          <span className="mt-2 text-sm font-bold text-[var(--primary)] tabular-nums">{formatRupiah(menu.price)}</span>
```

Di cart total (baris 357):
```tsx
              <span className="text-xl font-bold text-[var(--ink)] tabular-nums">{formatRupiah(subtotal)}</span>
```

Di line item cart (baris 335):
```tsx
                        <p className="text-xs text-[var(--muted)] tabular-nums">{formatRupiah(line.price)}</p>
```

Di `PaymentModal` total (baris 605-609), `ReceiptSuccessModal` total (baris 706, 710) — tambahkan `tabular-nums` ke tiap class yang membungkus `formatRupiah(...)`.

- [ ] **Step 3: Badge diskon persen pojok kartu menu**

Di `MenuCard` (baris 412-452), tambahkan badge diskon di pojok gambar (setelah blok `menu.is_sold_out &&` di baris 427-431, tambahkan blok sejajar untuk diskon):

```tsx
        {discounted && !menu.is_sold_out && (
          <span className="absolute left-1.5 top-1.5 rounded-full bg-[#fbe9e7] px-2 py-0.5 text-[10px] font-bold text-[#b23b2e]">
            -{Math.round(((menu.price - menu.discount_price!) / menu.price) * 100)}%
          </span>
        )}
```
Letakkan tepat sebelum penutup `</div>` dari container gambar (setelah baris 431).

Catatan: variabel `discounted` sudah dideklarasikan di baris 413 (`const discounted = menu.discount_price != null;`), pastikan berada dalam scope sebelum dipakai di JSX gambar (pindahkan deklarasi ke atas fungsi kalau perlu — cek posisi saat ini sudah di awal fungsi jadi sudah dalam scope).

- [ ] **Step 4: Kembalian mini-card cream**

Di `PaymentModal` (baris 681-685), ganti teks inline kembalian dengan mini-card:
```tsx
          {cashInput && (
            <div className="mt-2 inline-block rounded-lg bg-[var(--surface-2)] px-3 py-2">
              <p className="text-xs text-[var(--muted)]">Kembalian</p>
              <p className="text-sm font-bold text-[var(--ink)] tabular-nums">{formatRupiah(change)}</p>
            </div>
          )}
```

- [ ] **Step 5: Type-check**

```bash
pnpm --filter tenant-app type-check
```
Expected: PASS tanpa error.

- [ ] **Step 6: Manual verify**

Jalankan `run` skill atau `pnpm --filter tenant-app dev`, buka `/pos`, cek: chip kategori aktif berwarna ink-fill gelap (bukan maroon), badge diskon persen muncul di kartu menu berdiskon, kembalian tampil sebagai card cream saat isi "Uang Diterima".

- [ ] **Step 7: Commit**

```bash
git add apps/tenant-app/app/pos/page.tsx
git commit -m "feat(tenant-app): redesign POS - ink-fill chip, tabular-nums, badge diskon, kembalian card"
```

---

### Task C2: Kasir/POS — qty stepper 28px

**Files:**
- Modify: `apps/tenant-app/components/pos/QtyStepper.tsx`

- [ ] **Step 1: Baca file untuk lihat class ukuran tombol saat ini**

Cek `apps/tenant-app/components/pos/QtyStepper.tsx` baris 6-54 — cari class `h-11 w-11` (44px) pada tombol +/-.

- [ ] **Step 2: Ganti ukuran ke 28px untuk konteks cart POS**

Ganti `h-11 w-11` menjadi `h-7 w-7` (28px) pada tombol increment/decrement. Pertahankan `min-h-[44px]` TIDAK dipaksakan di sini karena handoff eksplisit mengecualikan qty stepper cart dari aturan 44px (lihat Global Constraints).

- [ ] **Step 3: Type-check**

```bash
pnpm --filter tenant-app type-check
```

- [ ] **Step 4: Manual verify**

Buka `/pos`, tambah item ke cart, cek tombol +/- di cart berukuran lebih kecil (28px) dan tetap mudah ditekan.

- [ ] **Step 5: Commit**

```bash
git add apps/tenant-app/components/pos/QtyStepper.tsx
git commit -m "feat(tenant-app): perkecil qty stepper cart POS ke 28px sesuai handoff"
```

---

### Task C3: Kasir/POS — preview struk visual di modal sukses

**Files:**
- Modify: `apps/tenant-app/app/pos/page.tsx` (fungsi `ReceiptSuccessModal`, baris 701-720)

**Interfaces:**
- Consumes: `ReceiptOrder`, `ReceiptStore` types dari `../../lib/receipt` (sudah diimpor baris 21).

- [ ] **Step 1: Tambah preview struk mock di dalam modal**

Ganti fungsi `ReceiptSuccessModal` (baris 701-720) untuk menyisipkan preview struk sebelum tombol aksi:

```tsx
function ReceiptSuccessModal({ order, store, onClose }: { order: ReceiptOrder; store: ReceiptStore; onClose: () => void }) {
  return (
    <Modal title="Pembayaran Berhasil" onClose={onClose}>
      <div className="py-2 text-center">
        <p className="mb-1 text-sm text-[var(--muted)]">Total diterima</p>
        <p className="mb-4 text-3xl font-bold text-[var(--ink)] tabular-nums">{formatRupiah(order.total)}</p>
        {order.payment_method === 'cash' && (order.change_amount ?? 0) > 0 && (
          <div className="mb-4 inline-block rounded-xl bg-[var(--surface-2)] px-4 py-3">
            <p className="text-xs text-[var(--muted)]">Kembalian</p>
            <p className="text-xl font-bold text-[var(--primary)] tabular-nums">{formatRupiah(order.change_amount!)}</p>
          </div>
        )}

        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">Preview Struk</p>
        <div className="mb-4 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] p-4 text-left font-mono text-[11px] leading-relaxed text-[var(--ink)]">
          <p className="text-center font-bold">{store.name}</p>
          {store.phone && <p className="text-center text-[var(--muted)]">{store.phone}</p>}
          <div className="my-2 border-t border-dashed border-[var(--border)]" />
          {order.table_number && <p>Meja: {order.table_number}</p>}
          {order.customer_name && <p>Pelanggan: {order.customer_name}</p>}
          <p>Kasir: {order.cashier_name}</p>
          <div className="my-2 border-t border-dashed border-[var(--border)]" />
          {order.items.map((item, i) => (
            <div key={i} className="mb-1 flex justify-between gap-2">
              <span className="min-w-0 flex-1 truncate">{item.product_name} x{item.qty}</span>
              <span className="tabular-nums">{formatRupiah(item.price * item.qty)}</span>
            </div>
          ))}
          <div className="my-2 border-t border-dashed border-[var(--border)]" />
          <div className="flex justify-between font-bold">
            <span>TOTAL</span>
            <span className="tabular-nums">{formatRupiah(order.total)}</span>
          </div>
          <p className="mt-3 text-center text-[var(--primary)]">Terima kasih sudah berbelanja!</p>
        </div>

        <Button variant="outline" className="mb-2 w-full" onClick={() => printReceipt(order, store)}>
          <Printer className="h-4 w-4" /> Cetak Struk
        </Button>
        <Button className="w-full" onClick={onClose}>Transaksi Berikutnya</Button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter tenant-app type-check
```
Expected: PASS. Kalau `ReceiptOrder` type tidak punya field `table_number`/`customer_name`/`items[].price`/`items[].qty`, cek `apps/tenant-app/lib/receipt.ts` untuk signature aktual dan sesuaikan field yang dipakai di JSX (gunakan field yang benar-benar ada, jangan tambah field baru ke type).

- [ ] **Step 3: Manual verify**

Selesaikan satu transaksi di `/pos`, cek modal sukses menampilkan preview struk mock dengan item, total, dan teks terima kasih.

- [ ] **Step 4: Commit**

```bash
git add apps/tenant-app/app/pos/page.tsx
git commit -m "feat(tenant-app): tambah preview struk visual di modal sukses POS"
```

---

### Task C4: Menu/Katalog — dashed quick-add tile + item habis opacity + breadcrumb nested modal

**Files:**
- Modify: `apps/tenant-app/app/(dashboard)/menu/page.tsx`
- Modify: `apps/tenant-app/components/menu/MenuCard.tsx`

- [ ] **Step 1: Baca kedua file untuk lokasi grid kategori dan render item habis**

Baca `apps/tenant-app/app/(dashboard)/menu/page.tsx` (cari render grid per kategori) dan `apps/tenant-app/components/menu/MenuCard.tsx:37-41` (badge "HABIS" saat ini pakai `Badge variant="destructive"`).

- [ ] **Step 2: Ganti item habis dari badge solid ke opacity + label**

Di `apps/tenant-app/components/menu/MenuCard.tsx`, hapus pemakaian `<Badge variant="destructive">HABIS</Badge>` di pojok kartu. Ganti dengan: kartu penuh diberi class `opacity-55` saat `menu.is_sold_out`, dan area harga diganti teks kecil "HABIS" (bukan badge pill):

```tsx
<div className={menu.is_sold_out ? 'opacity-55' : ''}>
  {/* ...konten kartu existing... */}
  {menu.is_sold_out ? (
    <span className="text-xs font-semibold text-[var(--muted)]">HABIS</span>
  ) : (
    /* harga seperti biasa */
  )}
</div>
```
(Sesuaikan dengan struktur JSX aktual file — pertahankan semua prop/handler yang sudah ada, hanya ubah bagian visual badge→opacity+label.)

- [ ] **Step 3: Tambah dashed quick-add tile di akhir tiap grid kategori**

Di `apps/tenant-app/app/(dashboard)/menu/page.tsx`, setelah `.map()` render `MenuCard` per kategori, tambahkan elemen terakhir dalam grid:

```tsx
<button
  onClick={() => setAddingMenu(true) /* pakai state existing untuk buka modal Tambah Menu */}
  className="flex h-full min-h-[140px] flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-[var(--border)] text-sm font-medium text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] active:scale-95"
>
  <span className="text-xl">+</span>
  <span>Tambah</span>
</button>
```
(Ganti `setAddingMenu(true)` dengan nama state/handler yang benar-benar dipakai file ini untuk membuka modal Tambah Menu — cek nama variabel aktual saat membaca file di Step 1.)

- [ ] **Step 4: Breadcrumb nested modal Menu → Grup Variasi**

Cari komponen modal Tambah/Ubah Menu (form dengan checklist Variasi) dan modal Grup Variasi terpisah. Kalau modal Grup Variasi dibuka dari DALAM form Menu (misal tombol "+ Grup Baru" di checklist Variasi), tambahkan header breadcrumb di `Modal` title:

```tsx
<Modal title="Tambah Menu › Grup Variasi" onClose={...}>
```
Kalau kedua modal saat ini benar-benar independen (dibuka dari tempat berbeda, bukan bersarang), lewati step ini — cek dulu alur nyata di kode sebelum mengasumsikan nested.

- [ ] **Step 5: Type-check**

```bash
pnpm --filter tenant-app type-check
```

- [ ] **Step 6: Manual verify**

Buka `/menu`, cek: tile dashed "+ Tambah" di akhir grid tiap kategori, item habis tampil pudar dengan label "HABIS" (bukan badge merah solid).

- [ ] **Step 7: Commit**

```bash
git add "apps/tenant-app/app/(dashboard)/menu/page.tsx" apps/tenant-app/components/menu/MenuCard.tsx
git commit -m "feat(tenant-app): redesign Menu - dashed quick-add tile, item habis opacity style"
```

---

### Task C5: Login — layout 2-kolom + error box per-field

**Files:**
- Modify: `apps/tenant-app/app/login/page.tsx`

- [ ] **Step 1: Baca file penuh untuk struktur form saat ini**

Baca `apps/tenant-app/app/login/page.tsx` (baris 1-77 sudah diketahui dari audit — single column card, error teks polos baris 70).

- [ ] **Step 2: Restructure ke layout 2-kolom desktop / 1-kolom mobile**

Bungkus konten form yang sudah ada (logika `useState`, `handleSubmit`, field-field) dalam layout grid baru:

```tsx
<div className="grid min-h-dvh grid-cols-1 lg:grid-cols-2">
  <div className="flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-16">
    <div className="mx-auto w-full max-w-sm">
      <div className="mb-8 flex items-center gap-2">
        <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-[var(--primary)] font-serif text-sm font-bold text-white">IP</div>
        <span className="text-sm font-bold text-[var(--ink)]">Inspira POS</span>
      </div>
      <h1 className="mb-1 text-[26px] font-bold text-[var(--ink)] sm:text-[30px]">Selamat datang kembali</h1>
      <p className="mb-6 text-sm text-[var(--muted)]">Masuk untuk lanjut jualan hari ini.</p>

      {/* form fields existing dipindah ke sini, TIDAK diubah logikanya */}

      <p className="mt-6 text-center text-sm text-[var(--muted)]">
        Belum punya akun?{' '}
        <a href="#" className="font-semibold text-[var(--primary)]">Coba gratis 14 hari</a>
      </p>
    </div>
  </div>
  <div className="relative hidden overflow-hidden lg:block" style={{ background: 'linear-gradient(165deg, #8a2015, #4a0f0a)' }}>
    <div className="absolute bottom-8 left-8 right-8 rounded-2xl bg-white p-5 shadow-[0_20px_40px_rgba(0,0,0,.35)]">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[#d0a139]">Tip Sukses Jualan</p>
      <p className="text-sm leading-relaxed text-[var(--ink)]">Catat semua transaksi, sekecil apapun — laporan yang rapi bikin keputusan bisnis lebih gampang.</p>
    </div>
  </div>
</div>
```

Pindahkan JSX form fields (email/password/tombol Masuk/Lupa password) yang sudah ada apa adanya ke dalam komentar `{/* form fields existing dipindah ke sini */}` — jangan tulis ulang logikanya, cukup potong-tempel blok JSX-nya.

- [ ] **Step 3: Ganti error teks polos jadi box**

Cari baris error saat ini (`text-sm text-red-500` polos, baris ~70). Ganti dengan box:

```tsx
{error && (
  <div className="mb-4 rounded-xl bg-[#fbe9e7] px-4 py-3 text-sm text-[#b23b2e]">
    {error}
  </div>
)}
```

- [ ] **Step 4: Type-check**

```bash
pnpm --filter tenant-app type-check
```

- [ ] **Step 5: Manual verify**

Buka `/login` di viewport desktop (≥1024px) — cek layout 2 kolom dengan panel maroon + tip card muncul. Resize ke mobile — cek panel foto hilang, form full-width. Submit form dengan kredensial salah — cek error tampil sebagai box merah muda, bukan teks polos.

- [ ] **Step 6: Commit**

```bash
git add apps/tenant-app/app/login/page.tsx
git commit -m "feat(tenant-app): redesign Login - layout 2-kolom, error box, copy handoff"
```

---

### Task C6: Setup Wizard — opsi Transfer Bank + preview struk step akhir

**Files:**
- Modify: `apps/tenant-app/app/setup/page.tsx`

- [ ] **Step 1: Baca `PaymentStep` dan `PrinterStep` untuk struktur saat ini**

Baca `apps/tenant-app/app/setup/page.tsx:404-460` (`PaymentStep`) dan baris 468-480 (`PrinterStep`).

- [ ] **Step 2: Tambah opsi Transfer Bank di `PaymentStep`**

Cari array/list opsi pembayaran (saat ini `cash`, `qris`) di `PaymentStep`, tambahkan entri ketiga `transfer` dengan label "Transfer Bank" mengikuti pola styling opsi yang sudah ada (checklist row).

- [ ] **Step 3: Tambah preview struk mock di `PrinterStep`**

Di akhir `PrinterStep` (baris 468-480), sebelum tombol navigasi footer, tambahkan preview mock:

```tsx
<div className="mt-4 flex items-center gap-3 rounded-xl bg-[#eaf5ee] p-4">
  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#5fa876] text-white">✓</div>
  <div>
    <p className="text-sm font-semibold text-[var(--ink)]">Siap Jualan!</p>
    <p className="text-xs text-[var(--muted)]">Struk otomatis tercetak setelah setiap transaksi.</p>
  </div>
</div>
<div className="mt-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] p-4 text-center font-mono text-[11px] leading-relaxed text-[var(--ink)]">
  <p className="font-bold">{/* nama toko dari state wizard, field yang sudah ada di step 1 */}</p>
  <div className="my-2 border-t border-dashed border-[var(--border)]" />
  <p>Contoh Menu x1 &nbsp;&nbsp; 20.000</p>
  <div className="my-2 border-t border-dashed border-[var(--border)]" />
  <p className="font-bold">TOTAL &nbsp; 20.000</p>
</div>
```
(Pakai nama field state toko yang sudah ada di wizard — cek nama variabel state "Tentang Toko" step 1 saat membaca file di Step 1, jangan buat field baru.)

- [ ] **Step 4: Type-check**

```bash
pnpm --filter tenant-app type-check
```

- [ ] **Step 5: Manual verify**

Buka `/setup`, jalankan sampai step Cara Bayar — cek Transfer Bank muncul sebagai opsi ketiga. Lanjut ke step terakhir — cek preview struk mock + icon centang hijau muncul.

- [ ] **Step 6: Commit**

```bash
git add apps/tenant-app/app/setup/page.tsx
git commit -m "feat(tenant-app): Setup Wizard - tambah opsi Transfer Bank, preview struk step akhir"
```

---

## Bagian D — Screen Redesign Bagian 2: Dashboard, Pelanggan, Inventory, Laporan, Pengaturan (Lapisan 4)

### Task D1: Dashboard — sambung data nyata + hero layout + sapaan waktu

**Files:**
- Modify: `apps/tenant-app/app/(dashboard)/page.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/reports/sales-summary?from&to` (sudah ada, `services/report-service`), `GET /api/v1/pos/orders` (sudah ada, `services/pos-service`, cek query param limit yang didukung dengan membaca `services/pos-service/src/index.ts:128` sebelum menulis fetch call).

- [ ] **Step 1: Baca endpoint `GET /api/v1/pos/orders` untuk tahu param yang didukung**

Baca `services/pos-service/src/index.ts` baris 128-140 untuk memastikan query param (limit/sort) yang tersedia sebelum menulis pemanggilan di frontend.

- [ ] **Step 2: Tulis ulang `apps/tenant-app/app/(dashboard)/page.tsx` dengan data fetching**

Ganti seluruh isi file jadi client component dengan `useEffect` fetch, mengikuti pola `apiFetch` yang sudah dipakai di `/laporan/insight`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShoppingCart, UtensilsCrossed, FileBarChart, Receipt } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { formatRupiah } from '@/lib/format';
import { useTenant } from '@/components/layout/TenantContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type SalesSummary = { total_omzet: number; total_transactions: number; change_percent: number };
type RecentOrder = { id: string; total: number; payment_method: string; table_number: string | null; created_at: string; items?: { product_name: string; qty: number }[] };

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return 'Selamat pagi';
  if (h < 15) return 'Selamat siang';
  if (h < 18) return 'Selamat sore';
  return 'Selamat malam';
}

function todayRange() {
  const to = new Date().toISOString().slice(0, 10);
  return { from: to, to };
}

export default function DashboardPage() {
  const { tenant } = useTenant();
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [recent, setRecent] = useState<RecentOrder[] | null>(null);

  useEffect(() => {
    const { from, to } = todayRange();
    apiFetch(`/api/v1/reports/sales-summary?from=${from}&to=${to}`).then(setSummary).catch(() => setSummary(null));
    apiFetch('/api/v1/pos/orders').then((res) => setRecent((res.data ?? res).slice(0, 5))).catch(() => setRecent([]));
  }, []);

  const isNewStore = summary !== null && summary.total_transactions === 0 && recent !== null && recent.length === 0;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div>
        <p className="text-sm text-[var(--muted)]">{greeting()}</p>
        <h1 className="text-xl font-bold text-[var(--ink)]">{tenant.user.name}</h1>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.4fr_1fr]">
        <Card className="relative overflow-hidden bg-[var(--primary)] text-[var(--primary-ink)]">
          <Receipt className="absolute -right-2 -top-2 h-24 w-24 opacity-20" />
          <CardHeader>
            {summary === null ? (
              <Skeleton className="h-9 w-32 bg-white/20" />
            ) : (
              <>
                <CardTitle className="text-[34px] tabular-nums text-[var(--primary-ink)]">{formatRupiah(summary.total_omzet)}</CardTitle>
                <p className="text-xs opacity-80">Omzet hari ini</p>
                {summary.total_omzet > 0 ? (
                  <p className="text-xs font-semibold text-[var(--accent)]">
                    {summary.change_percent >= 0 ? '▲' : '▼'} {Math.abs(summary.change_percent)}% dari kemarin
                  </p>
                ) : (
                  <p className="text-xs opacity-80">Belum ada transaksi — ayo mulai jualan hari ini.</p>
                )}
              </>
            )}
          </CardHeader>
        </Card>
        <div className="flex flex-col gap-3">
          <Card>
            <CardHeader>
              <CardTitle className="tabular-nums">{summary?.total_transactions ?? <Skeleton className="h-6 w-8" />}</CardTitle>
              <p className="text-xs text-[var(--muted)]">Transaksi hari ini</p>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{tenant.plan.replace('_', ' ')}</CardTitle>
              <p className="text-xs text-[var(--muted)]">Paket aktif</p>
            </CardHeader>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Link href="/pos" className="flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl bg-[var(--primary)] p-4 text-sm font-bold text-[var(--primary-ink)] active:scale-95">
          <ShoppingCart className="h-5 w-5" /> Buka Kasir
        </Link>
        <Link href="/menu" className="flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm font-medium text-[var(--ink)] active:scale-95">
          <UtensilsCrossed className="h-5 w-5" /> Kelola Menu
        </Link>
        <Link href="/laporan/insight" className="flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm font-medium text-[var(--ink)] active:scale-95">
          <FileBarChart className="h-5 w-5" /> Lihat Insight
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transaksi Terbaru</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {recent === null ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : isNewStore || recent.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--muted)]">Belum ada transaksi. Transaksi terbaru akan tampil di sini.</p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {recent.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--ink)]">
                      {o.items?.map((i) => i.product_name).join(', ') || 'Transaksi'}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      {o.table_number ? `Meja ${o.table_number} · ` : ''}{o.payment_method}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--ink)]">{formatRupiah(o.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
pnpm --filter tenant-app type-check
```
Expected: PASS. Kalau field `RecentOrder` (mis. `items`) tidak match response nyata `GET /api/v1/pos/orders`, sesuaikan type ke shape asli endpoint (cek `services/pos-service/src/index.ts` query select list).

- [ ] **Step 4: Manual verify**

Buka `/` (dashboard) — cek omzet & transaksi hari ini muncul dari data nyata (bukan hardcode "Rp 0"), tombol "Buka Kasir" primary CTA berfungsi ke `/pos`, sapaan berubah sesuai jam.

- [ ] **Step 5: Commit**

```bash
git add "apps/tenant-app/app/(dashboard)/page.tsx"
git commit -m "feat(tenant-app): Dashboard - sambung data nyata, hero layout, sapaan waktu"
```

---

### Task D2: Pelanggan — grid kartu avatar + tab switcher Kelola Staf

**Files:**
- Modify: `apps/tenant-app/app/(dashboard)/pelanggan/page.tsx`
- Delete: `apps/tenant-app/app/(dashboard)/kasir/page.tsx` (konten Kelola Staf dipindah jadi tab di Pelanggan, bukan route terpisah)

**Interfaces:**
- Consumes: `GET /api/v1/tenants/customers` (sudah ada), `GET /api/v1/tenants/users` (sudah ada, dipakai `kasir/page.tsx` saat ini).

- [ ] **Step 1: Baca `kasir/page.tsx` penuh untuk logika Kelola Staf yang akan dipindah**

File sudah dibaca sebelumnya di riset — `apps/tenant-app/app/(dashboard)/kasir/page.tsx` berisi `KasirPage`, `CashierForm`, `ResetPasswordForm` dan tipe `Cashier`.

- [ ] **Step 2: Tulis ulang `pelanggan/page.tsx` dengan tab switcher + grid kartu**

Ganti seluruh isi `apps/tenant-app/app/(dashboard)/pelanggan/page.tsx`. Pertahankan SEMUA logika `CustomerForm` yang sudah ada (baris 145-196 versi lama, tidak diubah), tambahkan tab state dan pindahkan konten `KasirPage` (minus `<main>`/`<header>` wrapper karena sudah dalam layout `(dashboard)`) sebagai tab kedua:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/auth';
import type { Customer } from '@/lib/types';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { StaffCard } from '@/components/pengguna/StaffCard';
import { PasswordInput } from '@/components/ui/password-input';

type Cashier = { id: string; name: string; email: string; role: string; is_active: boolean };

function avatarColor(name: string) {
  const colors = ['#6e150f', '#8a2015', '#5fa876', '#d0a139', '#4a5b8a'];
  const idx = name.charCodeAt(0) % colors.length;
  return colors[idx];
}

export default function PelangganPage() {
  const [tab, setTab] = useState<'pelanggan' | 'staf'>('pelanggan');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Customer | 'new' | null>(null);
  const [removing, setRemoving] = useState<Customer | null>(null);
  const [detail, setDetail] = useState<Customer | null>(null);
  const [addingCashier, setAddingCashier] = useState(false);
  const [resetting, setResetting] = useState<Cashier | null>(null);
  const [removingCashier, setRemovingCashier] = useState<Cashier | null>(null);
  const [error, setError] = useState('');

  async function reloadCustomers(q = '') {
    const res = await apiFetch(`/api/v1/tenants/customers${q ? `?search=${encodeURIComponent(q)}` : ''}`);
    setCustomers(res.data);
  }
  async function reloadCashiers() {
    const res = await apiFetch('/api/v1/tenants/users');
    setCashiers(res.data);
  }

  useEffect(() => {
    reloadCustomers().catch((e) => setError(e.message));
    reloadCashiers().catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => reloadCustomers(search).catch((e) => setError(e.message)), 300);
    return () => clearTimeout(t);
  }, [search]);

  async function removeCustomer(c: Customer) {
    await apiFetch(`/api/v1/tenants/customers/${c.id}`, { method: 'DELETE' });
    setRemoving(null);
    await reloadCustomers(search);
  }
  async function toggleCashierActive(c: Cashier) {
    await apiFetch(`/api/v1/tenants/users/${c.id}/deactivate`, { method: 'PATCH' });
    await reloadCashiers();
  }
  async function removeCashier(c: Cashier) {
    await apiFetch(`/api/v1/tenants/users/${c.id}`, { method: 'DELETE' });
    setRemovingCashier(null);
    await reloadCashiers();
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--ink)]">Pelanggan</h1>
        {tab === 'pelanggan' ? (
          <Button size="sm" onClick={() => setEditing('new')}>+ Pelanggan</Button>
        ) : (
          <Button size="sm" onClick={() => setAddingCashier(true)}>+ Kasir</Button>
        )}
      </div>

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setTab('pelanggan')}
          className={`h-10 rounded-full px-4 text-sm font-medium ${tab === 'pelanggan' ? 'bg-[var(--nav-active)] text-[var(--nav-active-ink)]' : 'border border-[var(--border)] text-[var(--ink)]'}`}
        >
          Pelanggan
        </button>
        <button
          onClick={() => setTab('staf')}
          className={`h-10 rounded-full px-4 text-sm font-medium ${tab === 'staf' ? 'bg-[var(--nav-active)] text-[var(--nav-active-ink)]' : 'border border-[var(--border)] text-[var(--ink)]'}`}
        >
          Kelola Staf ({cashiers.length})
        </button>
      </div>

      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      {tab === 'pelanggan' ? (
        <>
          <Input type="search" placeholder="Cari nama atau no HP..." value={search} onChange={(e) => setSearch(e.target.value)} className="mb-5" />
          {customers.length === 0 ? (
            <EmptyState>{search ? 'Tidak ada pelanggan yang cocok.' : 'Belum ada pelanggan tercatat.'}</EmptyState>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {customers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setDetail(c)}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-center active:scale-95"
                >
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{ backgroundColor: avatarColor(c.name) }}
                  >
                    {c.name.slice(0, 2).toUpperCase()}
                  </div>
                  <p className="truncate text-sm font-semibold text-[var(--ink)]">{c.name}</p>
                  <p className="truncate text-xs text-[var(--muted)]">{c.phone || 'Tanpa no HP'}</p>
                </button>
              ))}
              <button
                onClick={() => setEditing('new')}
                className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--muted)] active:scale-95"
              >
                <span className="text-xl">+</span> Tambah baru
              </button>
            </div>
          )}
        </>
      ) : cashiers.length === 0 ? (
        <EmptyState>Belum ada kasir. Klik + Kasir untuk menambah.</EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {cashiers.map((c) => (
            <StaffCard
              key={c.id}
              cashier={c}
              onResetPassword={() => setResetting(c)}
              onToggleActive={() => toggleCashierActive(c)}
              onDelete={() => setRemovingCashier(c)}
            />
          ))}
        </div>
      )}

      {editing && (
        <CustomerForm
          customer={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await reloadCustomers(search); }}
        />
      )}

      {detail && <CustomerDetailModal customer={detail} onClose={() => setDetail(null)} />}

      <AlertDialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus pelanggan?</AlertDialogTitle>
            <AlertDialogDescription>Data pelanggan &ldquo;{removing?.name}&rdquo; akan dihapus permanen.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => removing && removeCustomer(removing)}>Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {addingCashier && (
        <CashierForm onClose={() => setAddingCashier(false)} onSaved={async () => { setAddingCashier(false); await reloadCashiers(); }} />
      )}
      {resetting && <ResetPasswordForm cashier={resetting} onClose={() => setResetting(null)} />}

      <AlertDialog open={!!removingCashier} onOpenChange={(open) => !open && setRemovingCashier(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus kasir?</AlertDialogTitle>
            <AlertDialogDescription>Akun &ldquo;{removingCashier?.name}&rdquo; akan dihapus permanen dan tidak bisa login lagi.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => removingCashier && removeCashier(removingCashier)}>Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CustomerForm({ customer, onClose, onSaved }: { customer: Customer | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(customer?.name ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = { name, phone: phone || null };
      if (customer) {
        await apiFetch(`/api/v1/tenants/customers/${customer.id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await apiFetch('/api/v1/tenants/customers', { method: 'POST', body: JSON.stringify(body) });
      }
      onSaved();
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <Modal title={customer ? 'Ubah Pelanggan' : 'Tambah Pelanggan'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nama"><Input required autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="No HP" hint="Opsional"><Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">Batal</Button>
          <Button type="submit" disabled={saving} className="flex-1">{saving ? 'Menyimpan...' : 'Simpan'}</Button>
        </div>
      </form>
    </Modal>
  );
}

type CustomerDetail = {
  customer: Customer;
  total_spend: number;
  visit_count: number;
  favorite_menu: { product_name: string; order_count: number }[];
  recent_orders: { id: string; created_at: string; total: number; payment_method: string; item_summary: string }[];
};

function CustomerDetailModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const [detail, setDetail] = useState<CustomerDetail | null>(null);

  useEffect(() => {
    apiFetch(`/api/v1/tenants/customers/${customer.id}/detail`).then(setDetail).catch(() => setDetail(null));
  }, [customer.id]);

  return (
    <Modal title={customer.name} onClose={onClose}>
      {!detail ? (
        <p className="py-8 text-center text-sm text-[var(--muted)]">Memuat...</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-[var(--surface-2)] p-3">
              <p className="text-xs text-[var(--muted)]">Total belanja</p>
              <p className="text-lg font-bold tabular-nums text-[var(--ink)]">Rp {detail.total_spend.toLocaleString('id-ID')}</p>
            </div>
            <div className="rounded-xl bg-[var(--surface-2)] p-3">
              <p className="text-xs text-[var(--muted)]">Kunjungan</p>
              <p className="text-lg font-bold tabular-nums text-[var(--ink)]">{detail.visit_count}×</p>
            </div>
          </div>

          {detail.favorite_menu.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-[var(--ink)]">Menu Favorit</h3>
              <ul className="space-y-1">
                {detail.favorite_menu.map((m, i) => (
                  <li key={i} className="flex justify-between text-sm">
                    <span className="text-[var(--ink)]">{m.product_name}</span>
                    <span className="text-[var(--muted)]">{m.order_count}×</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h3 className="mb-2 text-sm font-semibold text-[var(--ink)]">Riwayat Transaksi</h3>
            {detail.recent_orders.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">Belum ada transaksi.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {detail.recent_orders.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-[var(--ink)]">{o.item_summary}</p>
                      <p className="text-xs text-[var(--muted)]">{new Date(o.created_at).toLocaleDateString('id-ID')} · {o.payment_method}</p>
                    </div>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--ink)]">Rp {o.total.toLocaleString('id-ID')}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function CashierForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiFetch('/api/v1/tenants/users', { method: 'POST', body: JSON.stringify({ name, email, password, role: 'cashier' }) });
      onSaved();
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <Modal title="Tambah Kasir" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nama karyawan"><Input required autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Email untuk login"><Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password awal" hint="Bisa diganti nanti lewat Reset Password."><PasswordInput required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">Batal</Button>
          <Button type="submit" disabled={saving} className="flex-1">{saving ? 'Menyimpan...' : 'Simpan'}</Button>
        </div>
      </form>
    </Modal>
  );
}

function ResetPasswordForm({ cashier, onClose }: { cashier: Cashier; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/api/v1/tenants/users/${cashier.id}/reset-password`, { method: 'PATCH', body: JSON.stringify({ password }) });
      setDone(true);
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <Modal title={`Reset Password — ${cashier.name}`} onClose={onClose}>
      {done ? (
        <div className="space-y-4">
          <p className="text-sm text-[var(--ink)]">Password baru untuk <strong>{cashier.name}</strong> berhasil disimpan. Sampaikan password ini langsung ke kasirnya.</p>
          <Button onClick={onClose} className="w-full">Selesai</Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Password baru" hint="Minimal 6 karakter. Kasir bisa dipakai login lagi setelah ini."><PasswordInput required minLength={6} autoFocus value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Batal</Button>
            <Button type="submit" disabled={saving} className="flex-1">{saving ? 'Menyimpan...' : 'Simpan password baru'}</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
```

- [ ] **Step 3: Hapus route `/kasir` lama**

```bash
git rm "apps/tenant-app/app/(dashboard)/kasir/page.tsx"
```

- [ ] **Step 4: Cari dan update semua link ke `/kasir` yang mengarah ke Kelola Staf**

Grep untuk referensi `href="/kasir"` atau `router.push('/kasir')`/`router.push('/pos')` yang salah sasaran (di navigasi Sidebar/BottomNav) — ganti tujuan navigasi "Kelola Staf" agar mengarah ke `/pelanggan` (dengan query `?tab=staf` kalau ingin buka tab staf langsung, opsional — minimal ganti ke `/pelanggan`).

```bash
grep -rn "'/kasir'" apps/tenant-app/components apps/tenant-app/app
```
Update tiap hasil yang merujuk ke Kelola Staf.

- [ ] **Step 5: Type-check**

```bash
pnpm --filter tenant-app type-check
```
Expected: PASS. Perhatikan error "Cannot find module" kalau ada import lama ke path `kasir/page` yang terlewat — hapus juga.

- [ ] **Step 6: Manual verify**

Buka `/pelanggan` — cek tab "Pelanggan" (grid kartu avatar) dan tab "Kelola Staf (N)" (grid StaffCard) berfungsi, klik kartu pelanggan membuka modal detail dengan total belanja/kunjungan/menu favorit/riwayat.

- [ ] **Step 7: Commit**

```bash
git add "apps/tenant-app/app/(dashboard)/pelanggan/page.tsx" apps/tenant-app/components apps/tenant-app/app
git commit -m "feat(tenant-app): gabung Pelanggan+Kelola Staf jadi tab switcher, grid kartu, modal detail"
```

---

### Task D3: Inventory — grid kartu + search/filter + modal restock

**Files:**
- Modify: `apps/tenant-app/app/(dashboard)/inventory/page.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/inventory/stock-levels`, `POST /api/v1/inventory/stock-levels/:menu_id/restock` (Task A2).

- [ ] **Step 1: Tulis ulang halaman dengan grid kartu + search + filter + modal restock**

Ganti seluruh isi `apps/tenant-app/app/(dashboard)/inventory/page.tsx`:

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, Plus, Minus } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { PlanGate } from '@/components/PlanGate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Skeleton } from '@/components/ui/skeleton';

type StockLevel = { menu_id: string; menu_name: string; stock_qty: number; low_stock_threshold: number };

function StockGrid() {
  const [rows, setRows] = useState<StockLevel[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'low' | 'safe'>('all');
  const [restocking, setRestocking] = useState<StockLevel | null>(null);

  function reload() {
    apiFetch('/api/v1/inventory/stock-levels').then(setRows).catch(() => setFailed(true));
  }

  useEffect(() => { reload(); }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    return rows
      .filter((r) => r.menu_name.toLowerCase().includes(search.toLowerCase()))
      .filter((r) => {
        if (filter === 'all') return true;
        const low = r.stock_qty <= r.low_stock_threshold;
        return filter === 'low' ? low : !low;
      });
  }, [rows, search, filter]);

  if (failed) return <EmptyState>Belum ada data stok. Tambahkan stok dari halaman Menu.</EmptyState>;
  if (!rows) return <Skeleton className="h-40 w-full" />;
  if (rows.length === 0) return <EmptyState>Belum ada menu dengan pelacakan stok.</EmptyState>;

  return (
    <>
      <div className="mb-3 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3">
        <Search className="h-4 w-4 text-[var(--muted)]" />
        <Input
          type="search"
          placeholder="Cari menu..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border-0 px-0 focus-visible:ring-0"
        />
      </div>
      <div className="mb-4 flex gap-2">
        {(['all', 'low', 'safe'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`h-9 rounded-full px-3 text-sm font-medium ${filter === f ? 'bg-[var(--nav-active)] text-[var(--nav-active-ink)]' : 'border border-[var(--border)] text-[var(--ink)]'}`}
          >
            {f === 'all' ? 'Semua' : f === 'low' ? 'Menipis' : 'Aman'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {filtered.map((r) => {
          const low = r.stock_qty <= r.low_stock_threshold;
          return (
            <div key={r.menu_id} className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-2)] text-xs text-[var(--muted)]">IMG</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--ink)]">{r.menu_name}</p>
                <Badge variant={low ? 'destructive' : 'success'}>Stok {r.stock_qty} · {low ? 'Menipis' : 'Aman'}</Badge>
              </div>
              <button
                onClick={() => setRestocking(r)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--ink)] active:scale-95"
                aria-label={`Tambah stok ${r.menu_name}`}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="col-span-full py-8 text-center text-sm text-[var(--muted)]">Tidak ada menu yang cocok.</p>
        )}
      </div>

      {restocking && (
        <RestockModal
          item={restocking}
          onClose={() => setRestocking(null)}
          onSaved={() => { setRestocking(null); reload(); }}
        />
      )}
    </>
  );
}

function RestockModal({ item, onClose, onSaved }: { item: StockLevel; onClose: () => void; onSaved: () => void }) {
  const [qty, setQty] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/api/v1/inventory/stock-levels/${item.menu_id}/restock`, {
        method: 'POST',
        body: JSON.stringify({ qty_added: qty }),
      });
      onSaved();
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <Modal title="Tambah Stok" onClose={onClose}>
      <div className="mb-4 flex items-center gap-3 rounded-xl bg-[var(--surface-2)] p-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--ink)]">{item.menu_name}</p>
          <p className="text-xs text-[var(--muted)]">Stok saat ini: {item.stock_qty}</p>
        </div>
      </div>

      <Field label="Jumlah ditambah">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--border)] active:scale-95"
          >
            <Minus className="h-4 w-4" />
          </button>
          <Input
            inputMode="numeric"
            className="h-11 text-center"
            value={qty}
            onChange={(e) => setQty(Math.max(1, parseInt(e.target.value || '1', 10)))}
          />
          <button
            onClick={() => setQty((q) => q + 1)}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--border)] active:scale-95"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </Field>

      <p className="mt-3 text-sm text-[var(--muted)]">
        Stok setelah ditambah: <span className="font-bold tabular-nums text-[var(--ink)]">{item.stock_qty + qty}</span>
      </p>

      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}

      <Button size="lg" className="mt-4 w-full" disabled={saving} onClick={submit}>
        {saving ? 'Menyimpan...' : 'Simpan Stok'}
      </Button>
    </Modal>
  );
}

export default function InventoryPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-xl font-bold text-[var(--ink)]">Inventory</h1>
      <PlanGate featureKey="stock_management" featureLabel="Manajemen stok">
        <StockGrid />
      </PlanGate>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm --filter tenant-app type-check
```

- [ ] **Step 3: Manual verify**

Buka `/inventory` (butuh `inventory-service` berjalan dari Task A2 dan minimal satu row di `stock_levels`), cek grid kartu, search, filter pill, dan modal restock berfungsi dengan preview "Stok setelah ditambah".

- [ ] **Step 4: Commit**

```bash
git add "apps/tenant-app/app/(dashboard)/inventory/page.tsx"
git commit -m "feat(tenant-app): redesign Inventory - grid kartu, search/filter, modal restock"
```

---

### Task D4: Laporan — satukan shell period-driven + hero card + chart timeseries

**Files:**
- Modify: `apps/tenant-app/components/insight/DateRangePicker.tsx`
- Modify: `apps/tenant-app/app/(dashboard)/laporan/page.tsx`

**Interfaces:**
- Consumes: `GET /api/v1/reports/sales-summary`, `GET /api/v1/reports/timeseries?granularity=...` (Task A3), `GET /api/v1/reports/peak-hours`.
- Note: `app/laporan/insight/page.tsx` (route terpisah, di luar `(dashboard)` group) TETAP ADA tanpa perubahan di task ini — halaman `/laporan` (dashboard) yang di-redesign untuk jadi shell period-driven utama. Konsolidasi penuh dua route jadi satu bukan bagian task ini (di luar scope minimal; `/laporan/insight` tetap berfungsi sebagai halaman insight lanjutan yang bisa ditautkan).

- [ ] **Step 1: Perluas `DateRangePicker` jadi 4-segmen dengan ink-fill + granularity**

Ganti seluruh isi `apps/tenant-app/components/insight/DateRangePicker.tsx`:

```tsx
'use client';

export type DateRange = { from: string; to: string };
export type Period = 'daily' | 'weekly' | 'monthly' | 'yearly';

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function rangeForPeriod(period: Period): DateRange {
  const now = new Date();
  const to = toISODate(now);
  if (period === 'daily') return { from: to, to };
  if (period === 'weekly') {
    const from = new Date(now);
    from.setDate(from.getDate() - 7);
    return { from: toISODate(from), to };
  }
  if (period === 'monthly') {
    const from = new Date(now);
    from.setDate(from.getDate() - 30);
    return { from: toISODate(from), to };
  }
  const from = new Date(now);
  from.setFullYear(from.getFullYear() - 1);
  return { from: toISODate(from), to };
}

export function granularityForPeriod(period: Period): 'hour' | 'day' | 'week' | 'month' {
  if (period === 'daily') return 'hour';
  if (period === 'weekly') return 'day';
  if (period === 'monthly') return 'week';
  return 'month';
}

// Kompat lama — dipakai app/laporan/insight/page.tsx yang belum ikut redesign task ini.
export function rangeFor(preset: 'today' | 'week' | 'month'): DateRange {
  return rangeForPeriod(preset === 'today' ? 'daily' : preset === 'week' ? 'weekly' : 'monthly');
}

export function PeriodSwitcher({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const options: Array<{ key: Period; label: string }> = [
    { key: 'daily', label: 'Harian' },
    { key: 'weekly', label: 'Mingguan' },
    { key: 'monthly', label: 'Bulanan' },
    { key: 'yearly', label: 'Tahunan' },
  ];
  return (
    <div className="flex gap-2 overflow-x-auto">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`h-10 shrink-0 rounded-full px-4 text-sm font-medium ${
            value === o.key ? 'bg-[var(--nav-active)] text-[var(--nav-active-ink)]' : 'border border-[var(--border)] text-[var(--ink)]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Kompat lama — dipakai app/laporan/insight/page.tsx (belum ikut redesign task ini).
export function DateRangePicker({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const presets: Array<{ key: 'today' | 'week' | 'month'; label: string }> = [
    { key: 'today', label: 'Hari Ini' },
    { key: 'week', label: 'Minggu Ini' },
    { key: 'month', label: 'Bulan Ini' },
  ];
  return (
    <div className="flex gap-2">
      {presets.map((p) => {
        const presetRange = rangeFor(p.key);
        const active = presetRange.from === value.from && presetRange.to === value.to;
        return (
          <button
            key={p.key}
            onClick={() => onChange(presetRange)}
            className={`h-9 rounded-full px-3 text-sm font-medium ${active ? 'bg-[var(--nav-active)] text-[var(--nav-active-ink)]' : 'border border-[var(--border)] text-[var(--ink)]'}`}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
```

Catatan penting: `variant={active ? 'primary' : 'outline'}` pada `Button` lama diganti jadi `<button>` mentah dengan class ink-fill langsung, supaya konsisten dengan pola `CategoryChip` di POS — TIDAK memakai komponen `Button` (yang selalu `--primary`) untuk elemen filter aktif.

- [ ] **Step 2: Tulis ulang `laporan/page.tsx` sebagai shell period-driven**

Ganti seluruh isi `apps/tenant-app/app/(dashboard)/laporan/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Download, TrendingUp, Receipt } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { apiFetch } from '@/lib/auth';
import { formatRupiah } from '@/lib/format';
import { PlanGate } from '@/components/PlanGate';
import { PeriodSwitcher, rangeForPeriod, granularityForPeriod, type Period, type DateRange } from '@/components/insight/DateRangePicker';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

type SalesSummary = { total_omzet: number; total_transactions: number; avg_transaction: number; change_percent: number };
type TimeseriesPoint = { bucket: string; omzet: number; transaction_count: number };

function HeroSummary({ summary }: { summary: SalesSummary }) {
  return (
    <Card className="relative overflow-hidden bg-[var(--primary)] text-[var(--primary-ink)]">
      <Receipt className="absolute -right-2 -top-2 h-24 w-24 opacity-20" />
      <CardHeader>
        <CardTitle className="text-[34px] tabular-nums text-[var(--primary-ink)]">{formatRupiah(summary.total_omzet)}</CardTitle>
        <p className="text-xs opacity-80">Omzet periode ini</p>
        <p className="text-xs font-semibold text-[var(--accent)]">
          {summary.change_percent >= 0 ? '▲' : '▼'} {Math.abs(summary.change_percent)}% dari periode sebelumnya
        </p>
      </CardHeader>
    </Card>
  );
}

function InsightRekomendasi({ summary, period }: { summary: SalesSummary; period: Period }) {
  const insight = summary.total_transactions > 0
    ? `Rata-rata transaksi Rp ${summary.avg_transaction.toLocaleString('id-ID')} periode ini.`
    : 'Belum ada transaksi untuk dianalisis periode ini.';
  const rekomendasi = period === 'daily'
    ? 'Siapkan stok ekstra di jam ramai supaya tidak kehabisan.'
    : 'Coba promo menu favorit untuk dorong omzet periode berikutnya.';
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Card><CardContent className="pt-4"><p className="mb-1 text-xs font-semibold text-[var(--muted)]">INSIGHT</p><p className="text-sm text-[var(--ink)]">{insight}</p></CardContent></Card>
      <Card className="bg-[#fdf3e3]"><CardContent className="pt-4"><p className="mb-1 text-xs font-semibold text-[#8a6a1f]">REKOMENDASI</p><p className="text-sm text-[var(--ink)]">{rekomendasi}</p></CardContent></Card>
    </div>
  );
}

function TrendChart({ period, range }: { period: Period; range: DateRange }) {
  const [data, setData] = useState<TimeseriesPoint[] | null>(null);

  useEffect(() => {
    setData(null);
    const granularity = granularityForPeriod(period);
    apiFetch(`/api/v1/reports/timeseries?from=${range.from}&to=${range.to}&granularity=${granularity}`)
      .then(setData)
      .catch(() => setData([]));
  }, [period, range.from, range.to]);

  if (data === null) return <Skeleton className="h-[100px] w-full" />;
  if (data.length === 0) return <p className="py-6 text-center text-sm text-[var(--muted)]">Belum ada data tren untuk periode ini.</p>;

  if (period === 'daily') {
    const maxCount = Math.max(...data.map((d) => d.transaction_count));
    return (
      <ResponsiveContainer width="100%" height={100}>
        <BarChart data={data}>
          <XAxis dataKey="bucket" stroke="var(--muted)" fontSize={10} tickFormatter={(v) => v.slice(11, 16)} />
          <YAxis hide />
          <Tooltip formatter={(value: number) => [`${value} transaksi`, '']} labelFormatter={(l) => l.slice(11, 16)} />
          <Bar dataKey="transaction_count" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.transaction_count === maxCount ? 'var(--primary)' : 'var(--accent)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={100}>
      <LineChart data={data}>
        <XAxis dataKey="bucket" stroke="var(--muted)" fontSize={10} />
        <YAxis stroke="var(--muted)" fontSize={10} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
        <Tooltip formatter={(value: number) => formatRupiah(value)} />
        <Line type="monotone" dataKey="omzet" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default function LaporanPage() {
  const [period, setPeriod] = useState<Period>('daily');
  const [range, setRange] = useState<DateRange>(rangeForPeriod('daily'));
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const r = rangeForPeriod(period);
    setRange(r);
    setSummary(null);
    setFailed(false);
    apiFetch(`/api/v1/reports/sales-summary?from=${r.from}&to=${r.to}`).then(setSummary).catch(() => setFailed(true));
  }, [period]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--ink)]">Laporan</h1>
        <PlanGate featureKey="advanced_report" featureLabel="Export laporan">
          <Button variant="outline" size="sm"><Download className="h-4 w-4" /> Export</Button>
        </PlanGate>
      </div>

      <PeriodSwitcher value={period} onChange={setPeriod} />

      {failed ? (
        <EmptyState>Tidak ada transaksi di periode ini. Coba pilih rentang tanggal lain.</EmptyState>
      ) : !summary ? (
        <Skeleton className="h-32 w-full" />
      ) : summary.total_transactions === 0 ? (
        <EmptyState>Tidak ada transaksi di periode ini. Coba pilih rentang tanggal lain.</EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.4fr_1fr]">
            <HeroSummary summary={summary} />
            <div className="flex flex-col gap-3">
              <Card><CardHeader><CardTitle className="tabular-nums">{summary.total_transactions}</CardTitle><p className="text-xs text-[var(--muted)]">Transaksi</p></CardHeader></Card>
              <Card><CardHeader><CardTitle className="tabular-nums">{formatRupiah(summary.avg_transaction)}</CardTitle><p className="text-xs text-[var(--muted)]">Rata-rata</p></CardHeader></Card>
            </div>
          </div>

          <InsightRekomendasi summary={summary} period={period} />

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><TrendingUp className="h-4 w-4" /> {period === 'daily' ? 'Jam Sibuk' : 'Tren Omzet'}</CardTitle></CardHeader>
            <CardContent className="pt-0"><TrendChart period={period} range={range} /></CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Type-check**

```bash
pnpm --filter tenant-app type-check
```
Expected: PASS. Cek `app/laporan/insight/page.tsx` masih compile (masih memakai `DateRangePicker`/`rangeFor` lama yang tetap diekspor untuk kompat).

- [ ] **Step 4: Manual verify**

Buka `/laporan` — cek period switcher 4-segmen ink-fill, hero card gradient, insight/rekomendasi row, chart (bar untuk Harian, line untuk lainnya). Buka `/laporan/insight` — pastikan masih berfungsi seperti sebelumnya (tidak regresi).

- [ ] **Step 5: Commit**

```bash
git add apps/tenant-app/components/insight/DateRangePicker.tsx "apps/tenant-app/app/(dashboard)/laporan/page.tsx"
git commit -m "feat(tenant-app): redesign Laporan - period switcher ink-fill, hero card, chart timeseries"
```

---

### Task D5: Pengaturan hub — status completion pill

**Files:**
- Modify: `apps/tenant-app/app/(dashboard)/pengaturan/page.tsx`

- [ ] **Step 1: Baca file untuk struktur kartu hub saat ini**

Baca `apps/tenant-app/app/(dashboard)/pengaturan/page.tsx:17-48` (grid kartu setting, tiap kartu icon+title+desc, baris 9-14 punya deskripsi statis "Plan aktif, upgrade paket").

- [ ] **Step 2: Tambah status pill dan billing dinamis**

Untuk kartu "Profil Toko": tambahkan `Badge variant="success"` dengan teks "Lengkap" (kondisional: cek field `tenant.name`/`tenant.address` terisi — pakai `useTenant()` yang sudah ada di komponen lain seperti Dashboard).
Untuk kartu "Printer" dan "QRIS": tambahkan `Badge variant="warning"` teks "Belum diatur" (kondisi bisa statis `true` untuk sekarang karena fitur belum tersambung backend riil — catat sebagai simplifikasi).
Untuk kartu "Paket & Tagihan": ganti deskripsi statis jadi dinamis, contoh `${tenant.plan.replace('_', ' ')} — trial aktif` (pakai field yang tersedia di `tenant` object, cek `TenantContext` untuk field trial yang ada; kalau tidak ada field trial days, pertahankan deskripsi generik tanpa mengarang angka).

- [ ] **Step 3: Type-check**

```bash
pnpm --filter tenant-app type-check
```

- [ ] **Step 4: Manual verify**

Buka `/pengaturan`, cek badge status muncul di pojok kartu Profil Toko/Printer/QRIS.

- [ ] **Step 5: Commit**

```bash
git add "apps/tenant-app/app/(dashboard)/pengaturan/page.tsx"
git commit -m "feat(tenant-app): Pengaturan hub - tambah status completion pill per kartu"
```

---

### Task D6: Pengaturan QRIS — toggle aktifkan

**Files:**
- Modify: `apps/tenant-app/app/(dashboard)/pengaturan/qris/page.tsx`

- [ ] **Step 1: Baca file saat ini**

Cek isi `apps/tenant-app/app/(dashboard)/pengaturan/qris/page.tsx` — saat ini hanya `EmptyState` (dari audit).

- [ ] **Step 2: Tambah toggle di atas/bawah EmptyState**

Tambahkan `Switch` (dari `components/ui/switch.tsx`, sudah ada di codebase) dengan label "Aktifkan QRIS di kasir", state lokal default `true` (mock, belum tersambung backend — catat sebagai simplifikasi karena backend QRIS di luar scope plan ini):

```tsx
import { useState } from 'react';
import { Switch } from '@/components/ui/switch';

// ...di dalam komponen, sebelum/sesudah EmptyState:
const [enabled, setEnabled] = useState(true);

<div className="mb-4 flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
  <span className="text-sm font-medium text-[var(--ink)]">Aktifkan QRIS di kasir</span>
  <Switch checked={enabled} onCheckedChange={setEnabled} />
</div>
```

- [ ] **Step 3: Type-check**

```bash
pnpm --filter tenant-app type-check
```

- [ ] **Step 4: Manual verify**

Buka `/pengaturan/qris`, cek toggle muncul dan bisa di-klik.

- [ ] **Step 5: Commit**

```bash
git add "apps/tenant-app/app/(dashboard)/pengaturan/qris/page.tsx"
git commit -m "feat(tenant-app): Pengaturan QRIS - tambah toggle aktifkan"
```

---

### Task D7: Pengaturan Tema — live preview strip + grid 9-kolom

**Files:**
- Modify: `apps/tenant-app/components/ThemeColorPicker.tsx`

- [ ] **Step 1: Baca file untuk struktur swatch saat ini**

Baca `apps/tenant-app/components/ThemeColorPicker.tsx:9-30` — audit menyebut `flex flex-wrap`, bukan grid 9-kolom.

- [ ] **Step 2: Ganti layout swatch ke grid 9-kolom + tambah preview strip**

Ganti class container swatch dari `flex flex-wrap` ke `grid grid-cols-9 gap-2` (atau `grid-cols-5 sm:grid-cols-9` kalau perlu wrap di layar sempit). Setelah grid swatch, tambahkan preview strip:

```tsx
<div className="mt-4 flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
  <button className="h-11 rounded-xl bg-[var(--primary)] px-4 text-sm font-bold text-[var(--primary-ink)]">Bayar</button>
  <span className="rounded-full bg-[var(--nav-active)] px-3 py-1.5 text-xs font-medium text-[var(--nav-active-ink)]">Nav aktif</span>
</div>
```
(Preview ini otomatis reaktif karena `--primary` adalah CSS var yang diubah langsung oleh `useThemeColor` hook yang sudah ada — tidak perlu prop tambahan.)

- [ ] **Step 3: Type-check**

```bash
pnpm --filter tenant-app type-check
```

- [ ] **Step 4: Manual verify**

Buka `/pengaturan/tema`, cek grid 9 swatch warna, klik warna berbeda — cek preview strip (tombol Bayar) berubah warna langsung.

- [ ] **Step 5: Commit**

```bash
git add apps/tenant-app/components/ThemeColorPicker.tsx
git commit -m "feat(tenant-app): Pengaturan Tema - grid 9-kolom, live preview strip"
```

---

### Task D8: Dashboard loading skeleton

**Files:**
- Modify: `apps/tenant-app/app/(dashboard)/page.tsx`

Catatan: task ini sebagian sudah terpenuhi oleh Task D1 (Dashboard sudah pakai `<Skeleton>` untuk hero card dan transaksi terbaru saat `summary`/`recent` masih `null`). Task ini adalah verifikasi eksplisit, bukan penulisan kode baru.

- [ ] **Step 1: Verifikasi skeleton benar-benar muncul saat loading**

Buka `/` dengan network throttling (`Slow 3G` di devtools) atau tambahkan delay sesaat di `apiFetch` secara lokal untuk testing manual, cek hero card dan list transaksi terbaru menampilkan `<Skeleton>` sebelum data datang.

- [ ] **Step 2: Kalau skeleton sudah benar dari Task D1, tidak ada perubahan kode — skip commit**

Kalau ternyata ada bagian yang belum di-skeleton-kan (misal quick actions row), tambahkan `<Skeleton>` seperlunya dan commit:

```bash
git add "apps/tenant-app/app/(dashboard)/page.tsx"
git commit -m "fix(tenant-app): lengkapi loading skeleton Dashboard"
```

---

## Self-Review Notes

- **Spec coverage:** Semua 4 lapisan spec (migration, backend A2-A4, token B1-B2, screen 01-09 + section 10) punya task terpadan. Section 02 (Setup Wizard "Pratinjau Kasir" live-update panel kanan) SENGAJA tidak ditulis sebagai task terpisah — cakupannya besar (state sinkron real-time lintas 5 step) dan berisiko tinggi salah tebak struktur state wizard tanpa membaca `app/setup/page.tsx` penuh dulu; Task C6 hanya menutup 2 gap paling konkret (Transfer Bank, preview struk akhir) dari Setup Wizard. Kalau preview kasir live tetap diinginkan, perlu task riset+desain terpisah setelah `app/setup/page.tsx` dibaca penuh oleh pelaksana.
- **Breadcrumb nested modal (05):** Task C4 Step 4 menulis kondisional "cek dulu alur nyata" karena dari pembacaan awal, `MenuForm` dan `VariantGroupsModal` kemungkinan besar dua modal independen (bukan benar-benar nested) — pelaksana harus verifikasi sebelum menerapkan breadcrumb.
- **Placeholder scan:** Tidak ada TBD/TODO baru diperkenalkan (TODO lama di billing dihapus di Task A5). Field yang belum ada data pasti (Pengaturan hub Printer/QRIS "Belum diatur") ditandai eksplisit sebagai simplifikasi di Task D5/D6, bukan disamarkan sebagai selesai.
- **Type consistency:** `RecentOrder`/`SalesSummary`/`TimeseriesPoint`/`CustomerDetail` didefinisikan sekali per file pemakai (tidak ada shared type barrel untuk ini — konsisten dengan pola existing di `app/laporan/insight/page.tsx` yang juga mendefinisikan type lokal per halaman, bukan di `lib/types.ts`). `stock_levels` kolom (`menu_id`, `stock_qty`, `low_stock_threshold`) dipakai identik antara Task A1 (schema), Task A2 (endpoint), Task D3 (UI) — nama field tidak berubah antar task.
- **Task independen di Bagian C/D:** Task C1-C6 dan D1-D8 masing-masing menyentuh file berbeda (tidak ada 2 task menulis file yang sama), sehingga bisa dieksekusi paralel oleh subagent berbeda SETELAH Bagian A dan B selesai (dependency keras: semua Bagian C/D butuh Task A2-A4 untuk data nyata dan Task B1-B2 untuk token/badge).
