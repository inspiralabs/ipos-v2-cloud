#!/usr/bin/env bash
# cara menjalankan build.sh ini:
# chmod +x build.sh
# nohup ./build.sh > build.log 2>&1 &
# disown
# tail -f build.log

set -e

docker compose build auth-service catalog-service inventory-service
docker compose build kitchen-service pos-service report-service
docker compose build table-service tenant-service websocket-gateway
docker compose build notification-service admin-app tenant-app
docker compose up -d
