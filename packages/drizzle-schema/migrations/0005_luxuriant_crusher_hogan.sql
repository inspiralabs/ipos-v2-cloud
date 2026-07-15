ALTER TABLE "inspirapos_v2"."leads" DROP CONSTRAINT "leads_converted_tenant_id_tenants_id_fk";
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inspirapos_v2"."leads" ADD CONSTRAINT "leads_converted_tenant_id_tenants_id_fk" FOREIGN KEY ("converted_tenant_id") REFERENCES "inspirapos_v2"."tenants"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
