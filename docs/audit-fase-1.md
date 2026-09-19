# Audit Fase 1 — ipos-v2-cloud

Tanggal: 2026-09-18 · Baseline: commit `d8583f5` · ~19.600 LOC TypeScript

Metode: 6 agent membaca seluruh kode per modul secara read-only. Setiap temuan berlabel
KRITIS diverifikasi ulang secara langsung (baca kode / jalankan probe) sebelum masuk daftar ini.

Kolom **V**:
- `✓` diverifikasi langsung — bukan sekadar laporan agent
- `·` dilaporkan agent, konsisten dengan kode, belum diuji satu per satu

Urgensi:
- **KRITIS** — bug nyata / lubang keamanan / kehilangan data yang bisa terjadi di produksi sekarang
- **TINGGI** — salah perilaku di edge case, atau blocker untuk refactor
- **SEDANG** — utang teknis yang memperlambat kerja
- **RENDAH** — kerapian

---

## Ringkasan eksekutif

Total temuan: **±230**. Yang KRITIS: **35**.

Arsitekturnya sehat — monorepo rapi, isolasi antar-tenant benar di hampir semua query,
`packages/shared` ringkas, type-check bersih di 14/14 project, komentar menjelaskan *kenapa*
bukan *apa*. Masalahnya bukan struktur, melainkan **lapisan pertahanan yang hilang**: tidak ada
index DB, tidak ada transaksi, tidak ada cek role di dalam tenant, tidak ada `trustProxy`.
Ditambah sekelompok fitur yang terlihat jadi di UI tapi tidak pernah tersambung ke backend.

### Delapan masalah yang harus dibereskan lebih dulu

| # | Masalah | Dampak |
|---|---|---|
| A | Eskalasi kasir → owner dalam 2 request | Setiap kasir bisa jadi owner toko |
| B | Pengambilalihan akun dari foto QR meja | PIN 4 digit, tanpa lockout, `user_id` bocor gratis |
| C | Lisensi offline bisa dipalsukan & di-bypass | Pendapatan produk offline tidak terlindungi |
| D | `requireFeature` rusak di 4 service | Stok, dapur, meja, laporan ber-gate = 500 untuk tenant berbayar |
| E | Nol index di 37 tabel | Setiap query bertenant = seq scan penuh |
| F | Order POS tanpa transaksi + dobel-tap | Order `paid` tanpa item; transaksi ganda; sync menggandakan item |
| G | Semua service ter-expose langsung ke host | nginx gateway bisa dilewati total |
| H | Fitur berbayar tanpa jalan masuk | tutup shift, void, split bill, redeem poin, export — dijual tapi tidak ada UI-nya |

---

## A. Eskalasi privilese kasir → owner · KRITIS

`tenantGuard` hanya memeriksa `tenant_id` ada. **Tidak ada cek role sama sekali.**

| V | Langkah | Lokasi |
|---|---|---|
| ✓ | `tenantGuard` tidak mengenal role | `tenant-service/src/middleware/admin-guard.ts:20-26` |
| ✓ | Seluruh `routes/tenant/users.ts` dijaga hanya oleh itu | `routes/tenant/users.ts:13` |
| ✓ | Kasir `GET /tenants/users/` → dapat `owner_id` | `routes/tenant/users.ts:15-23` |
| ✓ | Kasir `PATCH /tenants/users/<owner_id>/pin` → set PIN owner (tidak ada `ne(role,'owner')`) | `routes/tenant/users.ts:49-59` |
| ✓ | `POST /api/v1/auth/pin-login` (publik) → JWT dengan `role: 'owner'` | `auth-service/src/routes/pin-login.ts:20-42` |

| V | Efek samping dari akar yang sama | Lokasi | Urgensi |
|---|---|---|---|
| ✓ | Kasir bisa membuat akun role `manager` | `routes/tenant/users.ts:25-45` | KRITIS |
| ✓ | Kasir bisa menonaktifkan owner | `routes/tenant/users.ts:61-67` | KRITIS |
| · | Kasir bisa ubah profil toko, logo, dan gambar QRIS pembayaran | `routes/tenant/me.ts:47, 74, 91` | KRITIS |
| ✓ | `CASHIER_ROLES` memuat `outlet_manager`/`waiter`/`manager` yang tidak ada di `UserRole` | `users.ts:8` vs `shared/src/types.ts:1` | TINGGI |

---

## B. Pengambilalihan akun kasir dari foto QR meja · KRITIS

| V | Langkah | Lokasi |
|---|---|---|
| ✓ | `GET /api/v1/tables/qr/:qr_token` publik → mengembalikan `tenant_id` | `table-service/src/index.ts:148-153` |
| ✓ | `GET /api/v1/menus/public/:qr_token` juga mengembalikan `tenant_id` | `catalog-service/src/index.ts:255-260` |
| ✓ | `GET /api/v1/auth/pin-login/staff?tenant_id=` publik → daftar `id`/`name`/`role` seluruh staf | `auth-service/src/routes/pin-login.ts:11-18` |
| ✓ | `POST /api/v1/auth/pin-login` PIN 4 digit, tanpa rate limit endpoint, tanpa lockout | `auth-service/src/routes/pin-login.ts:20-33` |
| ✓ | Rate limit global tidak berfungsi: **tidak ada `trustProxy` di service mana pun** | `auth-service/src/index.ts:9` vs `nginx/nginx.conf:16-18` |

`qr_token` sendiri **aman** — `randomBytes(12)` = 96 bit, tidak bisa dienumerasi
(`table-service/src/index.ts:61`). Yang bocor bukan token-nya, tapi `tenant_id` di body respons.

Konsekuensi kedua dari `trustProxy` yang hilang: limit ketat lupa-password (5 per 15 menit) jadi
**satu ember global** — 5 permintaan dari siapa pun mengunci reset password untuk semua pengguna
(`auth-service/src/routes/forgot-password.ts:28`).

| V | Masalah auth lainnya | Lokasi | Urgensi |
|---|---|---|---|
| ✓ | PIN-login tidak membuat baris `sessions` & tidak mengganti cookie `refresh_token` → setelah 15 menit `/refresh` mengembalikan identitas kasir SEBELUMNYA | `pin-login.ts:36-41` | KRITIS |
| ✓ | Impersonate mati total: terdaftar di `/api/v1/admin`, nginx merutekan itu ke tenant-service | `auth-service/src/index.ts:45` vs `nginx.conf:27` | KRITIS |
| · | Reset password tidak mencabut sesi aktif | `reset-password.ts:32-33` | KRITIS |
| · | Error handler meneruskan `error.message` mentah; `ZodError` tanpa `statusCode` → semua kegagalan validasi jadi 500 | `auth-service/src/index.ts:49-52` | KRITIS |
| · | Login tidak cek `tenants.status`/`deleted_at` — tenant suspended tetap bisa transaksi | `login.ts:33-36`, `refresh.ts:27-30`, `pin-login.ts:35` | TINGGI |
| · | Refresh token disimpan plaintext (token reset justru di-hash) | `login.ts:49-57` | TINGGI |
| · | Tidak ada rotasi refresh token / deteksi reuse | `refresh.ts:13-40` | TINGGI |
| · | `POST /logout` tidak pernah dipanggil klien mana pun | `logout.ts:6-14` | TINGGI |
| ✓ | OTP dibangkitkan `Math.random()` | `otp.ts:13` | TINGGI |
| ✓ | Kode OTP dicatat plaintext ke log | `otp.ts:18` | TINGGI |
| ✓ | OTP setengah jadi — `/verify` hanya balas `user_id`, tanpa token, tanpa pemanggil | `otp.ts:22-36` | TINGGI |
| · | Impersonate tidak menulis audit log | `impersonate.ts:14-33` | TINGGI |
| · | `CORS_ORIGIN` kosong → `origin: true` + `credentials: true` | `auth-service/src/index.ts:11` (pola sama di 3 service) | TINGGI |
| · | `/login` tanpa rate limit endpoint sendiri | `login.ts:14` | TINGGI |
| · | `hashToken` ditulis identik di 2 file; payload JWT disalin 4×; `expires_in: 900` hardcoded 3× | `forgot-password.ts:7`, `reset-password.ts:8`, dll | SEDANG |
| · | `seed-admin` menerima password lewat `process.argv` | `scripts/seed-admin.ts:8` | SEDANG |

