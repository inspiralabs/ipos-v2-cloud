# Modul 0 — Gateway & IP klien: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tutup 10 service yang saat ini terjangkau langsung dari internet, dan buat `request.ip` berisi IP klien sebenarnya yang tidak bisa dipalsukan — prasyarat agar rate limit dan lockout di Modul 2 punya arti.

**Architecture:** Topologinya adalah Cloudflare Tunnel → `cloudflared` di host → port yang dipublish container. Dua perubahan yang saling bergantung: (1) semua port dibind ke `127.0.0.1` sehingga hanya `cloudflared` di host yang bisa menjangkaunya, dan 10 service backend tidak dipublish sama sekali karena hanya nginx yang memanggilnya; (2) setelah itu nginx boleh mempercayai header Cloudflare, jadi `real_ip_header CF-Connecting-IP` dipakai — header yang **selalu ditimpa** Cloudflare dan tidak bisa dikirim klien. Urutannya tidak boleh dibalik: mempercayai header sebelum menutup akses langsung justru membuat pemalsuan IP jadi lebih mudah, bukan lebih sulit.

**Tech Stack:** Docker Compose, nginx (image `nginx:alpine`, modul `ngx_http_realip_module` sudah built-in), Cloudflare Tunnel (`cloudflared` di host).

**Spec:** [docs/audit-fase-1.md](../../audit-fase-1.md) — bagian G (infrastruktur), temuan #1, #2, #11.

## Global Constraints

- **Dikerjakan paling awal, sebelum Modul 1 dan 2.** Modul 2 Task 1 (`trustProxy`) hanya benar kalau modul ini sudah selesai.
- Topologi yang diasumsikan (dikonfirmasi pemilik repo): `cloudflared` jalan **di host**, bukan sebagai service di compose. Ia menembak `localhost:80` untuk API, `localhost:3010` untuk admin-app, dan `localhost:3012` untuk tenant-app. **Kalau ternyata `cloudflared` jalan di dalam Docker, STOP dan tanyakan** — solusinya berbeda (service di-attach ke network, tanpa publish port sama sekali).
- Docker daemon tidak tersedia di mesin tempat plan ini ditulis, jadi **setiap task wajib diverifikasi dengan `docker compose config` dan `nginx -t`** sebelum di-commit. Jangan mengandalkan pembacaan manual.
- `docker-compose.yml` mencampur dua gaya `environment` (block untuk sebagian service, flow-mapping satu baris untuk `inventory-service:111` dan `report-service:159`). **Jangan dirapikan di modul ini** — diff harus tetap kecil dan mudah direview.
- Jangan mengubah nilai env, nama service, atau nomor port internal. Yang berubah hanya **binding** port ke host dan konfigurasi real-IP nginx.

---

### Task 1: Tutup akses langsung ke semua service

Sepuluh service mem-publish port ke `0.0.0.0` (`"3001:3001"` … `"3011:3011"`). Di VPS dengan IP publik dan tanpa firewall, `http://<ip>:3002/api/v1/admin/...` langsung mengenai tenant-service **tanpa lewat gateway**. notification-service bahkan terjangkau di 3009 padahal `nginx.conf:38-40` secara eksplisit menolak mengeksposnya dengan komentar larangan.

Hanya tiga port yang benar-benar perlu dijangkau `cloudflared` di host: nginx (80), admin-app (3010), tenant-app (3012). Sepuluh service backend hanya dipanggil nginx lewat Docker network, jadi `ports:`-nya bisa dihapus seluruhnya.

**Files:**
- Modify: `docker-compose.yml` — hapus blok `ports:` pada 10 service; bind 3 sisanya ke `127.0.0.1`

**Interfaces:**
- Consumes: —
- Produces: hanya `127.0.0.1:80`, `127.0.0.1:3010`, `127.0.0.1:3012` yang terbuka di host. Nama service dan port internal tidak berubah, jadi `nginx.conf` dan semua `*_SERVICE_URL` di env tetap valid tanpa perubahan.

- [ ] **Step 1: Catat kondisi awal sebagai pembanding**

Run: `cd "D:/code-for-life/inspiralabs/products/inspirapos/ipos-v2/ipos-v2-cloud" && docker compose config | grep -A3 "published:" | head -60`

Simpan outputnya. Ini yang akan dibandingkan di Step 4.

Run: `grep -n "ports:" -A2 docker-compose.yml`
Expected: 13 blok `ports:` (redis tidak punya — itu memang sudah benar dan sengaja, lihat komentar di `docker-compose.yml:4-5`).

