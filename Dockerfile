# Dockerfile generik untuk semua service Fastify di workspace ini (services/*).
# Build context = root ipos-cloud/ (bukan folder service itu sendiri) supaya bisa
# meng-copy packages/drizzle-schema & packages/shared yang dipakai lewat workspace:*.
# Pilih service lewat build arg SERVICE_NAME (harus sama dengan "name" di package.json-nya).

FROM node:22-alpine AS base
RUN npm install -g pnpm@9
WORKDIR /app

FROM base AS deps
COPY . .
RUN pnpm install --frozen-lockfile

FROM deps AS build
ARG SERVICE_NAME
RUN pnpm --filter @ipos-cloud/drizzle-schema build \
 && pnpm --filter @ipos-cloud/shared build \
 && pnpm --filter ${SERVICE_NAME} build

FROM base AS runtime
ARG SERVICE_NAME
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/services/${SERVICE_NAME}
CMD ["node", "dist/index.js"]
