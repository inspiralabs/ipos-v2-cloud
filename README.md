# ipos-cloud

Monorepo pnpm untuk service-service Inspira POS (auth, tenant, catalog, pos, inventory, kitchen, table, report, notification, websocket-gateway) + apps (admin-app, tenant-app).

## Setup lokal

```bash
pnpm install
```

### 1. Isi `.env` per service

`.env` di-`.gitignore`, jadi tidak ke-clone dan tidak ada script yang otomatis bikinin. Tiap service di `services/*` baca `.env` dari folder-nya sendiri (karena `pnpm --filter` jalanin `dev` dengan cwd di folder service tsb), **bukan** dari `.env` di root.

1. Copy `.env.example` di root jadi `.env`, isi `DATABASE_URL`, `JWT_PRIVATE_KEY`/`JWT_PUBLIC_KEY`, dll.
2. Copy file `.env` itu ke tiap folder service yang butuh:

   ```bash
   for svc in auth-service tenant-service catalog-service pos-service inventory-service kitchen-service table-service report-service notification-service websocket-gateway; do
     cp .env "services/$svc/.env"
   done
   ```

   (PowerShell: `Get-ChildItem services -Directory | ForEach-Object { Copy-Item .env "services/$($_.Name)/.env" }`)

Tanpa ini, service yang pakai `JWT_PUBLIC_KEY`/`JWT_PRIVATE_KEY` (semua kecuali `notification-service`) bakal crash saat start dengan error `Cannot read properties of undefined (reading 'replace')`.

### 2. Build & jalankan

```bash
pnpm build:packages   # build @ipos-cloud/drizzle-schema & @ipos-cloud/shared
pnpm dev              # jalankan semua services/* secara paralel
```

Atau jalankan satu service saja: `pnpm dev:auth`, `pnpm dev:pos`, dst (lihat [package.json](package.json)).

## Database

```bash
pnpm db:generate   # generate migration dari schema (@ipos-cloud/drizzle-schema)
pnpm db:migrate    # apply migration
```

## Test & CI

Test pakai test runner bawaan Node (`node:test` + `node:assert`), dijalankan lewat `tsx` — tidak ada framework test tambahan.

```bash
pnpm test              # build packages, lalu jalankan semua test di workspace
pnpm --filter report-service test   # satu package saja
```

File test: `*.test.ts` di sebelah file yang ditest. Package yang belum punya test tinggal
tambah script `"test": "tsx --test \"src/**/*.test.ts\""` di `package.json`-nya.

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) jalan di setiap push ke `master` dan
setiap PR: `pnpm install --frozen-lockfile` → `build:packages` → `type-check` → `test`.