- [ ] **Step 2: Hapus `ports:` dari 10 service backend**

Hapus blok `ports:` beserta isinya dari service berikut di `docker-compose.yml`. Semuanya hanya dipanggil nginx lewat Docker network:

| Service | Blok yang dihapus |
|---|---|
| `auth-service` | `ports:` + `- "3001:3001"` (baris 20-21) |
| `tenant-service` | `ports:` + `- "3002:3002"` (baris 41-42) |
| `pos-service` | `ports: ["3003:3003"]` (baris 71) |
| `catalog-service` | `ports: ["3004:3004"]` (baris 90) |
| `inventory-service` | `ports: ["3005:3005"]` (baris 110) |
| `kitchen-service` | `ports: ["3006:3006"]` (baris 120) |
| `table-service` | `ports: ["3007:3007"]` (baris 139) |
| `report-service` | `ports: ["3008:3008"]` (baris 158) |
| `notification-service` | `ports: ["3009:3009"]` (baris 168) |
| `websocket-gateway` | `ports: ["3011:3011"]` (baris 184) |

**Jangan** menghapus `environment: PORT: 30xx` — service tetap listen di port itu di dalam network, dan `nginx.conf` merujuknya lewat nama service (mis. `server auth-service:3001`).

Tambahkan satu komentar di atas service pertama yang diubah (`auth-service`), menjelaskan kenapa tidak ada `ports:`:

```yaml
  # Tidak ada `ports:` di service backend mana pun — semuanya hanya dipanggil nginx
  # lewat Docker network. Sebelumnya semua dipublish ke 0.0.0.0 sehingga gateway bisa
  # dilewati total dari internet (mis. langsung ke :3002/api/v1/admin), dan
  # notification-service terjangkau di :3009 padahal nginx.conf:38-40 sengaja menolak
  # mengeksposnya. Kalau perlu akses dari host untuk debug:
  #   docker compose exec auth-service wget -qO- http://localhost:3001/health
```

- [ ] **Step 3: Bind 3 port yang tersisa ke `127.0.0.1`**

`cloudflared` jalan di host, jadi ketiganya tetap perlu dipublish — tapi cukup ke loopback, bukan ke semua interface.

`nginx` (baris 229-230):
```yaml
    ports:
      # Hanya loopback: cloudflared jalan di host dan menembak localhost:80.
      # 0.0.0.0 akan membuat gateway terjangkau langsung dari internet, melewati tunnel.
      - "127.0.0.1:80:80"
```

`admin-app` (baris 202-203):
```yaml
    ports:
      - "127.0.0.1:3010:3010"
```

`tenant-app` (baris 218-219):
```yaml
    ports:
      - "127.0.0.1:3012:3100"
```

- [ ] **Step 4: Verifikasi dengan `docker compose config`**

Run: `docker compose config | grep -c "published:"`
Expected: **3** (turun dari 13).

Run: `docker compose config | grep -B1 -A3 "published:"`
Expected: setiap entry punya `host_ip: 127.0.0.1` dan published-nya hanya `80`, `3010`, `3012`.

Run: `docker compose config | grep -E "host_ip: 0.0.0.0" && echo "MASIH ADA YANG TERBUKA KE PUBLIK" || echo "bersih: tidak ada bind ke 0.0.0.0"`
Expected: pesan "bersih".

- [ ] **Step 5: Verifikasi nginx masih bisa menjangkau semua upstream**

Run: `docker compose up -d && sleep 15 && docker compose ps`
Expected: semua container `running`/`healthy`.

Run: `for p in auth:3001 tenant:3002 pos:3003 catalog:3004 inventory:3005 kitchen:3006 table:3007 report:3008 notification:3009 websocket-gateway:3011; do n="${p%%:*}"; svc="$n-service"; [ "$n" = "websocket-gateway" ] && svc="websocket-gateway"; printf "%-22s " "$svc"; docker compose exec -T nginx wget -qO- --timeout=3 "http://$svc:${p##*:}/health" 2>/dev/null | head -c 80; echo; done`
Expected: setiap service membalas JSON `{"status":"ok",...}`. Kalau ada yang gagal, nginx tidak bisa menjangkaunya dan `ports:` bukan penyebabnya — periksa nama service di `nginx.conf`.

- [ ] **Step 6: Verifikasi port backend BENAR-BENAR tertutup dari host**

