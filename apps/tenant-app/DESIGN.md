---
name: Inspira POS Cloud — tenant-app
description: Dashboard toko UMKM/kafe hangat dan mudah disentuh, warisan brand maroon/gold Inspira POS
colors:
  maroon-deep: "#6e150f"
  maroon-vibrant: "#b92a1c"
  gold-antique: "#d0a139"
  cream: "#f5efe6"
  surface-white: "#ffffff"
  charcoal: "#1a1a1a"
  muted-brown: "#8a7a6e"
  border-cream: "#e6ddcf"
  status-trial-gold: "#d0a139"
  status-active-green: "#5fa876"
typography:
  display:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "normal"
  title:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "system-ui, -apple-system, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.02em"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.maroon-deep}"
    textColor: "{colors.surface-white}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.maroon-deep}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.charcoal}"
    rounded: "{rounded.md}"
  card:
    backgroundColor: "{colors.surface-white}"
    rounded: "{rounded.lg}"
    padding: "16px"
---

# Design System: Inspira POS Cloud — tenant-app

## 1. Overview

**Creative North Star: "Warung Digital"**

tenant-app adalah toko fisik yang berpindah ke layar — bukan software korporat berbaju "dashboard SaaS". Setiap kartu, tombol, dan badge harus terasa seperti perlengkapan warung yang sudah dikenal: hangat, langsung, tanpa basa-basi teknis. Warna default mewarisi identitas Inspira POS (maroon tua, emas antik, krem) yang sama dipakai di ipos-offline, tapi di sini owner bisa mengganti warna utama toko dari 9 preset — sistem harus tetap terasa "milik toko itu sendiri" di warna manapun, bukan cuma bagus di maroon.

Ini secara sengaja BUKAN admin-app (dashboard internal InspiraLabs berpalet coral/teal, font Sora+Figtree) — tenant-app menolak nuansa "tools staf internal" itu. Kepadatan informasi boleh tinggi (tabel, laporan, banyak angka), tapi selalu dibungkus dengan kehangatan: bahasa Indonesia sehari-hari, bukan istilah sistem.

**Key Characteristics:**
- Krem + putih dominan; maroon (atau warna pilihan owner) hanya untuk aksi utama dan status aktif
- Radius besar dan konsisten (12-16px) — tidak ada sudut tajam
- Shadow tipis untuk memisahkan kartu dari latar krem, bukan efek dramatis
- Semua target sentuh ≥44px, feedback tekan `active:scale-95`

## 2. Colors

Palet restrained: krem dan putih membawa sebagian besar permukaan, satu warna utama (default maroon, bisa diganti owner) membawa seluruh bobot visual aksi dan status penting.

### Primary
- **Maroon Deep** (`#6e150f`): Warna default `--primary` — tombol utama, nav aktif, harga total, elemen yang butuh perhatian pertama. Ini adalah slot yang bisa diganti owner lewat 9 preset (Biru, Oranye, Hijau, Ungu, Merah, Pink, Teal, Kuning) via Pengaturan > Tema — setiap warna pengganti harus tetap lolos kontras ≥4.5:1 terhadap krem.
- **Maroon Vibrant** (`#b92a1c`): Varian terang untuk hover/pressed state dan aksen grafik, tidak dipakai sebagai token terpisah di UI saat ini — cadangan untuk data viz laporan.

### Secondary
- **Gold Antique** (`#d0a139`): `--accent` — TETAP, tidak ikut berubah walau owner ganti warna primer. Dipakai untuk badge trial, highlight status premium, aksen "istimewa". Ini yang membedakan "warna toko" (bisa custom) dari "warna sistem Inspira POS" (identitas tetap).

### Neutral
- **Cream** (`#f5efe6`): `--bg` — latar halaman, dasar dari semua layar.
- **Surface White** (`#ffffff`): `--surface` — kartu, panel, modal, tabel.
- **Charcoal** (`#1a1a1a`): `--ink` — teks utama, kontras tinggi di atas krem/putih.
- **Muted Brown** (`#8a7a6e` area, `--muted`): teks sekunder, label, placeholder — tetap lolos 4.5:1 di atas krem.
- **Border Cream** (`--border`): garis kartu, input, pemisah tabel — sangat halus, tidak pernah jadi elemen dekoratif sendiri.

### Named Rules
**The Owner's Color Rule.** `--primary` adalah satu-satunya slot yang berubah saat owner memilih warna toko; `--accent` (gold), `--bg` (cream), `--ink` (charcoal) tetap sebagai identitas Inspira POS yang tidak pernah di-override. Ini menjaga sistem tetap "Inspira POS" walau warna tombol berubah total.

## 3. Typography

**Display/Body Font:** system-ui stack (`-apple-system, sans-serif`) — satu keluarga font untuk semua, tanpa font kustom yang perlu dimuat (cepat di koneksi warung yang tidak stabil).

**Character:** Tegas dan mudah dibaca dari jarak dekat sambil melayani pelanggan — bukan elegan-editorial, bukan playful-dekoratif.

### Hierarchy
- **Display** (700 bold, 1.5rem, line-height 1.2): Judul halaman, angka total transaksi POS.
- **Title** (600 semibold, 1.125rem, line-height 1.3): Judul kartu, nama toko di topbar.
- **Body** (400 regular, 0.875rem, line-height 1.5): Teks utama, label form, isi tabel. Maksimal ~70ch per baris pada deskripsi panjang.
- **Label** (600 semibold, 0.75rem, letter-spacing 0.02em): Badge, caption tabel, label bottom-nav.

