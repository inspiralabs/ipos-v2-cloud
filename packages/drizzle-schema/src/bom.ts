import { pgTable, uuid, varchar, integer, timestamp } from 'drizzle-orm/pg-core';
import { inspirapos } from './auth.js';
import { tenants } from './tenant.js';
import { menus } from './catalog.js';

// Bahan baku mentah (beda dari stock_levels di catalog.ts, yang stoknya per-menu jadi barang).
export const ingredients = inspirapos.table('ingredients', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  unit: varchar('unit', { length: 20 }).notNull(), // gram, ml, pcs, dst
  stock_qty: integer('stock_qty').notNull().default(0), // dalam satuan terkecil (mis. gram), bukan pecahan
  low_stock_threshold: integer('low_stock_threshold').notNull().default(0),
  cost_per_unit: integer('cost_per_unit').notNull().default(0), // harga beli per satuan terkecil (Rp) — dasar hitung HPP/food cost
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// BOM: resep menu = daftar bahan baku + qty terpakai per satu porsi.
export const recipe_items = inspirapos.table('recipe_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  menu_id: uuid('menu_id').notNull().references(() => menus.id, { onDelete: 'cascade' }),
  ingredient_id: uuid('ingredient_id').notNull().references(() => ingredients.id, { onDelete: 'cascade' }),
  qty_used: integer('qty_used').notNull(), // satuan sama dengan ingredients.unit
});
