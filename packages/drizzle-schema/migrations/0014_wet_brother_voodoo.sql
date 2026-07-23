ALTER TABLE "inspirapos_v2"."restaurant_tables" ADD COLUMN "zone" varchar(20) DEFAULT 'indoor' NOT NULL;--> statement-breakpoint
ALTER TABLE "inspirapos_v2"."restaurant_tables" ADD COLUMN "shape" varchar(20) DEFAULT 'persegi' NOT NULL;--> statement-breakpoint
ALTER TABLE "inspirapos_v2"."restaurant_tables" ADD COLUMN "position_x" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inspirapos_v2"."restaurant_tables" ADD COLUMN "position_y" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "inspirapos_v2"."kitchen_tickets" ADD COLUMN "station" varchar(20) DEFAULT 'dapur' NOT NULL;