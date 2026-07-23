CREATE TABLE IF NOT EXISTS "inspirapos_v2"."restaurant_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"outlet_id" uuid,
	"label" varchar(50) NOT NULL,
	"seats" integer DEFAULT 2 NOT NULL,
	"status" varchar(20) DEFAULT 'available' NOT NULL,
	"qr_token" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "restaurant_tables_qr_token_unique" UNIQUE("qr_token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inspirapos_v2"."kitchen_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"served_at" timestamp with time zone,
	CONSTRAINT "kitchen_tickets_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inspirapos_v2"."ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"unit" varchar(20) NOT NULL,
	"stock_qty" integer DEFAULT 0 NOT NULL,
	"low_stock_threshold" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inspirapos_v2"."recipe_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"menu_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"qty_used" integer NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspirapos_v2"."restaurant_tables" ADD CONSTRAINT "restaurant_tables_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "inspirapos_v2"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspirapos_v2"."restaurant_tables" ADD CONSTRAINT "restaurant_tables_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "inspirapos_v2"."outlets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspirapos_v2"."kitchen_tickets" ADD CONSTRAINT "kitchen_tickets_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "inspirapos_v2"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspirapos_v2"."kitchen_tickets" ADD CONSTRAINT "kitchen_tickets_order_id_pos_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "inspirapos_v2"."pos_orders"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspirapos_v2"."ingredients" ADD CONSTRAINT "ingredients_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "inspirapos_v2"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspirapos_v2"."recipe_items" ADD CONSTRAINT "recipe_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "inspirapos_v2"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspirapos_v2"."recipe_items" ADD CONSTRAINT "recipe_items_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "inspirapos_v2"."menus"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspirapos_v2"."recipe_items" ADD CONSTRAINT "recipe_items_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "inspirapos_v2"."ingredients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
