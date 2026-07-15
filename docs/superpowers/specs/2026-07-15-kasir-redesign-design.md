# Kasir (POS) Redesign — Design Spec

## Context

Halaman `app/pos/page.tsx` (tenant-app) adalah layar transaksi utama kasir — split-panel (grid menu 60% + cart 40%) yang sudah berfungsi tapi punya beberapa gap UX yang membuatnya kurang cepat dipakai di lapangan:

- Tombol qty +/- di cart cuma 36px (`h-9 w-9`), di bawah standar sentuh 44px
- Tidak ada cara cepat hapus item selain menekan tombol `-` berulang sampai qty 0
- Tidak ada UI untuk mengisi catatan per item cart (field `notes` sudah ada di tipe `CartLine`, tapi tidak ada input untuk mengisinya)
- Info pelanggan (nama+HP) hanya lewat modal `CustomerPicker` yang mengutamakan search — lambat untuk kasus umum (pelanggan baru/sekali beli)
- Tidak ada konsep "no meja" — meski kolom `table_number` sudah ada di skema `pos_orders` (belum dipakai frontend)
- Tidak ada motion sama sekali — semua transisi (buka modal, ubah qty, hapus item) instan tanpa feedback visual

Redesign ini scope-nya murni frontend `app/pos/page.tsx` dan pendukungnya — backend `table_number` sudah tersedia di skema, tinggal dikirim dari frontend.

## Keputusan Desain

**"No Meja"**: field teks bebas (bukan floor map/table management — itu scope tier Resto, di luar cakupan UMKM). Diketik manual oleh kasir, opsional, dikirim sebagai `table_number` ke `POST /api/v1/pos/orders`.

**Catatan**: per item cart saja (bukan catatan umum per order). Menggunakan field `notes` yang sudah ada di `CartLine`.

**Info pelanggan**: pertahankan alur modal `CustomerPicker` yang ada (search + histori berguna untuk pelanggan berulang), tapi tambahkan jalur cepat: popover quick-add (nama+HP, tanpa search dulu) untuk kasus umum, dengan link kecil "Cari pelanggan lain" sebagai fallback ke modal search penuh.

**Qty & hapus**: perbesar tombol qty ke ≥44px, tambah tombol hapus terpisah (ikon trash) di tiap baris cart, plus swipe-to-delete sebagai alternatif cepat.

**Motion** (framer-motion, 4 titik prioritas):
1. Item baru masuk cart: `initial={{opacity:0, x:20}}` → `animate={{opacity:1, x:0}}`, ease-out ~200ms
2. Qty berubah: micro-scale pulse pada angka (`scale: 1 → 1.15 → 1`) tiap tap +/-
3. Swipe-to-delete: `drag="x"` dengan spring physics, latar merah muncul progresif melewati threshold 50%, snap-back kalau tidak sampai
4. Transisi antar step modal (variant picker → payment → sukses): `AnimatePresence` crossfade+slide, bukan muncul/hilang instan

Semua motion menghormati `prefers-reduced-motion` (fallback ke crossfade instan atau tanpa animasi).

## Komponen Baru

- `TableNumberField` — input teks inline di header panel cart, state lokal, dikirim sebagai `table_number` saat submit order.
- `CustomerQuickAdd` (Radix Popover) — 2 field (nama, HP), tombol simpan → create customer via `POST /api/v1/tenants/customers` (endpoint sudah ada, dipakai `CustomerPicker` juga) lalu set sebagai customer terpilih. Link "Cari pelanggan lain" membuka `CustomerPicker` modal existing.
- `ItemNoteEditor` — Radix Popover (breakpoint `md:`/`landscape:`) atau `Sheet` (mobile-portrait), textarea 2-3 baris, `onSave` menulis ke `cart[lineId].notes`.
- `SwipeableCartRow` — wrapper framer-motion `drag="x"` di sekeliling baris cart existing, `dragConstraints={{left: -80, right: 0}}`, threshold trigger hapus.
- `QtyStepper` — refactor tombol +/- existing jadi komponen terpisah, ukuran `h-11 w-11` (44px), plus tombol hapus (ikon `Trash2` dari lucide-react) di ujung kanan baris.

## Perubahan Data

`app/pos/page.tsx` `submitOrder()`: tambah parameter `tableNumber: string | null`, masukkan ke payload `POST /api/v1/pos/orders` sebagai `table_number`. Backend sudah punya kolom ini di `pos_orders` (dikonfirmasi di `packages/drizzle-schema/src/pos.ts:35`) — kemungkinan endpoint POS-service perlu dicek apakah sudah menerima field ini di request body (bukan hanya di skema DB); jika belum, tambahkan satu field ke handler create-order.

## Dependency Baru

`framer-motion` (belum ada di `tenant-app/package.json`) — install sebagai dependency baru. Radix primitives yang dipakai (`Popover`) belum ada juga (`@radix-ui/react-popover`), perlu ditambahkan mengikuti pola wrapper existing (`dialog.tsx`, `sheet.tsx`).

## Verifikasi

- Buka `/pos`, tambah beberapa item ke cart — cek animasi slide+fade muncul saat item baru masuk.
- Tap qty +/- — cek ukuran tombol ≥44px dan micro-bounce pada angka.
- Swipe baris cart ke kiri — cek snap-back kalau tidak sampai threshold, terhapus kalau melewati.
- Isi catatan di satu item — cek popover di tablet-landscape, sheet di mobile-portrait; catatan tersimpan dan tampil di ringkasan cart.
- Isi No Meja + quick-add pelanggan baru — submit order — cek payload API menyertakan `table_number` dan `customer_id` yang baru dibuat.
- Test di lebar 375px (mobile), 834px landscape (tablet), 1280px (desktop).
