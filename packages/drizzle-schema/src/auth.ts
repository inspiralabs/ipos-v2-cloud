import { pgTable, pgSchema, uuid, varchar, boolean, timestamp, inet, text, index } from 'drizzle-orm/pg-core';

export const inspirapos = pgSchema('inspirapos_v2');

export const users = inspirapos.table('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id'),
  outlet_id: uuid('outlet_id'),
  name: varchar('name', { length: 255 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  phone: varchar('phone', { length: 20 }),
  password_hash: varchar('password_hash', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull(), // super_admin | admin_staff | owner | cashier | kitchen_staff | waiter | manager
  pin_hash: varchar('pin_hash', { length: 255 }), // 4-digit PIN — login cepat ganti kasir di POS Resto, opsional
  is_active: boolean('is_active').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // users.tenant_id dipakai tenant-service untuk list staf; tidak punya FK jadi tidak dapat index gratis.
  tenantIdx: index('users_tenant_id_idx').on(t.tenant_id),
}));

export const sessions = inspirapos.table('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  refresh_token: varchar('refresh_token', { length: 255 }).notNull().unique(),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  ip_address: inet('ip_address'),
  user_agent: text('user_agent'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index('sessions_user_id_idx').on(t.user_id),
  // dipakai job pembersihan sesi kedaluwarsa (Task modul 2).
  expiresIdx: index('sessions_expires_at_idx').on(t.expires_at),
}));

export const otp_codes = inspirapos.table('otp_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  code: varchar('code', { length: 6 }).notNull(),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  used_at: timestamp('used_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  // verifikasi OTP mencari (user_id, code) bersamaan.
  userCodeIdx: index('otp_codes_user_id_code_idx').on(t.user_id, t.code),
}));

// token_hash, bukan token mentah — kalau DB bocor, token reset tidak langsung bisa dipakai ulang.
export const password_reset_tokens = inspirapos.table('password_reset_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  token_hash: varchar('token_hash', { length: 255 }).notNull().unique(),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  used_at: timestamp('used_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  userIdx: index('password_reset_tokens_user_id_idx').on(t.user_id),
}));
