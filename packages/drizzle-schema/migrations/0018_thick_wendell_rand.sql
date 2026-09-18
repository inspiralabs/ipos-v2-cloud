-- Dedupe menu_variant_groups: sisakan satu baris per (menu_id, variant_group_id).
-- Tabel ini tidak punya kolom id, jadi dedupe memakai ctid (alamat fisik baris).
DELETE FROM "inspirapos_v2"."menu_variant_groups" a
  USING "inspirapos_v2"."menu_variant_groups" b
  WHERE a.ctid > b.ctid
    AND a.menu_id = b.menu_id
    AND a.variant_group_id = b.variant_group_id;
--> statement-breakpoint

-- Dedupe attendance_logs: sisakan baris paling lengkap per (tenant_id, user_id, date).
-- Tabel ini TIDAK punya kolom created_at (sudah diverifikasi, resto.ts:65-73), jadi
-- urutan memakai clock_out_at lalu clock_in_at — baris yang sudah clock-out dimenangkan.
DELETE FROM "inspirapos_v2"."attendance_logs"
  WHERE id NOT IN (
    SELECT DISTINCT ON (tenant_id, user_id, date) id
      FROM "inspirapos_v2"."attendance_logs"
      ORDER BY tenant_id, user_id, date,
               clock_out_at DESC NULLS LAST,
               clock_in_at DESC NULLS LAST
  );
--> statement-breakpoint

ALTER TABLE "inspirapos_v2"."menu_variant_groups" ADD CONSTRAINT "menu_variant_groups_menu_id_variant_group_id_pk" PRIMARY KEY("menu_id","variant_group_id");--> statement-breakpoint
ALTER TABLE "inspirapos_v2"."attendance_logs" ADD CONSTRAINT "attendance_logs_tenant_id_user_id_date_unique" UNIQUE("tenant_id","user_id","date");
