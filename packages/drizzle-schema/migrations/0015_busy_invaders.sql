CREATE TABLE IF NOT EXISTS "inspirapos_v2"."branch_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"from_outlet_id" uuid NOT NULL,
	"to_outlet_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"reason" text,
	"requested_by" uuid NOT NULL,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inspirapos_v2"."branch_transfer_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transfer_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"qty" integer NOT NULL,
	"unit" varchar(20) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inspirapos_v2"."loyalty_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"phone" varchar(20) NOT NULL,
	"points_balance" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inspirapos_v2"."loyalty_point_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"delta" integer NOT NULL,
	"reason" varchar(100) NOT NULL,
	"order_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inspirapos_v2"."loyalty_broadcasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"segment" varchar(30) NOT NULL,
	"message" text NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"sent_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inspirapos_v2"."attendance_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"clock_in_at" timestamp with time zone,
	"clock_out_at" timestamp with time zone,
	"status" varchar(20) DEFAULT 'hadir' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inspirapos_v2"."operational_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"outlet_id" uuid,
	"category" varchar(30) NOT NULL,
	"amount" integer NOT NULL,
	"note" text,
	"spent_at" date NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inspirapos_v2"."ingredient_waste_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"ingredient_id" uuid NOT NULL,
	"qty" integer NOT NULL,
	"estimated_value" integer NOT NULL,
	"reason" varchar(100),
	"recorded_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inspirapos_v2"."users" ADD COLUMN "pin_hash" varchar(255);--> statement-breakpoint
ALTER TABLE "inspirapos_v2"."pos_orders" ADD COLUMN "loyalty_member_id" uuid;--> statement-breakpoint
ALTER TABLE "inspirapos_v2"."ingredients" ADD COLUMN "cost_per_unit" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspirapos_v2"."branch_transfers" ADD CONSTRAINT "branch_transfers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "inspirapos_v2"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspirapos_v2"."branch_transfers" ADD CONSTRAINT "branch_transfers_from_outlet_id_outlets_id_fk" FOREIGN KEY ("from_outlet_id") REFERENCES "inspirapos_v2"."outlets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspirapos_v2"."branch_transfers" ADD CONSTRAINT "branch_transfers_to_outlet_id_outlets_id_fk" FOREIGN KEY ("to_outlet_id") REFERENCES "inspirapos_v2"."outlets"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspirapos_v2"."branch_transfers" ADD CONSTRAINT "branch_transfers_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "inspirapos_v2"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspirapos_v2"."branch_transfers" ADD CONSTRAINT "branch_transfers_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "inspirapos_v2"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspirapos_v2"."branch_transfer_items" ADD CONSTRAINT "branch_transfer_items_transfer_id_branch_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "inspirapos_v2"."branch_transfers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspirapos_v2"."branch_transfer_items" ADD CONSTRAINT "branch_transfer_items_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "inspirapos_v2"."ingredients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspirapos_v2"."loyalty_members" ADD CONSTRAINT "loyalty_members_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "inspirapos_v2"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspirapos_v2"."loyalty_point_logs" ADD CONSTRAINT "loyalty_point_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "inspirapos_v2"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspirapos_v2"."loyalty_point_logs" ADD CONSTRAINT "loyalty_point_logs_member_id_loyalty_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "inspirapos_v2"."loyalty_members"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspirapos_v2"."loyalty_broadcasts" ADD CONSTRAINT "loyalty_broadcasts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "inspirapos_v2"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspirapos_v2"."loyalty_broadcasts" ADD CONSTRAINT "loyalty_broadcasts_sent_by_users_id_fk" FOREIGN KEY ("sent_by") REFERENCES "inspirapos_v2"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspirapos_v2"."attendance_logs" ADD CONSTRAINT "attendance_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "inspirapos_v2"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspirapos_v2"."attendance_logs" ADD CONSTRAINT "attendance_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "inspirapos_v2"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspirapos_v2"."operational_expenses" ADD CONSTRAINT "operational_expenses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "inspirapos_v2"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspirapos_v2"."operational_expenses" ADD CONSTRAINT "operational_expenses_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "inspirapos_v2"."outlets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspirapos_v2"."operational_expenses" ADD CONSTRAINT "operational_expenses_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "inspirapos_v2"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspirapos_v2"."ingredient_waste_logs" ADD CONSTRAINT "ingredient_waste_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "inspirapos_v2"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspirapos_v2"."ingredient_waste_logs" ADD CONSTRAINT "ingredient_waste_logs_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "inspirapos_v2"."ingredients"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspirapos_v2"."ingredient_waste_logs" ADD CONSTRAINT "ingredient_waste_logs_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "inspirapos_v2"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
