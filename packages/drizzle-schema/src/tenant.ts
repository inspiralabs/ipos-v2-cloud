import { pgTable, uuid, varchar, boolean, timestamp, text, jsonb } from 'drizzle-orm/pg-core';
import { inspirapos, users } from './auth.js';

export const tenants = inspirapos.table('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  owner_id: uuid('owner_id').references(() => users.id),
  plan_code: varchar('plan_code', { length: 50 }).notNull().default('trial'),
  status: varchar('status', { length: 30 }).notNull().default('trial'), // trial | active | suspended | expired
  trial_ends_at: timestamp('trial_ends_at', { withTimezone: true }),
  activated_at: timestamp('activated_at', { withTimezone: true }),
  timezone: varchar('timezone', { length: 100 }).notNull().default('Asia/Jakarta'),
  logo_url: varchar('logo_url', { length: 500 }),
  theme_color: varchar('theme_color', { length: 10 }).notNull().default('4'), // hue preset (lihat tenant-app hooks/useThemeColor.ts) — '4' = maroon default
  address: text('address'),
  phone: varchar('phone', { length: 20 }),
  setup_completed_at: timestamp('setup_completed_at', { withTimezone: true }),
  notes: text('notes'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deleted_at: timestamp('deleted_at', { withTimezone: true }), // soft-delete — null = aktif
});

export const outlets = inspirapos.table('outlets', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  address: text('address'),
  phone: varchar('phone', { length: 20 }),
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tenant_feature_overrides = inspirapos.table('tenant_feature_overrides', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  feature_key: varchar('feature_key', { length: 100 }).notNull(),
  is_enabled: boolean('is_enabled').notNull(),
  set_by: uuid('set_by').references(() => users.id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Buku alamat pelanggan toko — nama + no HP, dipilih opsional saat transaksi (nama muncul di struk).
export const customers = inspirapos.table('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 20 }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