---

## C. Lisensi offline bisa dipalsukan dan di-bypass · KRITIS

| V | Masalah | Lokasi |
|---|---|---|
| ✓ | Kunci = `SHA-256(deviceId_SALT)` dipotong 16 hex — deterministik, tanpa masa berlaku, tanpa tanda tangan | `tenant-service/src/routes/admin/offline.ts:13-21` |
| ✓ | **Salt tertanam di bundle klien**: `import.meta.env.VITE_SECURE_SALT_*` di-inline Vite saat build | `ipos-v2-offline/src/lib/license.ts:27-29` |
| ✓ | Bahkan tanpa salt: status lisensi dibaca mentah dari `localStorage.ipos_license` | `ipos-v2-offline/src/lib/license.ts:43-57` |
| ✓ | `isLicenseValid()` balas `true` untuk plan apa pun selain `trial`, **tanpa validasi ulang kunci** | `ipos-v2-offline/src/lib/license.ts:63-68` |
| ✓ | Trial 14 hari direset dengan menghapus satu key localStorage | `ipos-v2-offline/src/lib/license.ts:44-54` |
| · | Revoke tidak berefek: validasi murni offline; generate ulang mengembalikan kunci sama | `offline.ts:170-171` vs `206-221` |
| · | `admin_staff` boleh menerbitkan lisensi tapi hanya super_admin boleh mencabut | `offline.ts:156` vs `206` |
| · | `POST /api/clients/register` publik tanpa rate limit; `deviceId` dipilih penyerang, disimpan apa adanya di kolom `device_id_hash` (tidak di-hash) | `routes/public/offline.ts:20-37` |
| · | `GET /admin/offline/licenses` tanpa paginasi, mengembalikan seluruh `license_key` pelanggan | `offline.ts:200-203` |
| · | `extend-trial` offline memakai `client.trial_ends_at` tanpa cek `client` ada → 500 | `offline.ts:66-67` | 

---

## D. `requireFeature` rusak di 4 service · KRITIS

| V | Masalah | Lokasi |
|---|---|---|
| ✓ | `requireFeature` membaca `request.server.db`, tapi hanya auth/notification/pos/tenant yang `app.decorate('db', db)` | `packages/shared/src/feature-gate.ts:59` |
| ✓ | Probe langsung: `plan=null` → 403 palsu; `plan` terisi → `TypeError: Cannot read properties of undefined (reading 'select')` → 500 | — |

Terdampak: `inventory-service` (gate di 43, 72, 124, 130, 140, 155, 175, 185), `kitchen-service`
(50, 101), `table-service` (49, 55, 69, 84, 96, 114, 133), `report-service`.

**Bug ini menutupi bug lain.** Route KDS berhenti di gate sebelum mencapai query-nya:

| V | Masalah | Lokasi | Urgensi |
|---|---|---|---|
| ✓ | `db.select().from(pos_order_items)` **tanpa `WHERE` sama sekali** — tiap polling KDS menarik tabel item order SELURUH tenant ke memori | `kitchen-service/src/index.ts:60` | KRITIS |
| ✓ | Baris di atasnya menarik seluruh riwayat order tenant tanpa limit, hanya untuk ambil `table_number` | `kitchen-service/src/index.ts:59` | KRITIS |

Perbaikan `decorate` **wajib** dilakukan bersamaan dengan perbaikan query ini.

---

## E. Nol index di seluruh database · KRITIS

| V | Masalah | Lokasi |
|---|---|---|
| ✓ | Tidak ada satu pun `CREATE INDEX` di 17 file migrasi | `packages/drizzle-schema/migrations/*.sql` |
| ✓ | Tidak ada `index()`/`uniqueIndex()` di `src/*.ts` | `packages/drizzle-schema/src/*.ts` |

37 tabel. Setiap kolom `tenant_id` dan setiap FK tanpa index. Biaya query tumbuh mengikuti data
**seluruh platform**, bukan data tenant itu saja.

| V | Constraint yang juga hilang | Lokasi | Urgensi |
|---|---|---|---|
| · | `menu_variant_groups` tanpa primary key maupun unique | `src/catalog.ts:53-57` | TINGGI |
| · | `attendance_logs` tanpa unique `(tenant_id, user_id, date)` | `src/resto.ts:65-73` | TINGGI |
| · | `users.tenant_id`/`outlet_id` tanpa FK — satu-satunya `tenant_id` di skema yang tidak punya | `src/auth.ts:7-8` | TINGGI |
| · | `tenants.plan_code` default `'trial'` — bukan anggota `TenantPlan` → `PLAN_FEATURES['trial']` undefined → tenant kehilangan SEMUA fitur diam-diam | `src/tenant.ts:9` | TINGGI |
| · | `pos_orders.created_at` disuplai klien tanpa clamping server | `src/pos.ts:38` | TINGGI |
| · | `restaurant_tables` & `categories` tanpa unique per tenant | `src/restaurant.ts:11`, `src/catalog.ts:8` | SEDANG |
| · | `sessions`/`otp_codes`/`password_reset_tokens` tanpa pembersihan & tanpa index | `src/auth.ts:20-47` | SEDANG |
| · | `ingredients.cost_per_unit` integer rupiah per satuan terkecil → harga < Rp1/gram membulat jadi 0 | `src/bom.ts:14` | SEDANG |
| · | `drizzle.config.ts` membaca skema dari `dist/`, bukan `src/` | `drizzle.config.ts:7` | SEDANG |
| · | Migrasi 0012 pakai `ADD CONSTRAINT` telanjang, beda pola dari semua migrasi lain yang idempoten | `migrations/0012_*.sql:1` | SEDANG |

---

## F. pos-service — integritas transaksi

