# Design: tenant-app Redesign — Selaraskan dengan Design Handoff

## Latar Belakang

Design handoff baru (`docs/design_handoff_tenant_app_redesign/iPos Cloud - Tenant App Final Design.dc.html`)
mendefinisikan pola visual "modern minimalist POS" untuk tenant-app — perbaikan dari sistem yang sudah ada
di `apps/tenant-app/DESIGN.md`. Audit terhadap implementasi saat ini menemukan gap di semua 10 area screen,
dan sebagian gap tidak bisa diselesaikan di layer UI saja karena backend/skema DB pendukungnya belum ada
sama sekali (stok inventory, riwayat pelanggan, chart time-series). Scope ini karena itu mencakup migration
DB baru, 3 service backend, dan redesign ~15 halaman frontend.

Referensi:
- `docs/design_handoff_tenant_app_redesign/iPos Cloud - Tenant App Final Design.dc.html` (source visual, cari via `data-screen-label`)
- `docs/design_handoff_tenant_app_redesign/README.md` (ringkasan per screen)
- `apps/tenant-app/DESIGN.md` (design system existing — tetap jadi basis, spec ini koreksi+lengkapi, bukan ganti total)
- `apps/tenant-app/PRODUCT.md` (brand personality "Warung Digital")

## Hasil Audit (ringkasan)

Tema gap berulang lintas screen:
1. Chip/tab/pill aktif (kategori POS, period switcher Laporan) masih pakai `bg-[var(--primary)]` (maroon) —
   seharusnya ink-fill (`#1a1310`-setara). Maroon direservasi hanya untuk CTA primer (Bayar/Simpan/Tambah/Konfirmasi)
   dan penekanan harga/diskon.
2. Sistem badge status (`.kb-safe`/`.kb-warn`/`.kb-danger`/`.kb-neutral` di handoff) sudah punya padanan di
   `components/ui/badge.tsx` (`success`/`warning`/`destructive`/`neutral`) tapi belum konsisten dipakai —
   sebagian tempat pakai warna Tailwind generik langsung.
3. Layar data-berat (Pelanggan, Inventory) diimplementasikan sebagai list/table polos, bukan grid kartu visual
   hangat sesuai "Warung Digital" — terasa seperti tabel admin generik.
4. Modal/state polish yang di handoff Section 10 secara eksplisit ditandai sebagai state tambahan memang belum
   ada: dashboard skeleton, breadcrumb nested-modal Menu→Grup Variasi, preview struk visual POS, live theme
   preview strip, restock modal, detail modal pelanggan.
5. Dashboard dan halaman Laporan utama tidak tersambung ke data nyata — omzet hardcode "Rp 0", tidak ada
   chart di `/laporan` (chart granular hanya ada terpisah di `/laporan/insight` dan cuma bandingkan 2 titik).
6. Nomor WhatsApp admin billing masih placeholder lama (`6281234567890`), seharusnya `+62 821-2453-3265`.

Temuan backend saat investigasi:
- `inventory-service` hanya punya `/health` — endpoint `/api/v1/inventory/stock-levels` yang sudah dipanggil
  frontend (`app/(dashboard)/inventory/page.tsx`) tidak ada sama sekali di service.
- Tabel `menus` (drizzle-schema `catalog.ts`) tidak punya kolom stok — perlu tabel baru.
- `report-service` hanya punya `sales-summary` (current vs previous, 2 titik), `top-menu`/`bottom-menu`,
  `peak-hours` (agregat hour/day, bukan time-series per rentang granularitas) — tidak ada endpoint untuk
  chart tren garis per jam/hari/minggu/bulan yang mengikuti period switcher Laporan.
- `customers` (tenant-service) sudah punya route dasar (list/create/update) tapi tidak ada endpoint detail
  (agregat belanja, kunjungan, menu favorit, riwayat transaksi). `pos_orders.customer_id` sudah ada (FK),
  jadi agregasi ini feasible tanpa migration tambahan untuk relasi customer→order.

## Scope

Redesign UI penuh (10 area screen) **+** backend pendukung agar data binding nyata (bukan mock), mencakup:
migration DB, endpoint backend baru, token/komponen shared, dan implementasi ulang setiap screen.

