import { pgTable, uuid, varchar, boolean, timestamp, text, jsonb, integer, date, inet } from 'drizzle-orm/pg-core';
import { inspirapos, users } from './auth.js';
import { tenants } from './tenant.js';
import { offline_clients } from './offline.js';

export const leads = inspirapos.table('leads', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  business_name: varchar('business_name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 30 }).notNull(),
  email: varchar('email', { length: 255 }),
  business_type: varchar('business_type', { length: 50 }), // umkm | kafe | restoran | fnb_lain | lainnya
  business_type_other: varchar('business_type_other', { length: 255 }), // diisi kalau business_type = 'lainnya'
  product_interest: varchar('product_interest', { length: 50 }), // offline | umkm | fnb | unknown
  status: varchar('status', { length: 30 }).notNull().default('baru'), // baru | dihubungi | deal | cancel | trial
  // set null (bukan cascade/restrict) — hapus permanen tenant hasil konversi lead tidak boleh
  // gagal gara-gara riwayat lead-nya; leads sendiri tetap ada, cuma link ke tenant putus.
  converted_tenant_id: uuid('converted_tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
  source: varchar('source', { length: 50 }).default('demo_form'),
  handled_by: uuid('handled_by').references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deleted_at: timestamp('deleted_at', { withTimezone: true }), // soft-delete — null = aktif
});

// History catatan lead — append-only (bukan 1 kolom overwrite) supaya admin bisa lihat
// kapan tiap catatan ditulis, termasuk catatan awal dari klien sendiri (saat pilih "Belum tahu").
export const lead_notes = inspirapos.table('lead_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  lead_id: uuid('lead_id').notNull().references(() => leads.id, { onDelete: 'cascade' }),
  note: text('note').notNull(),
  author: varchar('author', { length: 20 }).notNull().default('admin'), // client | admin
  created_by: uuid('created_by').references(() => users.id), // null kalau author = client
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const early_access_signups = inspirapos.table('early_access_signups', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }),
  phone: varchar('phone', { length: 20 }),
  status: varchar('status', { length: 30 }).notNull().default('waiting'), // waiting | notified | converted
  notified_at: timestamp('notified_at', { withTimezone: true }),
  converted_lead_id: uuid('converted_lead_id').references(() => leads.id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const billing_records = inspirapos.table('billing_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
  offline_client_id: uuid('offline_client_id').references(() => offline_clients.id, { onDelete: 'set null' }),
  type: varchar('type', { length: 30 }).notNull(), // subscription | buyout | license_offline | addon
  plan_code: varchar('plan_code', { length: 50 }),
  amount: integer('amount').notNull(), // dalam rupiah
  transfer_method: varchar('transfer_method', { length: 30 }), // bca | mandiri | bri | bni | qris
  reference_number: varchar('reference_number', { length: 100 }),
  period_start: date('period_start'),
  period_end: date('period_end'),
  notes: text('notes'),
  recorded_by: uuid('recorded_by').notNull().references(() => users.id),
  paid_at: date('paid_at').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const admin_audit_logs = inspirapos.table('admin_audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  admin_id: uuid('admin_id').notNull().references(() => users.id),
  action: varchar('action', { length: 100 }).notNull(),
  target_type: varchar('target_type', { length: 50 }),
  target_id: uuid('target_id'),
  target_name: varchar('target_name', { length: 255 }),
  before_state: jsonb('before_state'),
  after_state: jsonb('after_state'),
  ip_address: inet('ip_address'),
  user_agent: text('user_agent'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const notification_templates = inspirapos.table('notification_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  channel: varchar('channel', { length: 20 }).notNull(), // whatsapp | email | both
  subject: varchar('subject', { length: 255 }),
  body_wa: text('body_wa'),
  body_email: text('body_email'),
  is_system: boolean('is_system').notNull().default(false),
  is_active: boolean('is_active').notNull().default(true),
  updated_by: uuid('updated_by').references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
