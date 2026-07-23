import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { createDb } from '@ipos-cloud/shared';
import {
  tenants, users, categories, menus, customers,
  pos_shifts, pos_orders, pos_order_items,
} from '@ipos-cloud/drizzle-schema';

// Bikin 1 tenant demo lengkap: menu, kasir, pelanggan, shift, dan transaksi 14 hari
// terakhir — buat gambaran UI "sudah dipakai", bukan tenant kosong baru daftar.
// Usage: npx tsx src/scripts/seed-demo.ts [nama-toko]
const storeName = process.argv[2] || 'Kedai Kopi Senja';
const OWNER_EMAIL = `demo-${Date.now()}@inspirapos.local`;
const OWNER_PASSWORD = 'Demo1234!';
const CASHIER_PASSWORD = 'Kasir1234!';

const MENU_ITEMS: { category: string; name: string; price: number }[] = [
  { category: 'Kopi', name: 'Kopi Susu Gula Aren', price: 18000 },
  { category: 'Kopi', name: 'Americano', price: 15000 },
  { category: 'Kopi', name: 'Cappuccino', price: 20000 },
  { category: 'Kopi', name: 'Es Kopi Susu', price: 17000 },
  { category: 'Non-Kopi', name: 'Matcha Latte', price: 22000 },
  { category: 'Non-Kopi', name: 'Coklat Panas', price: 18000 },
  { category: 'Non-Kopi', name: 'Teh Manis', price: 8000 },
  { category: 'Makanan', name: 'Roti Bakar Coklat', price: 15000 },
  { category: 'Makanan', name: 'Pisang Goreng Keju', price: 16000 },
  { category: 'Makanan', name: 'Nasi Goreng Spesial', price: 25000 },
  { category: 'Makanan', name: 'Mie Goreng', price: 20000 },
  { category: 'Snack', name: 'Kentang Goreng', price: 12000 },
  { category: 'Snack', name: 'Tahu Crispy', price: 10000 },
];

const CASHIERS = ['Dewi', 'Rian'];
const CUSTOMERS = [
  { name: 'Budi Santoso', phone: '081234567801' },
  { name: 'Sari Wulandari', phone: '081234567802' },
  { name: 'Ahmad Fadli', phone: '081234567803' },
];

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

async function main() {
  const db = createDb(process.env.DATABASE_URL!);

  const slug = storeName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);
  const [tenant] = await db.insert(tenants).values({
    name: storeName,
    slug,
    plan_code: 'umkm_pro',
    status: 'active',
    activated_at: new Date(),
    setup_completed_at: new Date(),
  }).returning();

  const [owner] = await db.insert(users).values({
    tenant_id: tenant.id, name: 'Pemilik Toko', email: OWNER_EMAIL,
    password_hash: await bcrypt.hash(OWNER_PASSWORD, 10), role: 'owner',
  }).returning();
  await db.update(tenants).set({ owner_id: owner.id }).where(eq(tenants.id, tenant.id));

  const cashierRows = [];
  for (const name of CASHIERS) {
    const [row] = await db.insert(users).values({
      tenant_id: tenant.id, name, email: `${name.toLowerCase()}-${tenant.id.slice(0, 8)}@inspirapos.local`,
      password_hash: await bcrypt.hash(CASHIER_PASSWORD, 10), role: 'cashier',
    }).returning();
    cashierRows.push(row);
  }

  const categoryNames = [...new Set(MENU_ITEMS.map((m) => m.category))];
  const categoryMap = new Map<string, string>();
  for (const [i, name] of categoryNames.entries()) {
    const [row] = await db.insert(categories).values({ tenant_id: tenant.id, name, sort_order: i }).returning();
    categoryMap.set(name, row.id);
  }

  const menuRows: (typeof menus.$inferSelect)[] = [];
  for (const [i, item] of MENU_ITEMS.entries()) {
    const [row] = await db.insert(menus).values({
      tenant_id: tenant.id, category_id: categoryMap.get(item.category),
      name: item.name, price: item.price, sort_order: i,
    }).returning();
    menuRows.push(row);
  }

  const customerRows = [];
  for (const c of CUSTOMERS) {
    const [row] = await db.insert(customers).values({ tenant_id: tenant.id, name: c.name, phone: c.phone }).returning();
    customerRows.push(row);
  }

  // 14 hari transaksi — beberapa shift per hari, beberapa order per shift.
  const DAYS = 14;
  let totalOrders = 0;
  for (let d = DAYS - 1; d >= 0; d--) {
    const dayStart = new Date();
    dayStart.setDate(dayStart.getDate() - d);
    dayStart.setHours(8, 0, 0, 0);

    const cashier = pick(cashierRows);
    const openedAt = new Date(dayStart);
    const closedAt = new Date(dayStart);
    closedAt.setHours(20, 0, 0, 0);

    const [shift] = await db.insert(pos_shifts).values({
      tenant_id: tenant.id, cashier_id: cashier.id, cashier_name: cashier.name,
      status: 'closed', opening_cash: 200000, closing_cash: 200000 + randInt(300000, 900000),
      opened_at: openedAt, closed_at: closedAt,
    }).returning();

    const ordersToday = randInt(6, 14);
    for (let o = 0; o < ordersToday; o++) {
      const lineCount = randInt(1, 4);
      const lines = Array.from({ length: lineCount }, () => pick(menuRows));
      const subtotal = lines.reduce((sum, m) => sum + m.price, 0);
      const paymentMethod = pick(['cash', 'qris', 'qris', 'cash'] as const);
      const customer = Math.random() < 0.3 ? pick(customerRows) : null;
      const createdAt = new Date(openedAt.getTime() + randInt(0, 11) * 3600000 + randInt(0, 59) * 60000);

      const [order] = await db.insert(pos_orders).values({
        id: crypto.randomUUID(),
        tenant_id: tenant.id, shift_id: shift.id, status: 'paid',
        subtotal, discount: 0, total: subtotal,
        payment_method: paymentMethod,
        cash_received: paymentMethod === 'cash' ? subtotal + pick([0, 5000, 10000, 20000]) : null,
        change_amount: paymentMethod === 'cash' ? pick([0, 5000, 10000, 20000]) : null,
        cashier_name: cashier.name,
        customer_id: customer?.id ?? null, customer_name: customer?.name ?? null,
        created_at: createdAt,
      }).returning();

      for (const m of lines) {
        await db.insert(pos_order_items).values({
          order_id: order.id, menu_id: m.id, product_name: m.name, price: m.price, qty: 1,
        });
      }
      totalOrders++;
    }
  }

  console.log('Demo tenant created:');
  console.log('  Tenant:', tenant.name, `(${tenant.slug})`);
  console.log('  Owner login:', OWNER_EMAIL, '/', OWNER_PASSWORD);
  console.log('  Kasir login:', cashierRows.map((c) => c.email).join(', '), '/', CASHIER_PASSWORD);
  console.log('  Menu:', menuRows.length, 'item di', categoryNames.length, 'kategori');
  console.log('  Pelanggan:', customerRows.length);
  console.log('  Transaksi:', totalOrders, 'order selama', DAYS, 'hari terakhir');
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