## Arsitektur — 4 Lapisan (urutan eksekusi bottom-up)

### Lapisan 1: Migration DB

Tabel baru `stock_levels` di `packages/drizzle-schema/src/catalog.ts`:
```
id uuid PK
tenant_id uuid FK → tenants.id (cascade)
menu_id uuid FK → menus.id (cascade), UNIQUE
stock_qty integer default 0
low_stock_threshold integer default 5
updated_at timestamp
```
Satu row per menu; tidak ada row = "belum dilacak" (match perilaku `EmptyState` existing).
Generate via `pnpm db:generate` dari root `ipos-cloud` lalu `db:migrate`.

### Lapisan 2: Backend (3 service + 1 fix data)

**A. `inventory-service`** (services/inventory-service — saat ini hanya `/health`):
- `GET /api/v1/inventory/stock-levels` — join `menus` + `stock_levels`, `requireAuth` + `requireFeature('stock_management')`
- `POST /api/v1/inventory/stock-levels/:menu_id/restock` — body `{ qty_added: number }`, upsert row (insert kalau belum ada, else increment `stock_qty`), return level baru

**B. `report-service`** (services/report-service/src/index.ts):
- `GET /api/v1/reports/timeseries?from&to&granularity=hour|day|week|month` — group-by sesuai granularity,
  return `{ bucket: string, omzet: number, transaction_count: number }[]`. Dipakai line chart Laporan
  (mingguan/bulanan/tahunan) dan bar chart "Jam Sibuk" (granularity=hour, mode harian).

**C. `tenant-service`** (customers route, services/tenant-service/src/tenant/customers.ts):
- `GET /api/v1/customers/:id/detail` — agregat dari `pos_orders` (total belanja, jumlah kunjungan),
  menu favorit (top items dari `pos_order_items` by customer via order), riwayat transaksi (list ringkas
  terbaru). Pakai `pos_orders.customer_id` yang sudah ada.

**D. Fix data:** `apps/tenant-app/app/(dashboard)/pengaturan/billing/page.tsx` — ganti `WHATSAPP_ADMIN`
placeholder ke `+62 821-2453-3265`, tampilkan nomor di label tombol "Hubungi Admin untuk Upgrade".

### Lapisan 3: Token & Komponen Shared

1. **Ink-fill nav-active token**: tambah `--nav-active` (ink, setara `#1a1310`) di `app/globals.css`,
   dipakai KHUSUS untuk state aktif chip/tab/pill navigasi & filter (kategori POS, period switcher Laporan,
   tab Pelanggan/Kelola Staf). `--primary` tetap eksklusif untuk CTA primer + harga/diskon — tidak berubah
   perannya, hanya dibatasi pemakaiannya sesuai Named Rule di handoff.
2. **Badge variant konsisten**: audit semua pemakaian `Badge` dan warna status ad-hoc (Tailwind `amber-100`
   dst langsung) di seluruh screen, ganti ke variant `components/ui/badge.tsx` yang sudah ada
   (`success`≈safe, `warning`≈warn, `destructive`≈danger, `neutral`). Sesuaikan warna hex variant ke nilai
   handoff (`#fbe9e7`/`#eaf5ee` dst) bila berbeda dari token saat ini.
3. **Tabular-nums disiplin**: bukan token baru (Tailwind sudah native `tabular-nums`), pastikan dipakai pada
   semua angka uang saat redesign tiap screen (Total POS, harga menu, omzet, dst).

### Lapisan 4: Screen-by-screen

Setiap screen redesign mengikuti `DESIGN.md` existing (radius, warna, shadow vocabulary, Do's/Don'ts) —
spec ini mengoreksi penyimpangan dan melengkapi yang hilang, bukan menciptakan sistem desain paralel.

