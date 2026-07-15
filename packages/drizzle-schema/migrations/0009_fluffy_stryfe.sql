ALTER TABLE "inspirapos_v2"."tenants" ADD COLUMN "theme_color" varchar(10) DEFAULT '4' NOT NULL;--> statement-breakpoint
ALTER TABLE "inspirapos_v2"."tenants" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "inspirapos_v2"."tenants" ADD COLUMN "phone" varchar(20);