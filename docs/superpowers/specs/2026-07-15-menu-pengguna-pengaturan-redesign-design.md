# Menu, Pengguna, Pengaturan — Visual Redesign Spec

## Context

Tiga halaman tenant-app yang perlu redesign visual konsisten memakai pola grid+kartu+ikon, dibangun dengan komponen shadcn/ui-style yang sudah ada (Card, Badge, dll dari sesi sebelumnya) digabung framer-motion untuk reveal/state transitions.

- **Menu** (`app/(dashboard)/menu/page.tsx`): saat ini list-by-category (bukan grid), tanpa ikon.
- **Pengguna** (`app/(dashboard)/kasir/page.tsx` — route `/kasir` tapi berisi manajemen staf/kasir, bukan layar POS): saat ini list, perlu grid kartu konsisten dengan Menu.
- **Pengaturan** (`app/(dashboard)/pengaturan/page.tsx` hub + `profil/page.tsx`): hub saat ini list-of-cards satu kolom; Profil Toko belum punya upload logo, field alamat, field no HP.

## Keputusan Desain

### Menu → Grid Kartu
- Grid responsif: `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`.
- Tiap kartu: foto produk di atas (placeholder ikon piring generik dari lucide-react kalau `image_url` kosong), ikon kategori kecil di pojok kartu (mapping nama kategori → ikon Lucide, fallback ikon generik kalau tidak ada match), nama + harga (dengan harga asli dicoret kalau ada `discount_price`) di bawah.
- Badge "HABIS" (destructive variant) jelas menutup sudut kartu kalau `is_sold_out`, bukan sekadar teks pudar.
- Ikon aksi (edit=`Pencil`, hapus=`Trash2`, toggle sold-out=`EyeOff`/`Eye`) muncul sebagai overlay tap/hover di kartu, bukan tombol teks terpisah di baris.
- Motion: stagger reveal saat grid pertama load (`framer-motion` `staggerChildren` ~30ms antar kartu), `layout` animation Framer saat kartu berubah state (toggle sold-out, filter kategori).

### Pengguna → Grid Kartu (pola sama dengan Menu)
- Grid sama seperti Menu.
- Tiap kartu staf: avatar besar di atas (foto kalau ada, fallback inisial nama dengan latar `--primary` kalau tidak ada foto), nama + role/badge di bawah, ikon aksi edit/hapus sebagai overlay.
- Data staf berasal dari `GET /api/v1/tenants/users` (endpoint sudah ada, dipakai `CashierStep` di setup wizard) — tidak ada kolom foto di skema `users` saat ini; field foto perlu ditambahkan atau di-skip untuk saat ini (lihat Perubahan Data).

### Pengaturan Hub → Grid Kartu
- Ganti list-of-cards satu kolom jadi grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`.
- Tiap kartu Pengaturan (Profil, Printer, QRIS, Notifikasi, Billing, Tema): ikon besar di tengah-atas, label di bawah — kotak, bukan baris horizontal.
- Motion: stagger reveal sama seperti Menu/Pengguna.

### Pengaturan → Profil Toko
- Tambah upload logo: komponen upload UI lengkap (drag-drop atau klik, preview lokal sebelum submit, fallback ke inisial nama toko dengan latar `--primary` kalau tidak ada logo — pola avatar yang sama dipakai juga di kartu staf Pengguna).
- **Backend storage endpoint belum ada** — `tenants.logo_url` di skema hanya menyimpan URL string, belum ada mekanisme upload file (ke Supabase Storage/S3/dst). UI dibangun lengkap dan siap pakai begitu endpoint upload tersedia; sementara itu, submit form menyimpan `logo_url` sebagai null/unchanged jika tidak ada endpoint nyata untuk dipanggil — flag titik ini eksplisit di kode dengan komentar untuk tim backend.
- Tambah field alamat dan no HP — **kolom baru diperlukan** di tabel `tenants` (`address text`, `phone varchar(20)`), belum ada di skema saat ini. Tambahkan ke `packages/drizzle-schema/src/tenant.ts` dan ke `GET`/`PATCH /api/v1/tenants/me` di `tenant-service`.

## Komponen Baru

- `MenuCardGrid` / `MenuCard` (grid version, menggantikan list item di `menu/page.tsx`).
- `CategoryIcon` — util mapping nama kategori → komponen ikon Lucide (mis. "Minuman" → `CupSoda`, "Makanan" → `UtensilsCrossed`, fallback → `Package`).
- `StaffCardGrid` / `StaffCard` (grid version untuk `kasir/page.tsx`).
- `Avatar` — komponen baru: foto atau inisial nama dengan latar warna dari `--primary`, dipakai di StaffCard dan Profil Toko.
- `LogoUploader` — drag-drop/klik upload dengan preview, dipasang di `pengaturan/profil/page.tsx`.
- `SettingsCardGrid` (mengganti list `pengaturan/page.tsx` jadi grid card).

## Perubahan Data

- `packages/drizzle-schema/src/tenant.ts`: tambah `address: text('address')`, `phone: varchar('phone', { length: 20 })` ke tabel `tenants`.
- `services/tenant-service/src/routes/tenant/me.ts`: tambah `address`, `phone` ke response `GET /me` dan skema zod `PATCH /me`.
- Foto staf: **di luar scope saat ini** — skema `users` tidak punya kolom avatar/foto; StaffCard pakai fallback inisial untuk semua staf sampai kolom ditambahkan (bukan blocker, karena fallback inisial sudah jadi desain resmi, bukan sekadar placeholder sementara).

## Dependency Baru

`framer-motion` (sama seperti spec Kasir — satu install untuk seluruh tenant-app, tidak perlu diinstall ulang per halaman).

## Verifikasi

- Buka `/menu` — cek grid tampil 2/3/4 kolom sesuai breakpoint, badge HABIS jelas, ikon kategori muncul, stagger reveal saat load.
- Buka `/kasir` (Pengguna) — cek grid staf, avatar inisial untuk staf tanpa foto.
- Buka `/pengaturan` — cek grid 1/2/3 kolom, ikon besar per kartu.
- Buka `/pengaturan/profil` — cek uploader logo (preview lokal berfungsi meski belum ada endpoint upload nyata), field alamat & no HP tersimpan lewat `PATCH /me`.
- `pnpm type-check` dan `pnpm build` di `tenant-app` setelah schema+route berubah.