| V | Masalah | Lokasi | Urgensi |
|---|---|---|---|
| ✓ | Order + item tanpa transaksi → item gagal = order `paid` tanpa item | `index.ts:122-132` | KRITIS |
| ✓ | `sync-batch` dikomentari "idempotent" tapi `onConflictDoNothing()` pada item **tidak akan pernah aktif** (`pos_order_items.id` = `defaultRandom()`, tanpa unique lain) → resync menggandakan item | `index.ts:238-240` + `drizzle-schema/src/pos.ts:43` | KRITIS |
| · | Self-order publik memotong stok bahan baku sebelum ada pembayaran, tanpa rate limit | `index.ts:326` | KRITIS |
| · | Order self-order dibuat `status:'pending'` tapi tidak ada route untuk melunasinya; dashboard menghitung semua order non-`void` sebagai omzet | `index.ts:314` | KRITIS |
| · | Semua `fetch` antar-service tanpa timeout/retry dan `res.ok` tidak diperiksa | `index.ts:144-148, 159-163, 176-180, 340-344, 353-357` | KRITIS |
| ✓ | Void hanya membalik kolom status — stok tidak dikembalikan, tiket dapur tidak dibatalkan, poin loyalty tidak ditarik | `index.ts:211-220` | TINGGI |
| ✓ | `GET /orders` tanpa `date` mengembalikan seluruh riwayat order + item, tanpa paginasi | `index.ts:186-198` | TINGGI |
| ✓ | Filter tanggal dipaku UTC padahal operasional WIB | `index.ts:192` | TINGGI |
| · | `subtotal`/`discount`/`total` dipercaya mentah dari klien | `index.ts:102-104` | TINGGI |
| · | `status: 'void'` bisa dikirim saat create, melewati gate `void_transaction` | `index.ts:101, 211` | TINGGI |
| · | `shift_id`/`customer_id` dari body tidak diverifikasi milik tenant | `index.ts:100, 109` | TINGGI |
| · | Cek shift terbuka hanya per tenant, bukan per outlet; ada race | `index.ts:48-52` | TINGGI |
| · | `hasFeature()` dipanggil ulang 3× per order = 3 query DB ekstra di jalur terpanas | `index.ts:142, 157, 172` | SEDANG |

---

## G. Infrastruktur

| V | Masalah | Lokasi | Urgensi |
|---|---|---|---|
| ✓ | Semua 10 service mem-publish port ke host → nginx gateway bisa dilewati total | `docker-compose.yml:20-21` dst | KRITIS |
| ✓ | notification-service ter-expose di 3009 — padahal nginx eksplisit menolak mengeksposnya | `docker-compose.yml:168` vs `nginx.conf:38-40` | KRITIS |
| ✓ | nginx tanpa `client_max_body_size` → default 1 MB, upload foto menu/logo kena 413 | `nginx.conf:22-47` | TINGGI |
| ✓ | `PUBLIC_ORDER_URL` default `http://localhost:3012/order` — QR tercetak berisi localhost kalau env lupa diisi | `docker-compose.yml:145` | TINGGI |
| ✓ | Image produksi berisi seluruh `/app` termasuk devDependencies, source, dan `dist/scripts/reset-tenant.js` | `Dockerfile:39` | TINGGI |
| ✓ | Container jalan sebagai root | `Dockerfile:36-41` | TINGGI |
| ✓ | Tidak ada `HEALTHCHECK` padahal semua service punya `/health` | `Dockerfile` | SEDANG |
| ✓ | `Dockerfile.web` stage deps tidak copy `packages/*` & `services/*` package.json | `Dockerfile.web:11-15` | SEDANG |
| ✓ | nginx `listen 80` tanpa TLS & tanpa rate limiting | `nginx.conf:23` | SEDANG* |
| ✓ | Versi pnpm & Node ter-hardcode di 2-3 tempat | `Dockerfile:7`, `Dockerfile.web:7` | SEDANG |
| ✓ | `auth-service` & `tenant-service` diberi `REDIS_URL` tapi tidak memakai redis | `docker-compose.yml:25, 46` | RENDAH |

\* naik jadi KRITIS kalau TLS **tidak** diterminasi di Cloudflare — butuh konfirmasi.

---

## H. Fitur berbayar tanpa jalan masuk

Semua ini ada di daftar `PLAN_FEATURES` dan dijual, tapi tidak bisa dipakai:

| V | Fitur | Bukti | Urgensi |
|---|---|---|---|
| · | **Tutup shift** — backend `PUT /pos/shifts/:id/close` ada, tidak ada UI | `pos-service:72`; tidak ada di `app/pos/page.tsx` | TINGGI |
| · | **Void transaksi** — backend `POST /pos/orders/:id/void` ada, tidak ada UI | `pos-service:211`; tidak ada di seluruh `app/` | TINGGI |
| · | **Split bill** — hanya kalkulator, tidak ada pembayaran terpisah ke backend (disclaimer-nya mengakui) | `pos-resto/page.tsx:441-489` | TINGGI |
| · | **Halaman POS Resto tidak ada di `nav-items.ts`** — 489 baris tanpa pintu masuk | `pos-resto/page.tsx:24` | TINGGI |
| · | **Halaman pin-login tidak tertaut dari mana pun** — 207 baris yatim, tetap terbuka ke publik | `pin-login/page.tsx:23-29` | TINGGI |
| · | **Redeem poin loyalty** — tidak ada UI tambah/tukar poin | `loyalty/page.tsx:43-161` | SEDANG |
| · | **Export laporan** — tombol "Export" tanpa `onClick` | `laporan/page.tsx:110-112` | TINGGI |
| · | **Kelola kategori** — hanya ada di setup wizard; setelah itu tidak bisa tambah/ubah/hapus selamanya | `menu/page.tsx:400-411` vs `setup/page.tsx:239` | TINGGI |
| · | **Aktifkan/nonaktifkan staf** — tombol toggle selalu memanggil `deactivate` | `pelanggan/page.tsx:99-102` vs `users.ts:61-67` | KRITIS |
| · | **Edit/hapus pelanggan** — `setEditing`/`setRemoving` tidak pernah dipanggil; dialog hapus = kode mati | `pelanggan/page.tsx:62-63, 240-277` | TINGGI |
| · | **Kurangi stok** — hanya restock, tidak ada koreksi turun | `inventory/page.tsx:105-171` | SEDANG |
| · | **Hapus bahan baku** — tidak ada aksinya | `bahan-baku/page.tsx:100-109` | SEDANG |
| · | **Toggle QRIS & notifikasi di Pengaturan** — murni state lokal, tidak pernah dikirim | `pengaturan/qris/page.tsx:13`, `notifikasi/page.tsx:19-23` | TINGGI |
| · | **Step "Cara Bayar" & "Cetak Struk" di wizard** — tidak menyimpan apa pun / dekoratif | `setup/page.tsx:419-472, 479-507` | TINGGI |
| · | **Broadcast WA** — dicatat terkirim padahal belum di-wire | `loyalty.ts:94-99` | SEDANG |
| ✓ | **Realtime `order.created`** — dideklarasikan backend & frontend, tidak pernah di-publish siapa pun | `shared/src/realtime.ts:8`, `hooks/useRealtimeEvents.ts:7` | TINGGI |
| · | **`stock_levels` tidak pernah dikurangi** di mana pun — hanya ditambah lewat restock | seluruh `inventory-service/src/index.ts` | KRITIS |
| · | **Status meja tidak pernah berubah otomatis** saat order masuk | `table-service:94-109` | TINGGI |
| · | Halaman detail cabang & Printer berisi placeholder | `cabang/[id]/page.tsx:43-50`, `pengaturan/printer/page.tsx:41-49` | SEDANG |

