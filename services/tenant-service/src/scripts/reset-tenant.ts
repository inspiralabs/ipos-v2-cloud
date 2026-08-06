import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { createDb } from '@ipos-cloud/shared';
import { tenants, users } from '@ipos-cloud/drizzle-schema';

// Hapus tenant + user turunannya (users.tenant_id bukan FK cascade, jadi harus dihapus manual).
// Semua tabel lain (menus, pos_orders, dst) sudah onDelete: 'cascade' ke tenants.id.
// Usage: npx tsx src/scripts/reset-tenant.ts <tenant-id>
const tenantId = process.argv[2];
if (!tenantId) {
  console.error('Usage: npx tsx src/scripts/reset-tenant.ts <tenant-id>');
  process.exit(1);
}

async function main() {
  const db = createDb(process.env.DATABASE_URL!);
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) {
    console.error('Tenant tidak ditemukan:', tenantId);
    process.exit(1);
  }
  // Urutan wajib: lepas owner_id (FK ke users) -> hapus tenant (cascade semua tabel ber-tenant_id,
  // termasuk pos_shifts yang FK ke users.id) -> baru users aman dihapus.
  await db.update(tenants).set({ owner_id: null }).where(eq(tenants.id, tenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  const deletedUsers = await db.delete(users).where(eq(users.tenant_id, tenantId)).returning({ id: users.id });
  console.log(`Deleted tenant "${tenant.name}" (${tenant.slug}) + ${deletedUsers.length} user(s).`);
  process.exit(0);
}
main();
