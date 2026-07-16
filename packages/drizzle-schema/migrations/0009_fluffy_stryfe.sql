-- This migration adds "address" and "phone" columns to "tenants" for the Profil Toko redesign.
-- It also bundles a catch-up "theme_color" column that was added to the Drizzle schema in an
-- earlier, untracked session and has been relied upon by the running app (theme-picker feature)
-- ever since, but never had a migration generated for it until this file. Because drizzle-kit
-- generate diffs the whole schema, that catch-up ADD COLUMN got bundled in here alongside the
-- two genuinely new columns. It is guarded with IF NOT EXISTS below since it's unknown whether
-- theme_color already exists on any given target database.
-- IMPORTANT: This migration MUST be applied via `pnpm --filter @ipos-cloud/drizzle-schema db:migrate`
-- before the address/phone fields (and the Profil Toko page that now asks for them) will work in
-- production. Until it is run, saving a profile with an address will fail with a Postgres
-- "column does not exist" error surfaced to the end user as a generic toast.
ALTER TABLE "inspirapos_v2"."tenants" ADD COLUMN IF NOT EXISTS "theme_color" varchar(10) DEFAULT '4' NOT NULL;--> statement-breakpoint
ALTER TABLE "inspirapos_v2"."tenants" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "inspirapos_v2"."tenants" ADD COLUMN "phone" varchar(20);