---

## I. tenant-app — halaman (app/)

### Koreksi premis
Hanya ada **7** pemanggilan `fetch()` mentah di `app/`, bukan 13, dan **semuanya menuju endpoint
tanpa auth** (login, forgot, reset, pin-login, menu publik, self-order). Tidak ada request
ber-token yang bypass `apiFetch`. Jadi risiko "token expired tidak ter-handle" **tidak berlaku**.
Masalah sebenarnya: base URL ditulis ulang 7× dalam 2 gaya, dan 3 tempat memanggil `res.json()`
sebelum cek `res.ok` sehingga respons non-JSON (502 HTML dari nginx) tampil sebagai error parse.
Usul: tambah `publicFetch()` di `lib/auth.ts` = `apiFetch` minus Authorization minus guard 401.

| V | Masalah | Lokasi | Urgensi |
|---|---|---|---|
| · | Tombol "Konfirmasi Bayar" tanpa state `submitting` → dobel-tap = 2 order tercatat (UUID baru tiap kali) | `pos/page.tsx:695-702`; sama di `pos-resto/page.tsx:434-436` | KRITIS |
| · | Saat submit gagal, banner error dirender **di belakang modal yang masih terbuka** → kasir tidak melihat apa-apa | `pos/page.tsx:211+244`; `pos-resto:190-192+210`; `order:113-115+150` | KRITIS |
| · | Self-order: pilih "QRIS" langsung menampilkan **struk lengkap** ("Kembalian Rp 0") padahal order `pending` dan tidak ada verifikasi bayar | `order/[qrToken]/page.tsx:111, 126-128, 381-444` | KRITIS |
| · | `setOutlets(res.data)` padahal `GET /tenants/branches` mengembalikan array telanjang → `outlets` undefined → `outlets.length` crash saat buka form "+ Kasir" | `pelanggan/page.tsx:85`, pecah di `:406` | KRITIS |
| · | Meja di-set `occupied` setelah order pertama, lalu `TablePicker` men-disable semua meja non-`available` → alur dine-in buntu | `pos-resto/page.tsx:61, 186` | KRITIS |
| · | Kiosk absen: siapa pun bisa pilih nama staf mana pun dan menekan Absen Masuk, tanpa PIN | `absensi/clock-in/page.tsx:83-101` | KRITIS |
| · | `/pos` hanya cek `getToken()`, tidak cek `setup_completed_at` → wizard bisa dilewati lewat URL | `setup/page.tsx` vs `pos/page.tsx:45-49` | TINGGI |
| · | `todayStr()` = `toISOString().slice(0,10)` (UTC) dipakai sebagai "hari ini" di 4+ halaman → jam 00:00-07:00 WIB menampilkan data kemarin | `dashboard:42-44`, `pelanggan:51-53`, `absensi:23-25`, `cabang:35-40` | TINGGI |
| · | `failed` dirender sebagai empty state → error jaringan tampil sebagai "belum ada data" | `inventory:25,41`, `laporan:96-103`, `dashboard:81-94` | TINGGI |
| · | Broadcast WA ke seluruh member tanpa dialog konfirmasi | `loyalty/page.tsx:221-239` | TINGGI |
| · | Approve/tolak transfer stok antar cabang tanpa konfirmasi | `cabang/transfer/page.tsx:90-93` | TINGGI |
| · | Leaderboard Top Member dihitung dari daftar yang sudah difilter pencarian | `loyalty/page.tsx:67, 108` | TINGGI |
| · | Tiket dapur dicocokkan ke meja lewat **string label**, bukan id → ganti nama meja memutus semua tiket | `waiter/page.tsx:44, 118` | TINGGI |
| · | Regex telepon `^08\d{2}-\d{4}-\d{4}$` memaksa tepat 12 digit (nomor Indonesia 10-13) | `pengaturan/profil/page.tsx:18-23` | TINGGI |
| · | Resep tidak memvalidasi `qty_used > 0` → HPP 0 → food cost & laba rugi salah | `bahan-baku/resep/page.tsx:144-160` | TINGGI |
| · | `removeMenu`/`toggleSoldOut`/`bump`/`markServed`/`removeCustomer` tanpa try/catch | `menu:69-81`, `dapur:161-167`, `waiter:141-152`, `pelanggan:94-107` | TINGGI |
| · | `Promise.all` tanpa `.catch` → unhandled rejection | `insight:35-47`, `setup:229-235` | TINGGI |
| · | Tiap `TicketCard` membuat `setInterval` 1 detik sendiri → 30 tiket = 30 interval/detik | `dapur/page.tsx:53-59` | SEDANG |
| · | Baris dinamis di-key pakai index array (variasi, resep, transfer) | `menu:667`, `resep:186`, `transfer:176` | SEDANG |
| · | `window.print()` mencetak sidebar/topbar; tidak ada `@media print` di globals.css | `laporan/resto:375` | SEDANG |
| · | `next.config.ts` rewrites dev tidak memuat `/api/v1/tables`, `/kitchen`, `/menus` → 5 halaman selalu gagal di dev tanpa nginx | `next.config.ts:15-22` | SEDANG |
| · | Tidak ada `middleware.ts`; proteksi route murni client-side | (tidak ada file) | SEDANG |

**Duplikasi antar-halaman** (kandidat ekstraksi Fase 3):

| Pola | Salinan |
|---|---|
| `CategoryChip` identik | pos:397-410 · pos-resto:295-301 · order:200-211 |
| `MenuCard` identik | pos:412-457 · pos-resto:303-326 · order:213-241 |
| `VariantModal` identik | pos:461-560 · pos-resto:328-376 · order:243-311 |
| `PaymentModal` + `cashSuggestions` | pos:565-705 · pos-resto:378-439 |
| Handler keranjang (`addLine`/`changeQty`/`subtotal`) | pos:87-134 · pos-resto:131-159 · order:70-88 |
| `Promise.all` katalog | pos:50-57 · pos-resto:100-106 · menu:42-47 |
| Pola `useState<T\|null>` + `failed` + Skeleton + EmptyState | 10 halaman, 4× di laporan/resto saja |
| `todayStr()` berbasis `toISOString()` | 4 halaman |
| `Rp ${n.toLocaleString('id-ID')}` alih-alih `formatRupiah` | 5 tempat |

---

## J. tenant-app — design system (components/, lib/)

