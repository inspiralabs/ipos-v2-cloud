import { and, eq, inArray, isNull, isNotNull } from 'drizzle-orm';
import type { Db } from './db.js';
import { logAdminAction } from './audit.js';

interface SoftDeleteOpts {
  db: Db;
  table: any; // tabel drizzle dengan kolom id + deleted_at — lihat catatan tipe di plan
  nameColumn: any; // kolom dipakai sebagai nama tampilan di audit log (name / store_name / dst)
  targetType: string; // 'tenant' | 'lead' | 'offline_client' — prefix action & targetType di audit log
  adminId: string;
  ipAddress?: string;
}

/** Hapus sementara satu baris. null kalau id tidak ada / sudah terhapus (operasi no-op, tidak di-log). */
export async function softDeleteOne(opts: SoftDeleteOpts & { id: string }) {
  const { db, table, nameColumn, id, targetType, adminId, ipAddress } = opts;
  const [deleted] = await db.update(table).set({ deleted_at: new Date() })
    .where(and(eq(table.id, id), isNull(table.deleted_at)))
    .returning({ id: table.id, name: nameColumn });
  if (!deleted) return null;
  await logAdminAction(db, { adminId, action: `${targetType}.deleted`, targetType, targetId: deleted.id, targetName: deleted.name, ipAddress });
  return deleted;
}

/** Pulihkan satu baris yang sudah dihapus sementara. null kalau id tidak ada / belum terhapus. */
export async function restoreOne(opts: SoftDeleteOpts & { id: string }) {
  const { db, table, nameColumn, id, targetType, adminId, ipAddress } = opts;
  const [restored] = await db.update(table).set({ deleted_at: null })
    .where(and(eq(table.id, id), isNotNull(table.deleted_at)))
    .returning({ id: table.id, name: nameColumn });
  if (!restored) return null;
  await logAdminAction(db, { adminId, action: `${targetType}.restored`, targetType, targetId: restored.id, targetName: restored.name, ipAddress });
  return restored;
}

/** Hapus sementara banyak baris sekaligus (action bar "N terpilih") — satu audit log untuk seluruh batch. */
export async function softDeleteBulk(opts: SoftDeleteOpts & { ids: string[] }) {
  const { db, table, nameColumn, ids, targetType, adminId, ipAddress } = opts;
  const rows = await db.update(table).set({ deleted_at: new Date() })
    .where(and(inArray(table.id, ids), isNull(table.deleted_at)))
    .returning({ id: table.id, name: nameColumn });
  await logAdminAction(db, {
    adminId, action: `${targetType}.bulk_deleted`, targetType,
    targetName: rows.map((r: any) => r.name).join(', '), after: { ids: rows.map((r: any) => r.id) }, ipAddress,
  });
  return rows;
}
