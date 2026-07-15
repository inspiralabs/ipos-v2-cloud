ALTER TABLE "inspirapos_v2"."tenants" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inspirapos_v2"."offline_clients" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "inspirapos_v2"."leads" ADD COLUMN "deleted_at" timestamp with time zone;