### Named Rules
**The Numbers-Are-Bold Rule.** Semua angka uang (harga, total, omzet) selalu bold dan `tabular-nums` — ini yang paling sering dilihat kasir dalam hitungan detik.

## 4. Elevation

Lifted ringan, bukan flat total. Kartu dan modal punya shadow tipis (`shadow-sm` pada Card, `shadow-lg`/`shadow-xl` pada Sheet/Dialog) untuk memisahkan permukaan putih dari latar krem — cukup untuk memberi kedalaman tanpa terasa berat atau ala glassmorphism. Sidebar dan Topbar memakai border, bukan shadow, karena posisinya statis (bukan floating).

### Shadow Vocabulary
- **card-rest** (`shadow-sm`, border `1px solid var(--border)`): Kartu diam di grid dashboard, baris pengaturan.
- **overlay-lifted** (`shadow-lg`/`shadow-xl`): Dialog, Sheet (bottom-drawer mobile), popover — elemen yang mengambang di atas konten.

### Named Rules
**The No-Drama Rule.** Shadow tidak pernah dipakai sebagai efek dekoratif berdiri sendiri (tidak ada glow, tidak ada glassmorphism blur pada card biasa) — hanya untuk membedakan lapisan permukaan.

## 5. Components

Karakter keseluruhan: hangat dan mantap. Tombol besar, warna solid percaya diri, memberi feedback fisik saat ditekan (`active:scale-95`) — meniru rasa menekan tombol kasir fisik, bukan UI datar yang "diam" saat disentuh.

### Buttons
- **Shape:** rounded-xl (12px), tinggi minimum 44px (`size=md`), hingga 56px untuk aksi utama POS (`size=lg`).
- **Primary:** latar `var(--primary)` solid, teks putih bold, `hover:opacity-90`. Dipakai untuk SATU aksi utama per layar (Bayar, Simpan, Lanjut).
- **Outline:** border `var(--border)`, teks `var(--ink)`, hover latar `var(--surface-2)` — aksi sekunder.
- **Ghost:** tanpa border, teks `var(--muted)`, dipakai untuk aksi tersier (Kembali, ikon aksi kecil).
- **Destructive:** border merah transparan, teks merah — hapus/void/batalkan.
- **Hover/Focus:** semua varian punya `focus-visible:ring-2 ring-[var(--primary)]/40`; tidak ada transisi warna lebih dari 150ms.

### Cards
- **Corner Style:** rounded-2xl (16px).
- **Background:** selalu `var(--surface)` (putih), tidak pernah krem-di-atas-krem.
- **Shadow Strategy:** `shadow-sm` + border 1px — lihat Elevation.
- **Internal Padding:** 16px (`p-4`), header/content/footer mengikuti scale 4px.

### Badges
- **Style:** pill penuh (`rounded-full`), 6 varian semantik: neutral, primary, accent (gold, untuk trial), warning (amber, stok menipis/trial hampir habis), success (hijau, aktif/lunas), destructive (merah).
- **State:** statis, tidak interaktif — murni penanda status.

### Inputs / Fields
- **Style:** border `var(--border)`, radius sama dengan Card turunan (rounded-xl), tinggi minimum 44px.
- **Focus:** ring `var(--primary)/40`, border tetap solid (bukan glow tanpa border).

### Navigation
- **Sidebar** (desktop/tablet-landscape ≥768px): fixed kiri, item nav dengan ikon+label, state aktif = latar `var(--primary)` solid + teks putih, fitur terkunci menampilkan ikon gembok di kanan (bukan hilang).
- **BottomNav** (mobile-portrait <768px): 5 tab tetap di bawah, tab tengah (Kasir) elevated sebagai lingkaran mengambang dengan `shadow-lg` — pola "tombol kasir fisik yang menonjol".

### Feature-Locked Overlay (Signature Component)
Kartu/section di luar plan owner: konten asli tetap terlihat tapi di-blur tipis (`blur-[1px] opacity-40`) dengan ikon gembok mengambang di tengah — klik membuka dialog upgrade. Prinsip PRD: fitur TIDAK PERNAH hilang total dari UI, selalu terlihat lalu terkunci dengan jalur upgrade jelas.

## 6. Do's and Don'ts

### Do:
- **Do** pakai `var(--primary)` untuk SATU aksi utama per layar — warna ini milik owner (bisa diganti), jangan hardcode maroon di komponen baru, selalu lewat token.
- **Do** pertahankan `--accent` (gold `#d0a139`) sebagai identitas tetap Inspira POS untuk badge trial/premium — ini TIDAK ikut berubah saat owner ganti warna toko.
- **Do** beri touch target ≥44px dan feedback `active:scale-95` di semua elemen interaktif — konteks pemakaian adalah tablet POS yang disentuh cepat.
- **Do** tampilkan fitur di luar plan tetap terlihat (blur + gembok + CTA upgrade), sesuai PRD §2.4/§10.3 — jangan pernah sembunyikan menu begitu saja.

### Don't:
- **Don't** tiru palet atau nuansa admin-app (coral/teal, Sora+Figtree) — tenant-app harus terasa seperti produk yang dipakai owner warung sehari-hari, bukan tools staf internal InspiraLabs.
- **Don't** pakai gradient text, hero-metric card template, atau card bersarang (nested card) — ini bukan landing page SaaS.
- **Don't** gunakan border-left/border-right tebal sebagai aksen warna pada card atau list item.
- **Don't** buat shadow dramatis atau efek glassmorphism pada card biasa — lihat Elevation, Named Rule "No-Drama".
- **Don't** gunakan bahasa sistem/teknis di copy ("record tidak ditemukan", "sinkronisasi gagal") — selalu bahasa manusia sesuai PRODUCT.md.
