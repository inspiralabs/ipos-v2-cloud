# Dockerfile generik untuk semua service Fastify di workspace ini (services/*).
# Build context = root ipos-cloud/ (bukan folder service itu sendiri) supaya bisa
# meng-copy packages/drizzle-schema & packages/shared yang dipakai lewat workspace:*.
# Pilih service lewat build arg SERVICE_NAME (harus sama dengan "name" di package.json-nya).

FROM node:22-alpine AS base
RUN npm install -g pnpm@9
WORKDIR /app

FROM base AS deps
# ponytail: copy manifests only, so `pnpm install` layer stays cached unless a
# package.json/lockfile actually changed — editing service source no longer reinstalls.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/drizzle-schema/package.json packages/drizzle-schema/
COPY packages/shared/package.json packages/shared/
COPY services/auth-service/package.json services/auth-service/
COPY services/catalog-service/package.json services/catalog-service/
COPY services/inventory-service/package.json services/inventory-service/
COPY services/kitchen-service/package.json services/kitchen-service/
COPY services/notification-service/package.json services/notification-service/
COPY services/pos-service/package.json services/pos-service/
COPY services/report-service/package.json services/report-service/
COPY services/table-service/package.json services/table-service/
COPY services/tenant-service/package.json services/tenant-service/
COPY services/websocket-gateway/package.json services/websocket-gateway/
RUN pnpm install --frozen-lockfile

FROM deps AS build
ARG SERVICE_NAME
COPY . .
RUN pnpm --filter @ipos-cloud/drizzle-schema build \
 && pnpm --filter @ipos-cloud/shared build \
 && pnpm --filter ${SERVICE_NAME} build

FROM base AS runtime
ARG SERVICE_NAME
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/services/${SERVICE_NAME}
CMD ["node", "dist/index.js"]
