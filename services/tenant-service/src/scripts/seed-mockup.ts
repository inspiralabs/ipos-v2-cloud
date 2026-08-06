import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { createDb } from '@ipos-cloud/shared';
import { tenants, users } from '@ipos-cloud/drizzle-schema';
import type { TenantPlan } from '@ipos-cloud/shared';
import { seedUmkmMockup } from './mockup/umkm.js';
import { seedRestoMockup } from './mockup/resto.js';

// Buat 1 tenant baru (trial, setup BELUM selesai — owner lanjut Setup Wizard manual) + isi data
// contoh sesuai tier. Beda dari seed-demo.ts: tenant ini bukan "sudah dipakai", tapi starting
// point buat testing fitur — owner tetap yang isi profil toko/printer/dst dari Setup Wizard.
// Usage: npx tsx src/scripts/seed-mockup.ts <umkm|resto> [nama-toko]
const kind = process.argv[2] as 'umkm' | 'resto';
if (kind !== 'umkm' && kind !== 'resto') {
  console.error('Usage: npx tsx src/scripts/seed-mockup.ts <umkm|resto> [nama-toko]');
  process.exit(1);
}
const storeName = process.argv[3] || (kind === 'umkm' ? 'Kedai Kopi Senja' : 'Rumah Makan Nusantara');
const plan: TenantPlan = kind === 'umkm' ? 'umkm_pro' : 'resto_business';
const OWNER_EMAIL = `demo-${kind}-${Date.now()}@inspirapos.local`;
const OWNER_PASSWORD = 'Demo1234!';

async function main() {
  const db = createDb(process.env.DATABASE_URL!);

  const slug = storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);
  const [tenant] = await db.insert(tenants).values({
    name: storeName, slug, plan_code: plan, status: 'trial',
    trial_ends_at: new Date(Date.now() + 14 * 24 * 3600 * 1000),
    // setup_completed_at sengaja null — owner login lalu lanjut Setup Wizard manual.
  }).returning();

  const [owner] = await db.insert(users).values({
    tenant_id: tenant.id, name: 'Pemilik Toko', email: OWNER_EMAIL,
    password_hash: await bcrypt.hash(OWNER_PASSWORD, 10), role: 'owner',
  }).returning();
  await db.update(tenants).set({ owner_id: owner.id }).where(eq(tenants.id, tenant.id));

  const summary = kind === 'umkm' ? await seedUmkmMockup(db, tenant.id) : await seedRestoMockup(db, tenant.id);

  console.log('\n=== Mockup tenant dibuat ===');
  console.log('Tenant :', tenant.name, `(${tenant.slug})`);
  console.log('Plan   :', plan);
  console.log('Owner  :', OWNER_EMAIL, '/', OWNER_PASSWORD);
  console.log('\nRingkasan data:');
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}
main().catch((err) => { console.error(err); process.exit(1); });
