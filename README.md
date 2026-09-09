# ipos-cloud

Backend (Fastify + Drizzle ORM + Postgres/Supabase), dikelola sebagai pnpm workspace.

Dashboard Next.js (`admin-app`, `tenant-app`) sudah dipindah keluar dari workspace ini ke
[`../apps/`](../apps/) — keduanya app berdiri sendiri (tidak import paket workspace apa pun,
cuma fetch REST ke backend di sini), jadi dijalankan/di-deploy terpisah dari `ipos-cloud`.

Setup lengkap (JWT keys, `.env`, migration, dst) ada di [../MENJALANKAN.md](../MENJALANKAN.md) —
dokumen ini cuma peta folder + perintah cepat.

## Struktur

- `services/` — microservices Fastify: `auth-service` (3001), `tenant-service` (3002),
  `pos-service` (3003), `catalog-service` (3004), `inventory-service` (3005),
  `kitchen-service` (3006), `table-service` (3007), `report-service` (3008),
  `notification-service` (3009), `websocket-gateway` (3011).
- `packages/drizzle-schema` — satu sumber schema Postgres (`inspirapos_v2`) dipakai semua service.
- `packages/shared` — util bersama (`createDb`, audit log, feature gate, dll).

Dashboard-nya sendiri (di `../apps/`):
- `admin-app` (3010) — dashboard internal tim Inspira POS: kelola tenant, lisensi offline,
  dan **leads** dari form `/demo` landing-page.
- `tenant-app` (3012) — dashboard untuk klien (tenant).

## Jalankan cepat

```powershell
pnpm install
pnpm build:packages       # build drizzle-schema + shared dulu (dibutuhkan semua service)

# Backend — pilih salah satu:
docker-compose up         # semua service + nginx gateway sekaligus (recommended untuk admin-app)
# atau manual per service:
pnpm dev:auth
pnpm dev:tenant

# Dashboard (folder terpisah, npm biasa — bukan bagian pnpm workspace ini)
cd ../apps/admin-app && npm run dev   # http://localhost:3010
```

## Bikin user admin pertama

```powershell
cd services/auth-service
npx tsx src/scripts/seed-admin.ts <email> <password> ["Nama"] [role]
```

Lihat [../MENJALANKAN.md](../MENJALANKAN.md) bagian A7 & C1 untuk detail (termasuk kenapa
`admin-app` butuh nginx/Docker Compose untuk bisa login).