| V | Masalah | Lokasi | Urgensi |
|---|---|---|---|
| ✓ | **0 dari 53 komponen** memakai utility token (`bg-surface`); 100% memakai `[var(--…)]`. Blok `@theme inline` adalah kode mati kecuali `--font-serif` | `app/globals.css:24-38` | TINGGI |
| · | Tidak ada token spacing / radius / shadow / typography / state / semantic-color sama sekali | `app/globals.css` | TINGGI |
| · | Badge memakai hex hardcoded di luar sistem token | `components/ui/badge.tsx:11-13` | TINGGI |
| · | Tiga definisi "merah bahaya" berbeda (button-variants `red-500`, badge hex, meja/types `red-600`) | — | TINGGI |
| · | Warna semantik mentah tersebar di 20+ titik non-ui; `dapur/page.tsx` seluruh paletnya hardcoded | 11 halaman + 12 komponen | TINGGI |
| · | `Field` merender `<Label>` sebagai sibling tanpa `htmlFor`/`id`; **nol `htmlFor` & nol `useId`** di seluruh app — 58 `<Input>` tanpa label terhubung | `components/ui/field.tsx:4-11` | TINGGI |
| · | `Sidebar` memanggil `hasFeature()` **tanpa** overrides, `PlanGate` **dengan** → menu bergembok padahal halaman terbuka | `Sidebar.tsx:24` vs `PlanGate.tsx:14` | TINGGI |
| · | Tombol "Upgrade Sekarang" di layar paywall tidak punya onClick/href | `TrialExpiredOverlay.tsx:19` | TINGGI |
| · | `TrialExpiredOverlay` bukan focus trap — konten di belakangnya tetap tab-able | `TrialExpiredOverlay.tsx:13` | TINGGI |
| · | Nomor WA admin masih placeholder `6281234567890` dengan TODO, di 2 file | `TrialExpiredOverlay.tsx:6`, `UpgradeBanner.tsx:4` | TINGGI |
| · | `rangeForPeriod('monthly')` = 30 hari mundur, bukan bulan kalender | `insight/DateRangePicker.tsx:19-26` | TINGGI |
| · | `getTrialState` tidak menangani `suspended`/`expired` — keduanya jatuh ke `PRODUCTION` | `lib/trial.ts:12` | TINGGI |
| · | `printReceipt`/`printQr` gagal diam-diam kalau popup diblokir | `lib/receipt.ts:105-106` | TINGGI |
| ✓ | JWT dikirim lewat query string WebSocket → masuk access log | `hooks/useRealtimeEvents.ts:31` | TINGGI |
| · | 13 tipe API didefinisikan ulang manual di frontend tanpa sumber tunggal | `lib/types.ts`, `meja/types.ts`, dll | TINGGI |
| · | Dark mode identik byte-per-byte dengan light — ±125 baris menghasilkan nol perubahan visual, toggle tampil di 5 halaman | `globals.css:41-67`, `lib/theme.ts`, `ThemeToggle.tsx` | SEDANG |
| · | Radius (4 nilai), shadow (5 tingkat), tinggi kontrol (h-7/9/10/11/14) tidak konsisten | seluruh `components/ui` | SEDANG |
| · | `size: 'icon'` CVA nol pemakaian; 12+ tombol icon ditulis manual dengan ukuran beda | `button-variants.ts:17` | SEDANG |
| · | `modal.tsx` (dipakai 18×) menutup akses ke `DialogDescription`/`DialogFooter`; Radix warning tiap modal dibuka | `components/ui/modal.tsx:1-28` | SEDANG |
| · | Tidak ada Spinner/StatCard/FormError/Pagination/SegmentedControl padahal polanya diulang 4-28× | — | SEDANG |
| · | Token di `localStorage` (admin-app justru menyimpan di memori) | `lib/auth.ts:2, 10` | SEDANG |
| ✓ | **`PLAN_FEATURES` frontend vs backend: sinkron 100% hari ini** — risikonya struktural, bukan aktif | `lib/plan-features.ts` vs `feature-gate.ts` | TINGGI |

---

## K. admin-app

| V | Masalah | Lokasi | Urgensi |
|---|---|---|---|
| ✓ | `queryKey` tidak memuat `search`/`sort` sementara server sudah paginasi 20 baris, lalu pencarian & sort dijalankan klien atas 20 baris itu | `tenants/page.tsx:518, 536-544` (sama di leads, licenses) | KRITIS |
| ✓ | `useSelection(items)` tidak pernah reset saat `items` berganti, dan `toggleAll()` memilih daftar **belum difilter** padahal tabel merender yang sudah difilter | `lib/use-selection.ts:5, 16` + `tenants/page.tsx:524` | KRITIS |
| ✓ | `apiFetch` tidak menangani 401 — tidak clear token, tidak redirect (tenant-app justru sudah benar) | `lib/api.ts:37-39` | KRITIS |
| · | Tidak ada refresh token saat kedaluwarsa di tengah sesi | `layout.tsx:25-36` | KRITIS |
| ✓ | StatCard "Aktif/Trial/Suspend" dihitung dari satu halaman (20 baris), bukan agregat server | `tenants/page.tsx:526-534` | TINGGI |
| ✓ | Export CSV diam-diam hanya mengekspor halaman aktif | `tenants/page.tsx:550-555` | TINGGI |
| ✓ | `middleware.ts` tidak melindungi apa pun — kedua cabang `NextResponse.next()`, tapi matcher tetap jalan tiap request | `middleware.ts:4-11` | TINGGI |
| · | `logout()` hanya hapus state Zustand — cookie refresh tetap valid, buka `/` langsung masuk lagi | `lib/store.ts:14` | TINGGI |
| · | Semua `useQuery` mengabaikan `isError` → gagal fetch tampil sebagai "Belum ada data" | 5 halaman | TINGGI |
| · | Label add-on `advanced_report` tertulis "Food Cost / HPP Otomatis" padahal key-nya beda | `tenants/page.tsx:216` | TINGGI |
| · | Generate ulang lisensi tanpa konfirmasi — satu klik membatalkan kunci pelanggan | `licenses/page.tsx:120-127` | TINGGI |
| · | Nonaktifkan admin (termasuk diri sendiri) tanpa konfirmasi | `admins/page.tsx:136-144` | TINGGI |
| · | `relativeDate()` hitung manual dari selisih 24 jam, bukan batas kalender | `lib/format-date.ts:1-7` | SEDANG |
| · | Duplikasi internal: sort comparator 3×, `toggleSort` 3×, bulk-delete 6 fungsi, `act()` 4×, toolbar 3×, card mobile 4× | — | SEDANG |
| · | `react-hook-form` + `zod` terpasang, nol import | `package.json:24, 27` | RENDAH |

---

## L. tenant-service — selain eskalasi role

