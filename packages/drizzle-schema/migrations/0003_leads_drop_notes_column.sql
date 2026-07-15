-- Salin isi leads.notes lama (kalau ada) jadi baris pertama history di lead_notes,
-- supaya catatan admin yang sudah ditulis sebelum migrasi ini tidak hilang.
INSERT INTO "inspirapos_v2"."lead_notes" ("lead_id", "note", "author", "created_at")
SELECT "id", "notes", 'admin', "updated_at"
FROM "inspirapos_v2"."leads"
WHERE "notes" IS NOT NULL AND "notes" <> '';
--> statement-breakpoint
ALTER TABLE "inspirapos_v2"."leads" DROP COLUMN IF EXISTS "notes";
