import { pgTable, uuid, varchar, integer, timestamp, text, date } from 'drizzle-orm/pg-core';
import { inspirapos, users } from './auth.js';
import { tenants, outlets } from './tenant.js';
import { ingredients } from './bom.js';

// ── Transfer antar-cabang (Resto Pro & Business) ──────────────────────────────

export const branch_transfers = inspirapos.table('branch_transfers', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  from_outlet_id: uuid('from_outlet_id').notNull().references(() => outlets.id, { onDelete: 'cascade' }),
  to_outlet_id: uuid('to_outlet_id').notNull().references(() => outlets.id, { onDelete: 'cascade' }),
  status: varchar('status', { length: 20 }).notNull().default('pending'), // pending | approved | rejected
  reason: text('reason'),
  requested_by: uuid('requested_by').notNull().references(() => users.id),
  approved_by: uuid('approved_by').references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  decided_at: timestamp('decided_at', { withTimezone: true }),
});

export const branch_transfer_items = inspirapos.table('branch_transfer_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  transfer_id: uuid('transfer_id').notNull().references(() => branch_transfers.id, { onDelete: 'cascade' }),
  ingredient_id: uuid('ingredient_id').notNull().references(() => ingredients.id, { onDelete: 'cascade' }),
  qty: integer('qty').notNull(),
  unit: varchar('unit', { length: 20 }).notNull(), // snapshot ingredients.unit saat request dibuat
});

// ── Loyalty program (Resto Pro & Business) ────────────────────────────────────

// No HP = ID member, tanpa password by design (lihat handoff §19) — lookup saat checkout.
export const loyalty_members = inspirapos.table('loyalty_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 20 }).notNull(),
  points_balance: integer('points_balance').notNull().default(0),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const loyalty_point_logs = inspirapos.table('loyalty_point_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  member_id: uuid('member_id').notNull().references(() => loyalty_members.id, { onDelete: 'cascade' }),
  delta: integer('delta').notNull(), // positif = earn, negatif = redeem
  reason: varchar('reason', { length: 100 }).notNull(), // order_earn | manual_redeem | manual_adjust
  order_id: uuid('order_id'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const loyalty_broadcasts = inspirapos.table('loyalty_broadcasts', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  segment: varchar('segment', { length: 30 }).notNull(), // all | top_member | inactive_30d
  message: text('message').notNull(),
  recipient_count: integer('recipient_count').notNull().default(0),
  sent_by: uuid('sent_by').notNull().references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Absensi karyawan (bundled Resto Starter+) ─────────────────────────────────
// Staff = users yang sudah ada (role cashier/kitchen_staff/waiter/manager, sudah punya outlet_id) —
// PIN login cuma nambah pin_hash ke users (lihat auth.ts), bukan tabel staff terpisah.

export const attendance_logs = inspirapos.table('attendance_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  date: date('date').notNull(),
  clock_in_at: timestamp('clock_in_at', { withTimezone: true }),
  clock_out_at: timestamp('clock_out_at', { withTimezone: true }),
  status: varchar('status', { length: 20 }).notNull().default('hadir'), // hadir | telat | alpha
});

// ── Biaya operasional & waste (input manual owner, buat P&L / Laporan Waste) ──

export const operational_expenses = inspirapos.table('operational_expenses', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  outlet_id: uuid('outlet_id').references(() => outlets.id, { onDelete: 'set null' }),
  category: varchar('category', { length: 30 }).notNull(), // gaji | sewa | listrik | bahan_baku | lainnya
  amount: integer('amount').notNull(),
  note: text('note'),
  spent_at: date('spent_at').notNull(),
  created_by: uuid('created_by').notNull().references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const ingredient_waste_logs = inspirapos.table('ingredient_waste_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  ingredient_id: uuid('ingredient_id').notNull().references(() => ingredients.id, { onDelete: 'cascade' }),
  qty: integer('qty').notNull(),
  estimated_value: integer('estimated_value').notNull(), // qty * harga per satuan saat itu, snapshot
  reason: varchar('reason', { length: 100 }), // kadaluarsa | rusak | salah_masak | lainnya
  recorded_by: uuid('recorded_by').notNull().references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
