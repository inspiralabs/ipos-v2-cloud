# Laporan & Insight — Design Spec

## Context

Laporan adalah fitur terpenting ipos-cloud menurut pemilik produk — bukan sekadar tabel penjualan, tapi halaman insight yang membantu owner mengambil keputusan (menu apa yang laku, tren naik/turun, jam sibuk, rekomendasi actionable). Halaman `app/(dashboard)/laporan/page.tsx` yang ada sekarang (dibangun sesi sebelumnya) baru punya tabs sederhana (harian/mingguan/bulanan/per-kasir) yang memanggil endpoint `report-service` yang **belum ada** (service masih skeleton, cuma health-check).

Scope spec ini mencakup backend (`report-service`) DAN frontend, karena user secara eksplisit ingin fitur ini benar-benar berfungsi untuk demo, bukan UI kosong menunggu backend.

## Keputusan Desain

**Struktur URL**: `/laporan/insight` sebagai full-page terpisah dari shell `(dashboard)` (di luar route group, tanpa Sidebar/Topbar biasa) — mode "analytics" tersendiri dengan header sendiri (nama toko, tombol kembali ke dashboard, date-range picker global). Halaman `/laporan` yang sudah ada (tabs sederhana, di dalam shell) tetap ada sebagai laporan tabular biasa; `/laporan/insight` adalah tambahan baru yang lebih kaya.

**Insight engine**: template-based (tanpa panggilan LLM/AI API) — semua "insight" adalah hasil perhitungan agregat (rank, % perubahan, threshold) yang dimasukkan ke template kalimat Bahasa Indonesia yang sudah ditulis. Tidak ada biaya API tambahan, tidak ada latency LLM, deterministic dan bisa ditest.

**Fitur insight prioritas** (semua 4 masuk versi pertama):
1. Rekomendasi menu terlaris/kurang laku
2. Insight tren (naik/turun dibanding periode sebelumnya, dengan kalimat naratif)
3. Jam/hari tersibuk (peak hour analysis)
4. Rekomendasi actionable (kalimat saran berdasarkan pola data)

## Backend: `report-service`

Service ini baru berisi `src/index.ts` dengan health-check saja. Perlu dibangun sebagai Fastify service penuh (mengikuti pola service lain seperti `tenant-service`): registrasi CORS, DB connection (`@ipos-cloud/shared`), route registrations, auth guard (`tenantGuard` yang sama dipakai tenant-service).

### Endpoint baru

Semua endpoint scope by `tenant_id` dari JWT (pola sama seperti tenant-service), query dari `pos_orders` + `pos_order_items` (join by `order_id`), filter `status = 'paid'`, `created_at BETWEEN from AND to`.

- **`GET /api/v1/reports/sales-summary?from=&to=`**
  Return: `{ total_omzet, total_transactions, avg_transaction, previous_period: { total_omzet, total_transactions }, change_percent }`.
  `change_percent` dihitung backend: `(current - previous) / previous * 100`, dibulatkan.

- **`GET /api/v1/reports/top-menu?from=&to=&limit=10`**
  Query: `SELECT menu_id, product_name, SUM(qty) as total_qty, SUM(price * qty) as total_revenue FROM pos_order_items JOIN pos_orders ON ... GROUP BY menu_id, product_name ORDER BY total_qty DESC LIMIT :limit`.
  Return array of `{ menu_id, product_name, total_qty, total_revenue }`.

- **`GET /api/v1/reports/bottom-menu?from=&to=&limit=10`**
  Sama seperti top-menu tapi `ORDER BY total_qty ASC`, dan HANYA menu yang aktif di katalog (join `menus` where `is_active = true`) — supaya tidak menyarankan promo untuk menu yang sudah dihapus/nonaktif.

- **`GET /api/v1/reports/peak-hours?from=&to=`**
  Query: group `created_at` by `EXTRACT(HOUR FROM created_at)` dan `EXTRACT(DOW FROM created_at)`.
  Return: `{ by_hour: [{hour, transaction_count}], by_day: [{day_of_week, transaction_count}] }`.

### Feature gating

