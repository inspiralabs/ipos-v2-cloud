#!/usr/bin/env bash
# Smoke test setelah deploy (dijalankan deploy.sh di host VPS). Exit 0 = lulus: tiap domain dijawab tanpa 5xx.
set -euo pipefail
for h in api admindash tenant; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -H "Host: $h.inspirapos.biz.id" http://127.0.0.1/)
  [[ $code =~ ^[1-4] ]] || { echo "$h.inspirapos.biz.id → HTTP $code"; exit 1; }
done
