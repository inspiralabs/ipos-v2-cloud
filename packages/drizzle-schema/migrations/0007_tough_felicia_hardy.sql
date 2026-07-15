CREATE TABLE IF NOT EXISTS "inspirapos_v2"."customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"phone" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inspirapos_v2"."variant_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"selection" varchar(10) DEFAULT 'single' NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inspirapos_v2"."variant_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"price_delta" integer DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inspirapos_v2"."menu_variant_groups" (
	"menu_id" uuid NOT NULL,
	"variant_group_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inspirapos_v2"."menus" ADD COLUMN "discount_price" integer;--> statement-breakpoint
ALTER TABLE "inspirapos_v2"."pos_orders" ADD COLUMN "customer_id" uuid;--> statement-breakpoint
ALTER TABLE "inspirapos_v2"."pos_orders" ADD COLUMN "customer_name" varchar(255);--> statement-breakpoint
ALTER TABLE "inspirapos_v2"."pos_order_items" ADD COLUMN "variant_summary" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspirapos_v2"."customers" ADD CONSTRAINT "customers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "inspirapos_v2"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspirapos_v2"."variant_groups" ADD CONSTRAINT "variant_groups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "inspirapos_v2"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspirapos_v2"."variant_options" ADD CONSTRAINT "variant_options_group_id_variant_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "inspirapos_v2"."variant_groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspirapos_v2"."variant_options" ADD CONSTRAINT "variant_options_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "inspirapos_v2"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspirapos_v2"."menu_variant_groups" ADD CONSTRAINT "menu_variant_groups_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "inspirapos_v2"."menus"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspirapos_v2"."menu_variant_groups" ADD CONSTRAINT "menu_variant_groups_variant_group_id_variant_groups_id_fk" FOREIGN KEY ("variant_group_id") REFERENCES "inspirapos_v2"."variant_groups"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspirapos_v2"."menu_variant_groups" ADD CONSTRAINT "menu_variant_groups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "inspirapos_v2"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspirapos_v2"."pos_orders" ADD CONSTRAINT "pos_orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "inspirapos_v2"."customers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
