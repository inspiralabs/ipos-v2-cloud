CREATE TABLE IF NOT EXISTS "inspirapos_v2"."lead_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"note" text NOT NULL,
	"author" varchar(20) DEFAULT 'admin' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inspirapos_v2"."leads" ADD COLUMN "business_type_other" varchar(255);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspirapos_v2"."lead_notes" ADD CONSTRAINT "lead_notes_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "inspirapos_v2"."leads"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspirapos_v2"."lead_notes" ADD CONSTRAINT "lead_notes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "inspirapos_v2"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
