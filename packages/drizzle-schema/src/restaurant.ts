import { pgTable, uuid, varchar, integer, timestamp, text } from 'drizzle-orm/pg-core';
import { inspirapos } from './auth.js';
import { tenants, outlets } from './tenant.js';
import { pos_orders } from './pos.js';

// Meja fisik di outlet — floor map & QR self-order (fitur Resto, semua tier).
export const restaurant_tables = inspirapos.table('restaurant_tables', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  outlet_id: uuid('outlet_id').references(() => outlets.id, { onDelete: 'set null' }),
  label: varchar('label', { length: 50 }).notNull(), // "Meja 1", "VIP 2"
  seats: integer('seats').notNull().default(2),
  status: varchar('status', { length: 20 }).notNull().default('available'), // available | occupied | reserved | cleaning
  zone: varchar('zone', { length: 20 }).notNull().default('indoor'), // indoor | outdoor | vip
  shape: varchar('shape', { length: 20 }).notNull().default('persegi'), // persegi | bundar | oval
  position_x: integer('position_x').notNull().default(0), // posisi tile di canvas floor map, persen (0-100)
  position_y: integer('position_y').notNull().default(0),
  qr_token: varchar('qr_token', { length: 100 }).notNull().unique(), // dipakai di /order/{qr_token} untuk QR self-order
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Satu tiket dapur per order (KDS) — status berpindah pending -> cooking -> ready -> served.
export const kitchen_tickets = inspirapos.table('kitchen_tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  order_id: uuid('order_id').notNull().references(() => pos_orders.id, { onDelete: 'cascade' }).unique(),
  status: varchar('status', { length: 20 }).notNull().default('pending'), // pending | cooking | ready | served
  station: varchar('station', { length: 20 }).notNull().default('dapur'), // dapur | bar — multi-station (Resto Business)
  notes: text('notes'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  started_at: timestamp('started_at', { withTimezone: true }),
  ready_at: timestamp('ready_at', { withTimezone: true }),
  served_at: timestamp('served_at', { withTimezone: true }),
});