Run: `for port in 3001 3002 3003 3004 3005 3006 3007 3008 3009 3011; do printf "port %s: " "$port"; curl -s -m 2 -o /dev/null -w "%{http_code}\n" "http://127.0.0.1:$port/health" 2>/dev/null || echo "tertutup"; done`
Expected: semuanya `tertutup` atau `000`. Kalau ada yang membalas `200`, `ports:`-nya belum benar-benar terhapus.

Run: `curl -s -m 3 http://127.0.0.1/api/v1/auth/../../health -o /dev/null -w "gateway: %{http_code}\n"; curl -s -m 3 -o /dev/null -w "admin-app: %{http_code}\n" http://127.0.0.1:3010; curl -s -m 3 -o /dev/null -w "tenant-app: %{http_code}\n" http://127.0.0.1:3012`
Expected: ketiganya membalas (bukan `000`) — jalur yang dipakai `cloudflared` tetap hidup.

- [ ] **Step 7: Verifikasi tunnel dari luar masih jalan**

Buka di browser: domain API, admin dashboard, dan tenant dashboard sesuai `CORS_ORIGIN` di `.env`. Ketiganya harus memuat normal.

Kalau salah satu mati, kemungkinan `cloudflared` menembak `0.0.0.0:<port>` alih-alih `localhost`. Periksa konfigurasi tunnel di host (`/etc/cloudflared/config.yml` atau dashboard Cloudflare) dan pastikan `service:` menunjuk `http://localhost:<port>`.

- [ ] **Step 8: Commit**

```bash
git add docker-compose.yml
git commit -m "fix(infra): tutup 10 service dari internet, bind gateway ke loopback

Sepuluh service mem-publish port ke 0.0.0.0, jadi nginx gateway bisa
dilewati total dari internet (mis. langsung ke :3002/api/v1/admin).
notification-service bahkan terjangkau di :3009 padahal nginx.conf:38-40
secara eksplisit menolak mengeksposnya.

Service backend sekarang tidak dipublish sama sekali (hanya nginx yang
memanggilnya lewat Docker network), dan 3 port yang masih dibutuhkan
cloudflared dibind ke 127.0.0.1 saja."
```

---

### Task 2: IP klien sebenarnya, tidak bisa dipalsukan

nginx meneruskan `X-Forwarded-For` dengan `$proxy_add_x_forwarded_for` (`nginx.conf:18`), yang **menambahkan** ke header yang dikirim klien alih-alih menimpanya. Karena `trustProxy: true` di Fastify mengambil entri paling kiri, klien yang mengirim `X-Forwarded-For: 1.2.3.4` sendiri akan terbaca sebagai `1.2.3.4`. Semua rate limit dan lockout PIN di Modul 2 bisa dilewati hanya dengan mengganti satu header.

`CF-Connecting-IP` selalu **ditimpa** Cloudflare dan tidak bisa dikirim klien, jadi itu sumber yang benar. Ini aman dipercaya **hanya setelah Task 1**, karena `set_real_ip_from` harus mempercayai satu-satunya jalur masuk — dan sebelum Task 1 jalur masuknya bukan cuma tunnel.

**Files:**
- Modify: `nginx/nginx.conf:16-19`
- Test: `nginx/realip.test.sh` (create)

**Interfaces:**
- Consumes: Task 1 (akses langsung sudah tertutup).
- Produces: `request.ip` di setiap service Fastify = IP klien sebenarnya. Modul 2 Task 1 (`trustProxy: true`) bergantung pada ini. `sessions.ip_address` juga jadi berguna.

- [ ] **Step 1: Tulis test yang gagal**

Buat `nginx/realip.test.sh`:

