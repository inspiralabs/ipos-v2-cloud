# Product

## Register

product

## Users

Tim internal InspiraLabs (admin/ops kecil, bukan tim engineering) — mengelola klien Inspira POS sehari-hari: cek status lisensi (trial/aktif/habis), generate & cabut kode lisensi, tindak lanjuti leads masuk dari landing page, dan (nanti) kelola tenant Cloud. Dipakai baik dari desktop (kerja rutin) maupun HP (cek cepat sambil di luar kantor / respons WA klien).

## Product Purpose

Super Admin Panel terpusat untuk Inspira POS — satu tempat mengelola siklus hidup klien (trial → lite/pro → expired/revoked) untuk produk Offline, ditambah nantinya tenant Cloud dan leads. Sukses = admin bisa menemukan satu klien, memahami statusnya, dan bertindak (generate lisensi, tandai lead, dsb) dalam hitungan detik, dari perangkat apa pun.

## Brand Personality

Modern & santai — profesional tapi tidak kaku, terasa seperti tim InspiraLabs yang kecil dan gesit, bukan software korporat besar yang dingin. Sengaja punya identitas visual sendiri, terpisah dari warna maroon/emas yang dipakai klien di app kasir — supaya admin langsung sadar "ini panel internal", bukan produk yang dilihat pelanggan.

## Anti-references

- Jangan seperti kondisi sekarang: benar-benar tanpa styling (Tailwind polos, tanpa token warna).
- Jangan meniru gaya dashboard-template generik (grid kartu identik, ikon+judul+teks berulang, hero-metric cliché).
- Jangan tabrakan visual dengan brand pelanggan (maroon/emas) — begitu terlihat, harus jelas ini bukan app kasir.

## Design Principles

- **Status kelihatan sekilas** — hal terpenting di tiap layar (status lisensi klien, status lead) harus langsung kebaca tanpa perlu klik/scroll.
- **Satu tangan di HP** — semua aksi inti (generate/cabut lisensi, ubah status lead) harus bisa dipakai nyaman dari HP, bukan cuma desktop.
- **Jelas lebih penting dari indah** — ini tool kerja harian tim sendiri, prioritaskan kecepatan scan & bertindak di atas kesan visual yang mewah.
- **Identitas sendiri, bukan turunan brand klien** — palet & nuansa sengaja beda dari produk yang dilihat pelanggan.

## Accessibility & Inclusion

WCAG AA sebagai baseline. Dukung mode gelap/terang (v1 sudah punya ini, dipertahankan). Tidak ada kebutuhan aksesibilitas khusus yang disebutkan sejauh ini.
