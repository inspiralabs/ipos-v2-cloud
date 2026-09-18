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