| V | Masalah | Lokasi | Urgensi |
|---|---|---|---|
| ✓ | `reset-tenant.ts` menghapus tenant + seluruh data turunannya hanya bermodal argumen id: tanpa konfirmasi, tanpa cek `NODE_ENV`, tanpa dry-run | `scripts/reset-tenant.ts:9-28` | KRITIS |
| · | `POST /admin/tenants` tidak pernah set `owner_id` → kolom email selalu null & reset-owner-password selalu 404 | `routes/admin/tenants.ts:80-99` | KRITIS |
| · | Create tenant tanpa transaksi → tenant yatim tanpa owner kalau insert user gagal | `routes/admin/tenants.ts:80-99` | KRITIS |
| · | Status `suspended`/`expired` & `trial_ends_at` **tidak pernah dicek di jalur runtime mana pun** — suspend praktis kosmetik | `middleware/admin-guard.ts:20-26` | TINGGI |
| · | `page`/`limit` di-`parseInt` tanpa clamp di 4 endpoint list | `tenants.ts:32-34`, `offline.ts:27-29`, `leads.ts:11-15`, `audit.ts:9-10` | TINGGI |
| · | `activate`/`suspend`/`unsuspend`/`change-plan` balas `{ok:true}` walau id tidak ada | `tenants.ts:151-204` | TINGGI |
| · | `suspend` menimpa `tenants.notes` dengan alasan suspend | `tenants.ts:162` | TINGGI |
| · | `clock-in` memakai `user_id` dari body tanpa verifikasi milik tenant | `routes/tenant/attendance.ts:28-46` | TINGGI |
| · | `points/earn` menulis log sebelum memverifikasi member milik tenant | `routes/tenant/loyalty.ts:54-59` | TINGGI |
| · | `points/redeem` update saldo tanpa filter `tenant_id`, tanpa transaksi | `routes/tenant/loyalty.ts:68-77` | TINGGI |
| · | `POST /transfers` tidak verifikasi outlet milik tenant | `routes/tenant/branches.ts:69-81` | TINGGI |
| · | Seed script memakai password hardcoded (`Demo1234!`) tanpa pengaman DATABASE_URL produksi | `seed-demo.ts:15-16` | TINGGI |
| · | `tsconfig` meng-include `src/scripts/*` → `dist/scripts/reset-tenant.js` ikut ke image produksi | `tsconfig.json:4` + `Dockerfile:38-41` | TINGGI |
| · | `error.message` mentah dikirim ke klien (nama constraint/kolom Postgres bocor) | `src/index.ts:59-62` | SEDANG |
| · | Trio soft-delete/restore/bulk-delete diduplikasi hampir identik di 3 file (~120 baris) | `tenants.ts:229-289`, `leads.ts:44-95`, `offline.ts:88-153` | SEDANG |
| · | `billing.ts` tanpa audit/paginasi/404 dan tidak dipanggil frontend mana pun | `routes/admin/billing.ts:8-41` | SEDANG |
| · | `GET /customers/:id/detail` N+1 (10 order → 10 query item) | `routes/tenant/customers.ts:93-105` | SEDANG |

**Positif dari matriks otorisasi:** seluruh **45 route** di `routes/admin/*` benar-benar melewati
guard, 14 di antaranya `superAdminGuard`. Tidak ada satu pun yang lolos tanpa penjaga.

---

## M. Service lain

### catalog-service
| V | Masalah | Lokasi | Urgensi |
|---|---|---|---|
| · | Menu publik tidak mengecek fitur `qr_self_order` (pos-service mengecek) | `index.ts:241-262` | TINGGI |
| · | Menu publik = 5 full-table query per pemindaian, tanpa cache/limit/rate limit | `index.ts:246-252` | TINGGI |
| · | Tidak ada cek role: kasir bisa ubah harga & hapus menu | `index.ts:58, 101, 107, 118, 192, 208` | TINGGI |
| · | `variant-groups` delete+insert tanpa transaksi; `group_ids` tidak diverifikasi milik tenant | `index.ts:201-204, 230-235` | TINGGI |
| · | `file.mimetype` dipercaya mentah, isi file tidak diperiksa | `index.ts:145-149` | SEDANG |
| · | `categories.is_active` dipakai memfilter tapi tidak ada route untuk mengubahnya | `index.ts:49-52` vs `:248` | SEDANG |

### inventory-service
| V | Masalah | Lokasi | Urgensi |
|---|---|---|---|
| · | `stock_levels` **tidak pernah dikurangi di mana pun** | seluruh `index.ts` | KRITIS |
| · | Jalur INTERNAL_API_KEY memakai `tenant_id!` padahal skema menandainya `optional()` | `index.ts:210-223` | KRITIS |
| · | Loop pengurangan stok bahan baku tanpa transaksi | `index.ts:239-243` | KRITIS |
| · | `deduct-for-order` tanpa kunci idempotensi → retry = stok dipotong dua kali | `index.ts:210-246` | TINGGI |
| · | Restock read-modify-write (baris 93) padahal baris 160 sudah benar pakai ekspresi SQL | `index.ts:93` | TINGGI |
| · | Kasir mana pun bisa memanggil `deduct-for-order` dengan menu & qty sembarang | `index.ts:215-218` | TINGGI |

### table-service
| V | Masalah | Lokasi | Urgensi |
|---|---|---|---|
| · | `qr_token` permanen — tanpa rotasi, kedaluwarsa, atau pengikatan sesi | `index.ts:61, 148` | TINGGI |
| · | Tidak ada cek role: kasir bisa DELETE meja (= mematikan semua QR tercetak) | `index.ts:82-91` | TINGGI |
| · | Update posisi bulk dalam loop tanpa transaksi | `index.ts:120-124` | TINGGI |
| · | `publishTenantEvent` tanpa try/catch → Redis mati = 500 padahal DB sudah berubah | `index.ts:106` | SEDANG |

### report-service
| V | Masalah | Lokasi | Urgensi |
|---|---|---|---|
| · | `requireAuth` tanpa `return reply` di hook async (pola benar ada di `admin-guard.ts:7`) | `index.ts:23-29` | TINGGI |
| · | `/timeseries` & `/pnl` menarik semua baris ke memori lalu agregasi di JS | `index.ts:212-243, 323-336` | TINGGI |
| · | Skema zod `from/to` + `parseRange` diulang di 8 handler | `index.ts` | SEDANG |
| · | **SQL injection: tidak ditemukan** — granularity di-enum, limit di-clamp, from/to di-regex | — | — |

### notification-service
| V | Masalah | Lokasi | Urgensi |
|---|---|---|---|
| · | `/notify/send` menerima `to` arbitrer tanpa allowlist, rate limit, atau log pengiriman | `routes/send.ts:37-60` | TINGGI |
| · | `requireInternalAuth` tanpa `return reply` di hook async | `src/index.ts:16-25` | TINGGI |
| · | `renderTemplate` menyisipkan `vars` ke HTML email tanpa escaping | `src/email.ts:24-26` | SEDANG |
| ✓ | `@fastify/jwt ^8` terdaftar tapi **tidak pernah di-import** — skew versi tidak berdampak perilaku, cukup hapus dependensinya | `package.json:13` | RENDAH |

### websocket-gateway
| V | Masalah | Lokasi | Urgensi |
|---|---|---|---|
| · | `socket.send()` tanpa cek `readyState`/try-catch → satu socket error = seluruh gateway mati | `src/index.ts:46-51` | TINGGI |
| · | Tidak ada handler `socket.on('error')` | `src/index.ts:37-39` | TINGGI |
| ✓ | Token JWT lewat query string `?token=` → masuk access log nginx | `src/index.ts:25-28` | TINGGI |
| · | **Isolasi lintas-tenant: aman** — routing murni per channel `tenant:<id>:events` | — | — |