```bash
#!/usr/bin/env bash
# Verifikasi nginx meneruskan IP klien yang benar dan MENGABAIKAN X-Forwarded-For
# kiriman klien. Butuh stack jalan: docker compose up -d
set -u

GW="${GW:-http://127.0.0.1}"
fail=0

check() {
  local name="$1" expected="$2" actual="$3"
  if [ "$actual" = "$expected" ]; then
    echo "PASS: $name"
  else
    echo "FAIL: $name — harap '$expected', dapat '$actual'"
    fail=1
  fi
}

# /api/v1/auth/health tidak ada; pakai endpoint health auth-service lewat gateway.
# nginx merutekan /api/v1/auth ke auth_service, jadi kita minta service echo IP-nya
# lewat log. Cara paling andal tanpa menambah endpoint: baca access log nginx.
probe() {
  local xff_header="$1"
  docker compose exec -T nginx sh -c 'echo -n > /var/log/nginx/access.log' 2>/dev/null
  if [ -n "$xff_header" ]; then
    curl -s -m 5 -o /dev/null -H "X-Forwarded-For: $xff_header" "$GW/api/v1/auth/login" -X POST \
      -H 'Content-Type: application/json' -d '{}' 2>/dev/null
  else
    curl -s -m 5 -o /dev/null "$GW/api/v1/auth/login" -X POST \
      -H 'Content-Type: application/json' -d '{}' 2>/dev/null
  fi
  docker compose exec -T nginx sh -c 'cat /var/log/nginx/access.log' 2>/dev/null | tail -1
}

echo "--- tanpa header palsu ---"
line_clean=$(probe "")
echo "$line_clean"

echo "--- dengan X-Forwarded-For palsu ---"
line_spoof=$(probe "1.2.3.4")
echo "$line_spoof"

# Yang penting: IP yang dicatat TIDAK berubah jadi 1.2.3.4 gara-gara header klien.
if echo "$line_spoof" | grep -q "1\.2\.3\.4"; then
  echo "FAIL: X-Forwarded-For kiriman klien masih dipercaya — rate limit bisa dilewati"
  fail=1
else
  echo "PASS: X-Forwarded-For kiriman klien diabaikan"
fi

# real_ip_header harus terkonfigurasi
if docker compose exec -T nginx grep -q "real_ip_header" /etc/nginx/nginx.conf 2>/dev/null; then
  echo "PASS: real_ip_header terkonfigurasi"
else
  echo "FAIL: real_ip_header belum ada di nginx.conf"
  fail=1
fi

exit $fail
```

Run: `chmod +x nginx/realip.test.sh && ./nginx/realip.test.sh`
Expected: **FAIL** pada "real_ip_header belum ada" dan kemungkinan pada pengabaian XFF.

- [ ] **Step 2: Konfigurasi real-IP di nginx**

Ganti baris 16-19 `nginx/nginx.conf`:

```nginx
  # ── IP klien sebenarnya ────────────────────────────────────────────────────
  # Topologi: Cloudflare Tunnel -> cloudflared (di host) -> nginx. Setelah semua
  # port dibind ke 127.0.0.1 (docker-compose.yml), satu-satunya jalur masuk adalah
  # tunnel, jadi aman mempercayai header Cloudflare dari alamat mana pun yang
  # menjangkau kita.
  #
  # CF-Connecting-IP dipakai, BUKAN X-Forwarded-For: Cloudflare selalu MENIMPA
  # CF-Connecting-IP, sementara XFF ditambahkan di belakang apa pun yang dikirim
  # klien. Karena Fastify trustProxy:true mengambil entri paling kiri, memercayai
  # XFF berarti klien bisa memalsukan IP-nya dan melewati seluruh rate limit
  # serta lockout PIN.
  set_real_ip_from 0.0.0.0/0;
  set_real_ip_from ::/0;
  real_ip_header CF-Connecting-IP;
  real_ip_recursive off;

  proxy_set_header Host              $host;
  proxy_set_header X-Real-IP         $remote_addr;
  # $remote_addr di sini SUDAH hasil real_ip (IP klien asli), dan kita menimpa
  # XFF alih-alih menambahkan, supaya header kiriman klien tidak pernah ikut.
  proxy_set_header X-Forwarded-For   $remote_addr;
  proxy_set_header X-Forwarded-Proto https;
```

`X-Forwarded-Proto` dipaku `https` karena TLS selalu diterminasi di Cloudflare; `$scheme` di sini selalu `http` (tunnel ke port 80) dan akan membuat service salah menyimpulkan koneksi tidak aman — termasuk cookie `secure` yang bisa ikut salah.

- [ ] **Step 3: Verifikasi konfigurasi nginx valid**

Run: `docker compose exec -T nginx nginx -t`
Expected: `syntax is ok` dan `test is successful`. Kalau muncul `unknown directive "set_real_ip_from"`, image nginx yang dipakai tidak punya `ngx_http_realip_module` — periksa `docker compose exec nginx nginx -V 2>&1 | tr ' ' '\n' | grep realip`. Image resmi `nginx:alpine` memuatnya secara default.

- [ ] **Step 4: Reload dan jalankan test**

Run: `docker compose exec -T nginx nginx -s reload && sleep 2 && ./nginx/realip.test.sh`
Expected: semua PASS.

