import { pgTable, uuid, varchar, boolean, timestamp, text, integer } from 'drizzle-orm/pg-core';
import { inspirapos, users } from './auth.js';
import { tenants, outlets, customers } from './tenant.js';

export const pos_shifts = inspirapos.table('pos_shifts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  outlet_id: uuid('outlet_id').references(() => outlets.id, { onDelete: 'set null' }),
  cashier_id: uuid('cashier_id').notNull().references(() => users.id),
  cashier_name: varchar('cashier_name', { length: 255 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('open'),
  opening_cash: integer('opening_cash').notNull().default(0),
  closing_cash: integer('closing_cash'),
  opened_at: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
  closed_at: timestamp('closed_at', { withTimezone: true }),
  notes: text('notes'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pos_orders = inspirapos.table('pos_orders', {
  id: uuid('id').primaryKey(), // client-supplied UUID for offline-first
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  outlet_id: uuid('outlet_id').references(() => outlets.id, { onDelete: 'set null' }),
  shift_id: uuid('shift_id').references(() => pos_shifts.id, { onDelete: 'set null' }),
  status: varchar('status', { length: 20 }).notNull().default('paid'),
  subtotal: integer('subtotal').notNull(),
  discount: integer('discount').notNull().default(0),
  total: integer('total').notNull(),
  payment_method: varchar('payment_method', { length: 20 }).notNull(),
  cash_received: integer('cash_received'),
  change_amount: integer('change_amount'),
  cashier_name: varchar('cashier_name', { length: 255 }),
  customer_id: uuid('customer_id').references(() => customers.id, { onDelete: 'set null' }),
  customer_name: varchar('customer_name', { length: 255 }), // snapshot buat struk & histori
  loyalty_member_id: uuid('loyalty_member_id'), // tenant terpisah dari customers — earn poin (Resto Pro+)
  table_number: varchar('table_number', { length: 50 }),
  notes: text('notes'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull(), // from client
  synced_at: timestamp('synced_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pos_order_items = inspirapos.table('pos_order_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  order_id: uuid('order_id').notNull().references(() => pos_orders.id, { onDelete: 'cascade' }),
  menu_id: uuid('menu_id'),
  product_name: varchar('product_name', { length: 255 }).notNull(),
  variant_summary: text('variant_summary'), // snapshot variasi terpilih, mis. "Level 3, Extra Keju"
  price: integer('price').notNull(), // harga per unit SUDAH termasuk selisih variasi
  qty: integer('qty').notNull(),
  notes: text('notes'),
});