### packages/shared
| V | Masalah | Lokasi | Urgensi |
|---|---|---|---|
| · | `new Pool()` tanpa listener `'error'` → error koneksi idle = proses mati | `src/db.ts:6` | KRITIS |
| · | `new Redis()` tanpa listener `'error'` | `src/redis.ts:4` | TINGGI |
| · | `PLAN_FEATURES[plan] ?? false` menelan plan tak dikenal tanpa log | `src/feature-gate.ts:53` | TINGGI |
| · | `index.ts` re-export `db`/`redis`/`r2` sekaligus → import apa pun menarik `pg`+`ioredis`+`aws-sdk`; ini yang memaksa frontend menyalin `PLAN_FEATURES` | `src/index.ts:1-7` | SEDANG |
| · | `JwtPayload`/`ApiError`/`UserRole` diekspor tapi tidak pernah diimpor; route auth pakai `as any` | `src/types.ts:5-18` | SEDANG |
| · | `logAdminAction` tanpa try/catch dan di luar transaksi pemanggil | `src/audit.ts:16-27` | SEDANG |

---

## N. Duplikasi lintas-service (kandidat refactor utama)

| Blok | Muncul di | × |
|---|---|---|
| Bootstrap Fastify + cors + jwt (`JWT_PUBLIC_KEY.replace`) | 10 service | 10 |
| `setErrorHandler` identik 100% | 10 service | 10 |
| `const db = createDb(DATABASE_URL!)` | 10 service | 10 |
| `app.get('/health', …)` | 10 service | 10 |
| `parseInt(PORT) + app.listen` | 10 service | 10 |
| `requireAuth` identik 100% | pos, catalog, inventory, kitchen, table, report | 6 |
| Accessor `jwtUser`/`tenantId` dengan cast `as unknown as` | 5 service | 5 |
| `const [row] = await db.update(…).returning(); if (!row) 404` | 5 service | 11 |
| `requireStaffOrInternal` identik termasuk komentarnya | inventory, kitchen | 2 |
| Wrapper "best-effort notify" | pos-service internal | 5 |

**Komponen UI:** `button`, `input`, `password-input`, `textarea`, dan `lib/utils.ts` **identik
byte-per-byte** antara admin-app & tenant-app. Delapan komponen lain beda — `badge` paling
bermasalah (API bentrok: `tone` vs `variant`, tenant pakai hex mentah).

**Blocker paket UI bersama:** admin-app React 18 vs tenant-app React 19; nama token sama tapi
nilai beda (`--primary` oranye vs maroon — ini justru keuntungan kalau nama token dibekukan dulu).

---

## O. Runbook migrasi 0017 & 0018 — index dan constraint baru

Ditulis setelah Modul 1 (index + constraint) selesai diimplementasi dan direview kode-nya, tapi
**belum pernah dijalankan sekali pun terhadap Postgres asli** — tidak ada Postgres hidup di mesin
pengembangan ini, dan Docker mati saat catatan ini ditulis. Dedupe DELETE di 0018 sudah diverifikasi
benar secara statis (kasus 1/2/3 baris per key, NULL-safe, tie-safe, urutan sebelum DDL constraint,
dan diff snapshot 37 tabel bersih), tapi "benar secara statis" bukan pengganti "pernah jalan". Bagian
ini adalah prosedur yang wajib diikuti sebelum `pnpm db:migrate` disentuhkan ke database produksi.

### O.1 Status keputusan `CONCURRENTLY` (Task 3 Step 9)

Task 3 Step 9 di plan mensyaratkan: kalau produksi sudah punya data, dua index di tabel besar
(`pos_orders`, `pos_order_items`) harus dibuat manual dengan `CREATE INDEX CONCURRENTLY` di luar
`pnpm db:migrate`, karena `drizzle-kit migrate` membungkus **seluruh isi satu file migrasi** dalam
satu transaksi — dan `CREATE INDEX CONCURRENTLY` tidak bisa jalan di dalam transaksi sama sekali,
jadi opsi itu bukan "tambahkan kata CONCURRENTLY ke file yang sudah digenerate", melainkan
"jalankan statement itu terpisah, di luar migrasi".

Status sebenarnya: **langkah ini belum pernah dieksekusi maupun diputuskan secara eksplisit.**
`0017_narrow_salo.sql` saat ini berisi 39 `CREATE INDEX IF NOT EXISTS` biasa (bukan `CONCURRENTLY`),
termasuk dua index di atas, dan tidak ada catatan di commit maupun di sini bahwa "produksi masih
kosong" pernah diverifikasi. Jangan anggap itu berarti aman.

Efek nyatanya kalau `0017_narrow_salo.sql` dijalankan apa adanya lewat `pnpm db:migrate` terhadap
database berisi data: drizzle membangun ke-39 index dalam satu transaksi, memegang `SHARE` lock di
setiap tabel yang disentuh **selama seluruh migrasi berjalan** — bukan cuma selama index tabel itu
sendiri dibangun. Karena `pos_orders` dan `pos_order_items` termasuk di antara 39 tabel itu dan
kemungkinan besar tabel terbesar, setiap `INSERT`/`UPDATE` kasir ke kedua tabel itu (order baru,
tutup shift, void) akan **memblokir** sampai seluruh migrasi selesai, bukan cuma sampai index
tabel itu sendiri selesai.

**Keputusan operasional untuk migrasi berikutnya:**
- Kalau tabel `pos_orders` / `pos_order_items` di database target masih kosong atau kecil (baru
  demo/staging): jalankan `0017_narrow_salo.sql` apa adanya lewat `pnpm db:migrate` — lock share
  sesaat pada tabel kosong tidak berdampak.
- Kalau sudah ada data produksi yang berarti (traffic kasir nyata): **jangan** jalankan
  `0017_narrow_salo.sql` apa adanya. Hapus dua statement index `pos_orders_tenant_id_created_at_idx`
  dan `pos_order_items_order_id_idx` dari eksekusi `db:migrate` (jalankan sisanya seperti biasa),
  lalu bangun keduanya manual, di luar transaksi migrasi:

```sql
CREATE INDEX CONCURRENTLY IF NOT EXISTS pos_orders_tenant_id_created_at_idx
  ON "inspirapos_v2"."pos_orders" (tenant_id, created_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS pos_order_items_order_id_idx
  ON "inspirapos_v2"."pos_order_items" (order_id);
```

  Jalankan keduanya lewat `psql` langsung (mis. `psql "$DATABASE_URL" -c "..."`), satu statement per
  koneksi, di luar jam sibuk. `CREATE INDEX CONCURRENTLY` tidak butuh lock eksklusif tapi butuh dua
  scan tabel penuh dan bisa lebih lambat — itu memang harga dari "tidak memblokir kasir".

### O.2 Backup sebelum 0018

`0018_thick_wendell_rand.sql` menghapus baris (dedupe) sebelum menambahkan constraint. Wajib backup
dua tabel yang terdampak sebelum menjalankannya, terlepas dari seberapa yakin dedupe-nya sudah benar:

```bash
pg_dump "$DATABASE_URL" \
  --table='inspirapos_v2.menu_variant_groups' \
  --table='inspirapos_v2.attendance_logs' \
  --data-only --format=custom \
  --file="backup-pre-0018-$(date +%Y%m%d%H%M%S).dump"
```

Restore (kalau perlu dibatalkan): `pg_restore --data-only --clean -d "$DATABASE_URL" <file>.dump`.

### O.3 Count-first — jalankan SELECT sebelum DELETE

