import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { createDb } from '@ipos-cloud/shared';
import { users } from '@ipos-cloud/drizzle-schema';

// Buat/update user admin-app: npx tsx src/scripts/seed-admin.ts <email> <password> [nama] [role]
const [, , email, password, name = 'Admin', role = 'super_admin'] = process.argv;

if (!email || !password) {
  console.error('Usage: npx tsx src/scripts/seed-admin.ts <email> <password> [nama] [role=super_admin|admin_staff]');
  process.exit(1);
}

async function main() {
  const db = createDb(process.env.DATABASE_URL!);
  const password_hash = await bcrypt.hash(password, 10);

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing) {
    await db.update(users).set({ password_hash, role, is_active: true }).where(eq(users.id, existing.id));
    console.log(`Updated existing user ${email} -> role=${role}`);
  } else {
    await db.insert(users).values({ name, email, password_hash, role });
    console.log(`Created ${role} ${email}`);
  }
  process.exit(0);
}

main();
