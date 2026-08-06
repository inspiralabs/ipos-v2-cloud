import bcrypt from 'bcryptjs';
import {
  users, categories, menus, variant_groups, variant_options, menu_variant_groups,
  stock_levels, customers, pos_shifts, pos_orders, pos_order_items,
} from '@ipos-cloud/drizzle-schema';
import type { Db } from '@ipos-cloud/shared';
import { randInt, pick, daysAgo } from './helpers.js';

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
  { name: 'Budi Santoso', phone: '0812-3456-7801' },
  { name: 'Sari Wulandari', phone: '0812-3456-7802' },
  { name: 'Ahmad Fadli', phone: '0812-3456-7803' },
];

/** Isi data contoh UMKM Lite/Pro: kategori, menu + varian, stok, kasir, pelanggan, riwayat transaksi 14 hari. */
export async function seedUmkmMockup(db: Db, tenantId: string) {
  const cashierRows: (typeof users.$inferSelect)[] = [];
  for (const name of CASHIERS) {
    const [row] = await db.insert(users).values({
      tenant_id: tenantId, name, email: `${name.toLowerCase()}-${tenantId.slice(0, 8)}@inspirapos.local`,
      password_hash: await bcrypt.hash(CASHIER_PASSWORD, 10), role: 'cashier',
    }).returning();
    cashierRows.push(row);
  }

  const categoryNames = [...new Set(MENU_ITEMS.map((m) => m.category))];
  const categoryMap = new Map<string, string>();
  for (const [i, name] of categoryNames.entries()) {
    const [row] = await db.insert(categories).values({ tenant_id: tenantId, name, sort_order: i }).returning();
    categoryMap.set(name, row.id);
  }

  // Modifier "Level Gula" dipasang ke semua menu Kopi/Non-Kopi — contoh variasi tanpa ubah harga.
  const [sweetnessGroup] = await db.insert(variant_groups).values({
    tenant_id: tenantId, name: 'Level Gula', selection: 'single', required: false,
  }).returning();
  for (const [i, name] of ['Normal', 'Less Sugar', 'No Sugar'].entries()) {
    await db.insert(variant_options).values({ group_id: sweetnessGroup.id, tenant_id: tenantId, name, price_delta: 0, sort_order: i });
  }

  const menuRows: (typeof menus.$inferSelect)[] = [];
  for (const [i, item] of MENU_ITEMS.entries()) {
    const [row] = await db.insert(menus).values({
      tenant_id: tenantId, category_id: categoryMap.get(item.category),
      name: item.name, price: item.price, sort_order: i,
    }).returning();
    menuRows.push(row);
    await db.insert(stock_levels).values({ tenant_id: tenantId, menu_id: row.id, stock_qty: randInt(15, 60), low_stock_threshold: 10 });
    if (item.category === 'Kopi' || item.category === 'Non-Kopi') {
      await db.insert(menu_variant_groups).values({ menu_id: row.id, variant_group_id: sweetnessGroup.id, tenant_id: tenantId });
    }
  }

  const customerRows: (typeof customers.$inferSelect)[] = [];
  for (const c of CUSTOMERS) {
    const [row] = await db.insert(customers).values({ tenant_id: tenantId, name: c.name, phone: c.phone }).returning();
    customerRows.push(row);
  }

  const DAYS = 14;
  let totalOrders = 0;
  for (let d = DAYS - 1; d >= 0; d--) {
    const cashier = pick(cashierRows);
    const openedAt = daysAgo(d, 8, 0);
    const closedAt = daysAgo(d, 20, 0);

    const [shift] = await db.insert(pos_shifts).values({
      tenant_id: tenantId, cashier_id: cashier.id, cashier_name: cashier.name,
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
        tenant_id: tenantId, shift_id: shift.id, status: 'paid',
        subtotal, discount: 0, total: subtotal,
        payment_method: paymentMethod,
        cash_received: paymentMethod === 'cash' ? subtotal + pick([0, 5000, 10000, 20000]) : null,
        change_amount: paymentMethod === 'cash' ? pick([0, 5000, 10000, 20000]) : null,
        cashier_name: cashier.name,
        customer_id: customer?.id ?? null, customer_name: customer?.name ?? null,
        created_at: createdAt,
      }).returning();

      for (const m of lines) {
        await db.insert(pos_order_items).values({ order_id: order.id, menu_id: m.id, product_name: m.name, price: m.price, qty: 1 });
      }
      totalOrders++;
    }
  }

  return {
    cashiers: cashierRows.map((c) => ({ email: c.email, password: CASHIER_PASSWORD })),
    menuCount: menuRows.length,
    categoryCount: categoryNames.length,
    customerCount: customerRows.length,
    orderCount: totalOrders,
  };
}