Sebelum menjalankan `0018_thick_wendell_rand.sql`, jalankan versi `SELECT count(*)` dari kedua
`DELETE` di migrasi itu (predikat ditranskripsi apa adanya dari file, tidak ditulis ulang) dan
periksa angkanya masuk akal (mis. tidak mendekati 100% dari total baris tabel) sebelum lanjut.

**Untuk `menu_variant_groups`** — DELETE aslinya pakai `USING` (self-join): tiap baris yang punya
pasangan duplikat dengan `ctid` lebih kecil ikut terhapus. **Meniru join itu apa adanya di
`SELECT count(*)` salah** untuk grup berisi 3 baris atau lebih — join menghitung *pasangan*
(`a`×`b` yang cocok), bukan *baris*. Untuk grup ber-n baris duplikat, jumlah pasangan adalah
`n(n-1)/2`, sedangkan DELETE hanya menghapus `n-1` baris (semua kecuali satu yang `ctid`-nya
terkecil). Keduanya kebetulan sama untuk grup 2 baris (`1` pasangan = `1` baris dihapus), tapi
untuk grup 3 baris — kasus yang disebut eksplisit di komentar migrasi sebagai sudah diverifikasi
benar — versi join melaporkan `3` padahal yang benar-benar terhapus cuma `2`. Preflight yang
melebih-lebihkan angka DELETE lebih berbahaya daripada tidak ada preflight sama sekali, karena
operator jadi percaya pada angka yang salah.

Versi yang benar tidak meniru join-nya, melainkan menghitung langsung selisih "total baris" minus
"jumlah kombinasi `(menu_id, variant_group_id)` yang unik" — DELETE menyisakan tepat satu baris per
kombinasi, jadi selisih itu sama dengan jumlah baris yang dihapus, untuk ukuran grup berapa pun:

```sql
SELECT count(*) - count(DISTINCT (menu_id, variant_group_id))
  FROM "inspirapos_v2"."menu_variant_groups";
```

**Untuk `attendance_logs`** — predikat `WHERE` disalin langsung dari `DELETE`:

```sql
SELECT count(*) FROM "inspirapos_v2"."attendance_logs"
  WHERE id NOT IN (
    SELECT DISTINCT ON (tenant_id, user_id, date) id
      FROM "inspirapos_v2"."attendance_logs"
      ORDER BY tenant_id, user_id, date,
               clock_out_at DESC NULLS LAST,
               clock_in_at DESC NULLS LAST
  );
```

Bandingkan hasil kedua `count(*)` itu dengan `SELECT count(*) FROM "inspirapos_v2"."menu_variant_groups"`
dan `SELECT count(*) FROM "inspirapos_v2"."attendance_logs"` masing-masing — kalau angka yang akan
dihapus mendekati total baris, **berhenti dan investigasi dulu**, jangan lanjut ke DELETE.

### O.4 Rehearsal wajib di restore, bukan langsung produksi

Sebelum `0017_narrow_salo.sql` dan `0018_thick_wendell_rand.sql` dijalankan terhadap database
produksi asli:

1. Restore dump produksi terbaru ke instance Postgres terpisah (staging/lokal).
2. Jalankan `pnpm db:migrate` (atau urutan manual dari O.1 kalau `CONCURRENTLY` dipakai) end-to-end
   terhadap restore itu — kedua file migrasi, bukan cuma salah satu.
3. Verifikasi: aplikasi masih bisa baca/tulis `menu_variant_groups` dan `attendance_logs` setelah
   migrasi, angka baris yang terhapus di O.3 cocok dengan yang benar-benar terhapus, dan tidak ada
   error constraint saat aplikasi mencoba insert data yang sebelumnya duplikat.
4. Baru setelah rehearsal ini bersih, jalankan urutan yang sama terhadap produksi.

### O.5 Pernyataan status

Sampai titik ini di branch, dedupe DELETE di `0018_thick_wendell_rand.sql` **belum pernah
dieksekusi terhadap Postgres asli** — hanya dibaca dan diverifikasi secara statis. Langkah O.2–O.4
di atas bukan formalitas; itu adalah pertama kalinya SQL ini akan benar-benar menyentuh baris data.

---

## Yang sudah baik — jangan diubah

1. **`password_reset_tokens` menyimpan hash**, dengan `expires_at` + `used_at`, dan
   forgot-password selalu balas `{ok:true}` untuk mencegah enumerasi akun.
2. **Matriks otorisasi `routes/admin/*` rapi** — 45 route semuanya berpenjaga, aksi paling
   merusak konsisten di `superAdminGuard`, plus konfirmasi ketik-ulang-slug.
3. **Self-order menghitung ulang harga & varian server-side**, tidak mempercayai klien publik
   (`pos-service:277-317`) — trust boundary yang benar.
4. **`qr_token` 96-bit acak** (`randomBytes(12)`) — tidak bisa dienumerasi.
5. **`confirm-delete-menu.tsx` beserta komentarnya** memuat solusi jebakan unmount Radix.
6. **`lib/format.ts` memakai `Intl.NumberFormat('id-ID')`**; `useRealtimeEvents` cleanup lengkap
   dengan backoff; tombol icon-only konsisten punya `aria-label`; semua modal lewat Radix Dialog.
7. **`PlanGate` menampilkan fitur terkunci alih-alih menyembunyikan** — keputusan produk yang
   benar (PRD §2.4), dipakai konsisten di 12 halaman.
8. **Migrasi 0003 memindahkan data sebelum `DROP COLUMN`** — contoh migrasi data yang benar.
9. **Tidak ada SQL injection** di report-service; **isolasi tenant di websocket-gateway aman**.
10. Komentar menjelaskan *kenapa*, bukan *apa*. Pertahankan saat refactor.

## Perubahan kontrak API dari Fase 3

- `GET /api/v1/auth/pin-login/staff` — sekarang butuh `Authorization: Bearer <jwt>`
  dan TIDAK lagi menerima `?tenant_id=`. Frontend: `apps/tenant-app/app/pin-login/page.tsx:45`
  harus mengirim token dari `getToken()` dan berhenti membaca `tenant_id` dari query.
  Dikerjakan di Modul 6.

- `POST /api/v1/auth/login` dan `POST /api/v1/auth/refresh` sekarang bisa membalas `403`
  dengan `code: TENANT_SUSPENDED` / `TENANT_EXPIRED` / `TENANT_DELETED` kalau tenant
  pengguna berstatus tidak aktif. Frontend belum menangani status ini secara khusus
  (lihat `apps/tenant-app/lib/trial.ts:12`, yang cuma membedakan `trial` vs `PRODUCTION`
  dan tidak punya state untuk suspended/expired) — butuh layar tersendiri. Dikerjakan di
  Modul 6.

- Route impersonate (`POST .../impersonate`) pindah dari `/api/v1/admin/tenants/:id/impersonate`
  ke `/api/v1/auth/admin/tenants/:id/impersonate` (memperbaiki routing nginx yang sebelumnya
  membuatnya 404 di produksi). Tidak ada klien yang memanggilnya hari ini — dicatat supaya
  siapa pun yang mewire admin-app ke fitur ini nanti memakai URL yang benar.
