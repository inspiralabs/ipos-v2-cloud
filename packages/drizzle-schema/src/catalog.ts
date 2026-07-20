import { pgTable, uuid, varchar, boolean, timestamp, text, integer } from 'drizzle-orm/pg-core';
import { inspirapos } from './auth.js';
import { tenants } from './tenant.js';

export const categories = inspirapos.table('categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  sort_order: integer('sort_order').notNull().default(0),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const menus = inspirapos.table('menus', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  category_id: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  price: integer('price').notNull(),
  discount_price: integer('discount_price'), // harga promo terhitung; null = tanpa diskon. Kalau ada, price jadi harga coret.
  discount_type: varchar('discount_type', { length: 10 }), // 'nominal' | 'percent' | null — sumber kebenaran, discount_price dihitung ulang dari ini
  discount_value: integer('discount_value'), // nominal Rp, atau persen 0-100 (tergantung discount_type)
  image_url: varchar('image_url', { length: 500 }),
  is_active: boolean('is_active').notNull().default(true),
  is_sold_out: boolean('is_sold_out').notNull().default(false),
  sort_order: integer('sort_order').notNull().default(0),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Grup variasi tersimpan (mis. "Level Pedas") — dibuat sekali, dipasang ke banyak menu.
export const variant_groups = inspirapos.table('variant_groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  selection: varchar('selection', { length: 10 }).notNull().default('single'), // single | multi
  required: boolean('required').notNull().default(false),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const variant_options = inspirapos.table('variant_options', {
  id: uuid('id').primaryKey().defaultRandom(),
  group_id: uuid('group_id').notNull().references(() => variant_groups.id, { onDelete: 'cascade' }),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  price_delta: integer('price_delta').notNull().default(0), // selisih harga; bisa 0 atau negatif
  sort_order: integer('sort_order').notNull().default(0),
});

// Pasang grup variasi ke menu (many-to-many).
export const menu_variant_groups = inspirapos.table('menu_variant_groups', {
  menu_id: uuid('menu_id').notNull().references(() => menus.id, { onDelete: 'cascade' }),
  variant_group_id: uuid('variant_group_id').notNull().references(() => variant_groups.id, { onDelete: 'cascade' }),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
});

export const stock_levels = inspirapos.table('stock_levels', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  menu_id: uuid('menu_id').notNull().references(() => menus.id, { onDelete: 'cascade' }).unique(),
  stock_qty: integer('stock_qty').notNull().default(0),
  low_stock_threshold: integer('low_stock_threshold').notNull().default(5),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
