#!/usr/bin/env bash
# Verifikasi nginx meneruskan IP klien yang benar: X-Forwarded-For kiriman
# klien DIABAIKAN, dan CF-Connecting-IP dari Cloudflare DIPAKAI sebagai IP
# klien. Butuh stack jalan: docker compose up -d
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

# /var/log/nginx/access.log di image nginx:alpine adalah symlink ke
# /dev/stdout. Itu BUKAN cara untuk membacanya dari luar container: sesi
# `docker compose exec` baru punya /dev/stdout sendiri (pipe balik ke sesi
# exec itu), bukan stdout milik proses PID 1 nginx — jadi `exec ... cat
# /var/log/nginx/access.log` tidak pernah melihat baris log yang sungguhan
# (macet menunggu, atau di sebagian lingkungan langsung dapat EOF kosong).
# Baris log PID 1 yang asli hanya terlihat lewat `docker compose logs`, jadi
# itu yang dipakai probe() di bawah, bukan cat dari dalam exec.
probe() {                                  # argumen tambahan diteruskan ke curl (mis. -H '...')
  local since
  since=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  curl -s -m 5 -o /dev/null "$@" -X POST "$GW/api/v1/auth/login" \
    -H 'Content-Type: application/json' -d '{}' 2>/dev/null
  # Probe dijalankan berurutan (bukan paralel), jadi resolusi detik dari
  # --since sudah cukup untuk memisahkan satu probe dari probe berikutnya;
  # tail -1 mengambil baris access log terakhir kalau ada baris error di
  # antaranya (mis. upstream belum siap).
  docker compose logs --since "$since" --no-log-prefix nginx 2>/dev/null | tail -1
}

echo "--- tanpa header palsu (baseline) ---"
line_clean=$(probe)
echo "$line_clean"

echo "--- dengan X-Forwarded-For palsu, tanpa CF-Connecting-IP (arah negatif) ---"
line_spoof=$(probe -H "X-Forwarded-For: 1.2.3.4")
echo "$line_spoof"

# Arah negatif: real_ip_header dipaku ke CF-Connecting-IP, jadi real_ip_module
# tidak pernah membaca X-Forwarded-For sama sekali — IP yang tercatat TIDAK
# BOLEH berubah jadi 1.2.3.4 hanya karena klien mengirim header itu.
xff_leaked=tidak
echo "$line_spoof" | grep -q '1\.2\.3\.4' && xff_leaked=ya
check "X-Forwarded-For kiriman klien diabaikan" "tidak" "$xff_leaked"

echo "--- dengan CF-Connecting-IP asli + X-Forwarded-For palsu (arah positif) ---"
line_cf=$(probe -H "CF-Connecting-IP: 9.9.9.9" -H "X-Forwarded-For: 1.2.3.4")
echo "$line_cf"

# Arah positif — ini yang sebelumnya TIDAK ADA sama sekali: membuktikan
# CF-Connecting-IP betul-betul DIPAKAI sebagai IP klien (bukan cuma XFF yang
# kebetulan diabaikan). Tanpa check ini, real_ip_header yang salah ketik ke
# header yang tidak pernah dikirim siapa pun juga akan "lolos" test di atas —
# real_ip_module tidak akan menimpa apa pun, dan XFF palsu tetap tidak masuk
# log, padahal fiturnya sama sekali tidak jalan.
cf_honored=tidak
echo "$line_cf" | grep -q '9\.9\.9\.9' && cf_honored=ya
check "CF-Connecting-IP dipakai sebagai IP klien" "ya" "$cf_honored"

# Cek keberadaan konfigurasi ini tautologis (cuma bukti string ada di file,
# bukan bukti real-IP betul-betul jalan) — dua check di atas yang jadi bukti
# fungsional. Dipertahankan karena tetap berguna kalau volume mount config
# salah / ke-mount file yang salah.
hdr_present=tidak
docker compose exec -T nginx grep -q "real_ip_header" /etc/nginx/nginx.conf 2>/dev/null && hdr_present=ya
check "real_ip_header terkonfigurasi" "ya" "$hdr_present"

exit $fail