- [ ] **Step 5: Verifikasi end-to-end dari luar tunnel**

Dari jaringan luar (bukan dari VPS), kirim request dengan header XFF palsu ke domain API:

Run: `curl -s -m 10 -o /dev/null -w "%{http_code}\n" -H "X-Forwarded-For: 1.2.3.4" -X POST https://<domain-api>/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"tidak@ada.id","password":"salahsekali"}'`

Lalu periksa log auth-service:

Run: `docker compose logs --tail=20 auth-service | grep -i "reqId\|remoteAddress\|1.2.3.4"`
Expected: IP yang tercatat adalah IP publik Anda yang sebenarnya, **bukan** `1.2.3.4`.

- [ ] **Step 6: Commit**

```bash
git add nginx/nginx.conf nginx/realip.test.sh
git commit -m "fix(infra): ambil IP klien dari CF-Connecting-IP, jangan percaya XFF klien

nginx meneruskan X-Forwarded-For dengan \$proxy_add_x_forwarded_for yang
MENAMBAHKAN ke header kiriman klien. Karena Fastify trustProxy:true
mengambil entri paling kiri, klien yang mengirim X-Forwarded-For sendiri
akan terbaca sebagai IP itu — seluruh rate limit dan lockout PIN di
Modul 2 bisa dilewati dengan satu header.

CF-Connecting-IP selalu ditimpa Cloudflare dan tidak bisa dikirim klien.
Aman dipercaya karena Task 1 sudah menutup semua jalur masuk selain tunnel.
X-Forwarded-Proto dipaku https karena TLS diterminasi di Cloudflare."
```

---

### Task 3: `client_max_body_size` — upload foto menu & logo

nginx tidak menyetel `client_max_body_size`, jadi defaultnya **1 MB**. Upload foto menu (catalog-service) dan logo/QRIS toko (tenant-service) lewat gateway akan kena `413 Request Entity Too Large` untuk foto HP biasa. Fiturnya praktis rusak di produksi.

**Files:**
- Modify: `nginx/nginx.conf` (tambah `client_max_body_size`)

**Interfaces:**
- Consumes: —
- Produces: body hingga 10 MB diterima pada route upload.

- [ ] **Step 1: Tulis test yang gagal**

Buat file uji 3 MB dan kirim ke endpoint upload lewat gateway:

Run: `head -c 3145728 /dev/urandom > /tmp/besar.bin && curl -s -m 20 -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1/api/v1/catalog/menus/00000000-0000-0000-0000-000000000000/photo -F "file=@/tmp/besar.bin;type=image/jpeg"`

Expected: **413**. (401/404 juga mungkin kalau tanpa token — yang penting **bukan** 413. Kalau dapat 401, ulangi dengan header `Authorization: Bearer <token valid>` supaya benar-benar sampai ke pemeriksaan ukuran.)

- [ ] **Step 2: Naikkan batas untuk route upload saja**

Di `nginx/nginx.conf`, di dalam blok `http { ... }` setelah konfigurasi real-IP, tambahkan default konservatif:

```nginx
  # Default ketat untuk seluruh API — hanya route upload yang dinaikkan di bawah.
  client_max_body_size 1m;
```

Lalu pada dua `location` yang menerima upload, naikkan batasnya. Ganti baris `location /api/v1/catalog { proxy_pass http://catalog_service; }` menjadi:

```nginx
    location /api/v1/catalog {
      # Foto menu dari kamera HP rutin 3-8 MB. Default nginx 1m membuat fitur
      # upload foto gagal 413 di produksi.
      client_max_body_size 10m;
      proxy_pass http://catalog_service;
    }
```

Dan `location /api/v1/tenants` (logo toko & gambar QRIS lewat tenant-service):

```nginx
    location /api/v1/tenants {
      client_max_body_size 10m;
      proxy_pass http://tenant_service;
    }
```

- [ ] **Step 3: Verifikasi batas backend juga cukup**

`@fastify/multipart` punya batas ukurannya sendiri. Periksa apakah catalog-service dan tenant-service menyetelnya:

Run: `grep -rn "multipart" services/catalog-service/src/index.ts services/tenant-service/src/index.ts`

Kalau `register(multipart)` dipanggil tanpa opsi `limits`, batas default `@fastify/multipart` adalah **1 MB per file** — naikkan nginx tanpa ini tidak menyelesaikan apa pun. Tambahkan di kedua service:

```ts
app.register(multipart, {
  // Selaras dengan client_max_body_size 10m di nginx/nginx.conf.
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});
```

- [ ] **Step 4: Verifikasi nginx valid & reload**

Run: `docker compose exec -T nginx nginx -t && docker compose exec -T nginx nginx -s reload`
Expected: `test is successful`.

- [ ] **Step 5: Jalankan test, pastikan LULUS**

Run: `curl -s -m 20 -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1/api/v1/catalog/menus/00000000-0000-0000-0000-000000000000/photo -F "file=@/tmp/besar.bin;type=image/jpeg" -H "Authorization: Bearer <token-valid>"`
Expected: **bukan 413** (400/404 wajar — file random bukan gambar sah dan UUID-nya tidak ada; yang diuji adalah batas ukuran, bukan validasi isinya).

Run: `rm -f /tmp/besar.bin`

- [ ] **Step 6: Commit**

```bash
git add nginx/nginx.conf services/catalog-service/src/index.ts services/tenant-service/src/index.ts
git commit -m "fix(infra): naikkan batas upload ke 10m untuk route foto menu & logo

nginx tanpa client_max_body_size memakai default 1 MB, jadi upload foto
menu dan logo toko kena 413 untuk foto HP biasa — fiturnya praktis rusak
di produksi. Default global tetap 1m; hanya dua route upload dinaikkan,
dan batas @fastify/multipart di backend diselaraskan."
```

---

## Kriteria "selesai" Modul 0

- [ ] `docker compose config | grep -c "published:"` → **3**
- [ ] `docker compose config | grep "host_ip: 0.0.0.0"` → kosong
- [ ] 10 port backend (3001-3009, 3011) tidak menjawab dari `127.0.0.1`
- [ ] `docker compose exec nginx wget -qO- http://<tiap-service>:<port>/health` → semua membalas ok
- [ ] `docker compose exec nginx nginx -t` → `test is successful`
- [ ] `./nginx/realip.test.sh` → semua PASS
- [ ] Request dari luar dengan `X-Forwarded-For: 1.2.3.4` palsu → log auth-service mencatat IP asli, bukan `1.2.3.4`
- [ ] Upload file 3 MB lewat gateway → bukan 413
- [ ] Ketiga domain (API, admin dashboard, tenant dashboard) tetap normal lewat tunnel

## Dependency ke modul lain

- **Modul 2 Task 1 bergantung pada Task 2 di sini.** `trustProxy: true` di Fastify hanya benar kalau nginx sudah menimpa XFF dari `CF-Connecting-IP`. Kalau Modul 2 dieksekusi lebih dulu, rate limit dan lockout PIN-nya bisa dilewati dengan satu header — lebih buruk daripada tidak ada, karena memberi rasa aman palsu.
- Task 3 tidak memblokir apa pun, tapi dikerjakan di sini karena satu-satunya file yang disentuh adalah `nginx.conf` yang sama.

## Yang SENGAJA tidak dikerjakan di modul ini

- **Container jalan sebagai root** dan **image produksi berisi seluruh `/app`** termasuk devDependencies dan `dist/scripts/reset-tenant.js`. Keduanya di `Dockerfile`, bukan compose/nginx, dan memperbaikinya mengubah cara image dibangun — butuh satu siklus build+deploy penuh untuk diverifikasi. Task tersendiri.
- **`HEALTHCHECK` di Dockerfile** dan `/health` yang belum memeriksa DB. Berpasangan: health check yang tidak menyentuh dependensinya tidak memberi informasi. Dikerjakan bersama di task yang sama dengan dua item di atas.
- **Rate limiting di nginx.** Setelah Modul 2, pembatasan sudah ada di lapisan aplikasi dengan konteks yang lebih baik (per user_id untuk PIN, per endpoint untuk login). Menambah lapisan nginx sebelum tahu lapisan aplikasi tidak cukup hanya menambah tempat yang harus di-tuning.
- **`PUBLIC_ORDER_URL` yang default ke `http://localhost:3012/order`** (`docker-compose.yml:145`) — QR meja yang dicetak akan berisi localhost kalau env lupa diisi. Perbaikannya ada di table-service (gagal keras kalau env tidak diset di produksi), bukan di compose. Masuk Modul 4.
- **`REDIS_URL` mati di auth-service & tenant-service.** Modul 2 Task 4 justru mulai memakainya di auth-service, jadi jangan dihapus. Yang di tenant-service ditinjau di Modul 3.