| # | Screen | File utama | Perubahan |
|---|---|---|---|
| 01 | Login | `app/login/page.tsx` | Layout 2-kolom desktop (form + foto/gradient + tip card overlap), single-column mobile; H1 "Selamat datang kembali" + copy sesuai handoff; error box per-field (bukan teks polos) + inline validation format email |
| 02 | Setup Wizard | `app/setup/page.tsx` | Panel kanan "Pratinjau Kasir" live-update (desktop, semua step); preview foto placeholder step Menu; tambah opsi Transfer Bank di step Cara Bayar; preview struk mock + icon sukses di step Cetak Struk |
| 03 | Dashboard | `app/(dashboard)/page.tsx` | Sambung `GET /reports/sales-summary` (omzet+delta asli) & `GET /pos/orders` (transaksi terbaru asli, limit 3-5); hero card gradient layout `1.4fr 1fr`; sapaan waktu-hari + icon; tombol "Buka Kasir" primary CTA; bedakan tampilan toko-baru (0 transaksi total) vs aktif |
| 04 | Kasir/POS | `app/pos/page.tsx`, `components/pos/QtyStepper.tsx` | Chip kategori → ink-fill token; qty stepper cart 44px→28px; `tabular-nums` semua angka uang; badge diskon persen pojok kartu menu; kembalian mini-card cream (bukan teks inline); preview struk visual di modal sukses (bukan hanya print function) |
| 05 | Menu/Katalog | `app/(dashboard)/menu/page.tsx`, `components/menu/MenuCard.tsx` | Dashed "+" tile quick-add akhir grid; item habis → opacity 55% + label teks (ganti dari Badge destructive solid); breadcrumb "Tambah Menu › Grup Variasi" saat modal Grup Variasi dibuka dari dalam form Menu |
| 06 | Pelanggan & Staf | `app/(dashboard)/pelanggan/page.tsx` | List → grid kartu (avatar inisial berwarna, nama, phone, pill "N× belanja"); tab switcher Pelanggan/Kelola Staf dalam satu halaman (gabung dari route staf terpisah, ink-fill active); modal Detail Pelanggan baru (stats, menu favorit, riwayat — pakai endpoint 2C) |
| 07 | Inventory | `app/(dashboard)/inventory/page.tsx` | Table → grid kartu (foto 44px, nama, status pill qty-inline, quick-restock button); search bar + filter pill (Semua/Menipis/Aman); modal Tambah Stok (stepper qty, preview stok-setelah, pakai endpoint 2A) |
| 08 | Laporan | `app/(dashboard)/laporan/page.tsx`, `app/laporan/insight/page.tsx` | Satukan jadi satu shell period-driven (`period: 'daily'\|'weekly'\|'monthly'\|'yearly'`); period switcher 4-segmen ink-fill; hero gradient card (omzet+delta+watermark); insight/rekomendasi row di atas chart; line chart pakai endpoint timeseries (2B) untuk weekly/monthly/yearly; bar chart "Jam Sibuk" untuk daily |
| 09 | Pengaturan | `app/(dashboard)/pengaturan/*` | Status completion pill di hub cards (`Lengkap`/`Belum diatur`); billing: hero plan card + "Trial N hari lagi" + bandingkan paket + WA number fix (2D); QRIS: toggle "Aktifkan QRIS di kasir"; Tema: live preview strip (tombol Bayar + pill contoh warna terpilih) + grid 9-kolom tetap |
| 10 | State tambahan | lintas file | Dashboard loading skeleton; empty state khusus Pelanggan & Laporan sesuai styling handoff (bukan `EmptyState` generik polos) |

## Non-Goals

- Tidak mengubah admin-app (di luar scope, anti-reference eksplisit).
- Tidak menambah color preset baru di luar 9 preset existing (`ThemeColorPicker`).
- Tidak membangun payment gateway asli untuk QRIS (tetap simulasi manual-confirm sesuai PRD saat ini).
- Tidak refactor auth/plan-gating logic yang sudah ada — hanya pemakaiannya di UI baru.

## Urutan Implementasi

Bottom-up sesuai lapisan: (1) migration → (2) backend 3 service + fix data → (3) token/komponen shared →
(4) screen 01-10 berurutan sesuai tabel di atas. Setiap lapisan harus lulus type-check/build sebelum lapisan
berikutnya dimulai, karena lapisan 4 bergantung pada 2 dan 3.
