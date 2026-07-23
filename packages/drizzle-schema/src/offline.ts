import { pgTable, uuid, varchar, timestamp, text } from 'drizzle-orm/pg-core';
import { inspirapos, users } from './auth.js';

export const offline_clients = inspirapos.table('offline_clients', {
  id: uuid('id').primaryKey().defaultRandom(),
  device_id_hash: varchar('device_id_hash', { length: 255 }).notNull().unique(),
  store_name: varchar('store_name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 20 }).notNull(),
  status: varchar('status', { length: 30 }).notNull().default('trial'), // trial | active_lite | active_pro | expired
  trial_ends_at: timestamp('trial_ends_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deleted_at: timestamp('deleted_at', { withTimezone: true }), // soft-delete — null = aktif
});

export const offline_licenses = inspirapos.table('offline_licenses', {
  id: uuid('id').primaryKey().defaultRandom(),
  client_id: uuid('client_id').notNull().references(() => offline_clients.id),
  license_key: varchar('license_key', { length: 20 }).notNull().unique(), // XXXX-XXXX-XXXX-XXXX
  plan: varchar('plan', { length: 10 }).notNull(), // lite | pro
  status: varchar('status', { length: 20 }).notNull().default('active'), // active | revoked
  generated_by: uuid('generated_by').references(() => users.id),
  notes: text('notes'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revoked_at: timestamp('revoked_at', { withTimezone: true }),
  revoked_by: uuid('revoked_by').references(() => users.id),
});
