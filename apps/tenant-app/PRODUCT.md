# Product

## Register

product

## Users

Pemilik UMKM kuliner & kafe Indonesia (warung, kafe kecil, 1-5 kasir) yang berlangganan paket **iPOS Cloud (UMKM Lite/Pro)** — beserta kasir/staf mereka. Konteks pemakaian: tablet untuk layar kasir (POS full-screen), HP untuk owner cek laporan dari mana saja, laptop untuk kelola toko lebih detail. Bukan orang teknis, banyak baru pertama pakai dashboard toko online. Job to be done: jualan cepat lewat POS, pantau omzet & stok real-time, kelola menu/staf/pengaturan toko tanpa training panjang.

## Product Purpose

Inspira POS Cloud (tenant-app) — dashboard toko multi-device untuk pelanggan langganan bulanan/tahunan (`{slug}.inspirapos.id`). Berbeda dari ipos-offline (data lokal per device, beli putus), semua data tenant tersimpan di server (Postgres) sehingga sinkron lintas kasir/outlet/device. Sukses = owner bisa buka laporan dari HP sambil di luar toko, kasir bisa proses order <60 detik di tablet, dan fitur di luar plan tetap terlihat (bukan hilang) dengan jalur upgrade yang jelas.

Sumber kebenaran fitur: `docs/PRD_InspiraPOS_Frontend_v4.pdf` §5.1 (matriks UMKM Lite vs Pro), `docs/PRICING.md` §2.

## Brand Personality

Hangat, membumi, dan personal — mewarisi identitas Inspira POS (maroon tua + emas antik + krem) seperti ipos-offline, bukan dashboard SaaS internal yang dingin. Owner tetap bisa memilih warna brand sendiri (9 preset), tapi nuansa "ditemani", bukan "diatur sistem", harus tetap terasa di copy dan micro-interaction. Bahasa Indonesia sehari-hari, minim jargon teknis (hindari "record", "database", "sinkronisasi gagal" — ganti dengan bahasa manusia).

## Anti-references

- **admin-app** (dashboard internal InspiraLabs, coral/teal, Sora+Figtree) — tenant-app harus terasa beda: ini produk yang dipakai owner warung tiap hari, bukan tools staf internal. Jangan tiru palet atau nuansa "generic internal SaaS tool" itu.
- SaaS dashboard biru-abu generik dengan hero-metric card template, gradient text, atau card bersarang.
- Menyembunyikan fitur di luar plan secara total — PRD mewajibkan tetap terlihat + terkunci dengan CTA upgrade jelas (bukan hilang begitu saja).

## Design Principles

1. **Jempol dulu** — semua target sentuh ≥44px, aksi utama (Bayar, Simpan, Tambah) mudah dijangkau; layar POS/Kasir dioptimalkan tablet landscape.
2. **Fitur terlihat, bukan disembunyikan** — kunci fitur di luar plan dengan overlay + CTA upgrade yang jelas (PRD §2.4/§10.3), jangan pernah hilangkan menu begitu saja.
3. **Data tersinkron adalah selling point** — rayakan bahwa laporan bisa dibuka dari HP kapan saja, bukan hanya "boleh diakses".
4. **Insight, bukan cuma angka** — laporan dan dashboard harus membantu owner mengambil keputusan (rekomendasi menu, insight tren), bukan sekadar tabel mentah.
5. **Warna brand milik owner** — default maroon/gold Inspira POS, tapi UI harus terasa natural dipakai dengan 8 warna alternatif lain tanpa terlihat rusak.

## Accessibility & Inclusion

Kontras teks ≥4.5:1 (dipakai di berbagai kondisi cahaya toko). Touch target ≥44px. `prefers-reduced-motion` dihormati untuk semua animasi framer-motion. Satu bahasa: Indonesia.