Periode selain `daily` (weekly/monthly/per_cashier) dan endpoint `bottom-menu`/`peak-hours` di-guard dengan `requireFeature('advanced_report')` (sudah ada di `packages/shared/src/feature-gate.ts`, dipakai sebagai Fastify `preHandler`). `sales-summary` periode harian dan `top-menu` (terbatas 5) tetap terbuka untuk UMKM Lite.

### Perubahan Data

Tidak perlu kolom baru — `pos_orders` dan `pos_order_items` (dilihat di `packages/drizzle-schema/src/pos.ts`) sudah punya semua field yang dibutuhkan (`created_at`, `total`, `menu_id`, `qty`, `price`). Query agregat murni read-only.

## Frontend: Insight Engine (Template-Based)

`lib/insights.ts` (baru) — fungsi murni menerima hasil dari 4 endpoint di atas, mengeluarkan array terstruktur:

```ts
type Insight = { type: 'trend' | 'top_menu' | 'bottom_menu' | 'peak_hour'; message: string; severity: 'positive' | 'neutral' | 'warning' };
```

Template kalimat (Bahasa Indonesia, nada hangat sesuai DESIGN.md):
- Tren naik: `"Omzet naik {persen}% dibanding {periode sebelumnya} — pertahankan!"` (severity: positive)
- Tren turun: `"Omzet turun {persen}% dibanding {periode sebelumnya}"` (severity: warning)
- Top menu: `"{nama} jadi menu terlaris — {qty} porsi terjual"` (severity: positive)
- Bottom menu: `"{nama} kurang laku ({qty} porsi) — coba promo atau evaluasi menu ini"` (severity: warning)
- Peak hour: `"Jam tersibukmu: {jam}:00 — siapkan stok & staf ekstra"` (severity: neutral)

## Frontend: Halaman `/laporan/insight`

Route BARU di luar `(dashboard)` route group (layout sendiri, bukan flat seperti `/pos` — punya header ringkas sendiri, bukan tanpa chrome sama sekali).

**Struktur halaman**:
1. Header: nama toko, tombol kembali ke `/` (dashboard), date-range picker (Hari Ini / Minggu Ini / Bulan Ini / Custom).
2. Row insight cards: horizontal-scroll di mobile, grid `sm:grid-cols-2 lg:grid-cols-4` di desktop — tiap kartu satu insight (ikon sesuai severity + kalimat + angka pendukung besar).
3. Section tren: line chart (Recharts, sesuai PRD §9 tech stack) omzet periode ini vs periode sebelumnya.
4. Section top/bottom menu: dua tabel bersisian di desktop (`grid-cols-2`), tab di mobile.
5. Section peak hour: heatmap sederhana jam×hari (grid CSS, warna intensitas dari `--primary` dengan opacity bertingkat — bukan library heatmap baru).

**Motion**: stagger reveal insight cards saat data selesai load (`framer-motion` `staggerChildren`), transisi crossfade saat date-range berubah (bukan flash/reload instan).

**Fitur di luar plan (Lite tier)**: section bottom-menu, peak-hour, dan periode selain harian ditampilkan dengan `PlanGate featureKey="advanced_report"` (komponen sudah ada dari sesi sebelumnya) — tetap terlihat terkunci, bukan hilang, sesuai prinsip PRD §2.4/§10.3.

## Dependency

Tidak ada dependency baru untuk backend (Fastify, Drizzle, zod semua sudah dipakai service lain). Frontend: `recharts` (belum ada di `tenant-app/package.json`, perlu ditambahkan — sudah jadi pilihan resmi PRD §9), `framer-motion` (sama seperti 2 spec lain).

## Verifikasi

- `pnpm --filter report-service dev` — cek health-check tetap jalan, lalu test tiap endpoint baru dengan `curl` + JWT tenant valid.
- Buat beberapa order lewat `/pos` dengan menu berbeda-beda dan jam berbeda (atau seed data test), lalu buka `/laporan/insight` — cek insight cards menghasilkan kalimat yang masuk akal dari data nyata.
- Login sebagai tenant `umkm_lite` — cek section advanced ter-gate dengan overlay, bukan error/crash.
- Ganti date-range — cek transisi halus, data ter-refresh sesuai rentang baru.
- `pnpm type-check` di `report-service` dan `tenant-app`, `pnpm build` di `tenant-app`.
