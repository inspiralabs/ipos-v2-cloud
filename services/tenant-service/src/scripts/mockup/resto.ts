import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import {
  users, categories, menus, variant_groups, variant_options, menu_variant_groups,
  pos_shifts, pos_orders, pos_order_items,
  outlets,
  restaurant_tables, kitchen_tickets,
  ingredients, recipe_items,
  loyalty_members, loyalty_point_logs, attendance_logs, operational_expenses, ingredient_waste_logs,
} from '@ipos-cloud/drizzle-schema';
import type { Db } from '@ipos-cloud/shared';
import { randInt, pick, daysAgo } from './helpers.js';

const STAFF_PASSWORD = 'Staff1234!';

const MENU_ITEMS: { category: string; name: string; price: number; recipe: { ingredient: string; qty: number }[] }[] = [
  { category: 'Makanan Utama', name: 'Nasi Goreng Kampung', price: 32000, recipe: [{ ingredient: 'Beras', qty: 200 }, { ingredient: 'Telur', qty: 60 }, { ingredient: 'Ayam Fillet', qty: 100 }] },
  { category: 'Makanan Utama', name: 'Ayam Bakar Madu', price: 38000, recipe: [{ ingredient: 'Ayam Fillet', qty: 250 }, { ingredient: 'Madu', qty: 30 }] },
  { category: 'Makanan Utama', name: 'Sop Buntut', price: 55000, recipe: [{ ingredient: 'Buntut Sapi', qty: 300 }, { ingredient: 'Wortel', qty: 80 }] },
  { category: 'Makanan Utama', name: 'Mie Ayam Jamur', price: 28000, recipe: [{ ingredient: 'Mie Telur', qty: 150 }, { ingredient: 'Ayam Fillet', qty: 80 }, { ingredient: 'Jamur', qty: 50 }] },
  { category: 'Appetizer', name: 'Tahu Tek', price: 22000, recipe: [{ ingredient: 'Tahu', qty: 150 }, { ingredient: 'Kacang Tanah', qty: 40 }] },
  { category: 'Appetizer', name: 'Salad Buah Segar', price: 25000, recipe: [{ ingredient: 'Buah Campur', qty: 200 }] },
  { category: 'Minuman', name: 'Es Teh Manis', price: 8000, recipe: [{ ingredient: 'Teh Celup', qty: 5 }, { ingredient: 'Gula', qty: 20 }] },
  { category: 'Minuman', name: 'Jus Alpukat', price: 18000, recipe: [{ ingredient: 'Alpukat', qty: 150 }, { ingredient: 'Susu Kental Manis', qty: 30 }] },
  { category: 'Minuman', name: 'Es Kopi Susu Gula Aren', price: 20000, recipe: [{ ingredient: 'Kopi Bubuk', qty: 20 }, { ingredient: 'Gula Aren', qty: 25 }] },
  { category: 'Dessert', name: 'Pisang Goreng Coklat Keju', price: 18000, recipe: [{ ingredient: 'Pisang', qty: 200 }, { ingredient: 'Coklat Batang', qty: 30 }] },
];

const INGREDIENTS: { name: string; unit: string; costPerUnit: number; stock: number; threshold: number }[] = [
  { name: 'Beras', unit: 'gram', costPerUnit: 15, stock: 30000, threshold: 5000 },
  { name: 'Telur', unit: 'gram', costPerUnit: 25, stock: 12000, threshold: 2000 },
  { name: 'Ayam Fillet', unit: 'gram', costPerUnit: 40, stock: 15000, threshold: 3000 },
  { name: 'Buntut Sapi', unit: 'gram', costPerUnit: 90, stock: 8000, threshold: 2000 },
  { name: 'Wortel', unit: 'gram', costPerUnit: 12, stock: 5000, threshold: 1000 },
  { name: 'Mie Telur', unit: 'gram', costPerUnit: 18, stock: 10000, threshold: 2000 },
  { name: 'Jamur', unit: 'gram', costPerUnit: 30, stock: 4000, threshold: 800 },
  { name: 'Tahu', unit: 'gram', costPerUnit: 10, stock: 6000, threshold: 1000 },
  { name: 'Kacang Tanah', unit: 'gram', costPerUnit: 22, stock: 3000, threshold: 500 },
  { name: 'Buah Campur', unit: 'gram', costPerUnit: 35, stock: 4000, threshold: 800 },
  { name: 'Teh Celup', unit: 'pcs', costPerUnit: 300, stock: 500, threshold: 100 },
  { name: 'Gula', unit: 'gram', costPerUnit: 14, stock: 10000, threshold: 2000 },
  { name: 'Alpukat', unit: 'gram', costPerUnit: 28, stock: 5000, threshold: 1000 },
  { name: 'Susu Kental Manis', unit: 'ml', costPerUnit: 20, stock: 4000, threshold: 800 },
  { name: 'Kopi Bubuk', unit: 'gram', costPerUnit: 90, stock: 3000, threshold: 500 },
  { name: 'Gula Aren', unit: 'gram', costPerUnit: 35, stock: 4000, threshold: 800 },
  { name: 'Madu', unit: 'ml', costPerUnit: 80, stock: 2000, threshold: 400 },
  { name: 'Pisang', unit: 'gram', costPerUnit: 10, stock: 6000, threshold: 1200 },
  { name: 'Coklat Batang', unit: 'gram', costPerUnit: 60, stock: 3000, threshold: 500 },
];

const OUTLET_NAMES = ['Cabang Kemang', 'Cabang BSD', 'Cabang Bandung'];
const WAITERS = ['Yoga', 'Nadia'];
const KITCHEN_STAFF = ['Chef Bayu', 'Chef Rani'];
const CASHIERS = ['Putri', 'Fajar'];
const MANAGER_NAME = 'Manager Dita';

const MEMBERS = [
  { name: 'Hendra Wijaya', phone: '0813-1111-2001' },
  { name: 'Lina Marlina', phone: '0813-1111-2002' },
  { name: 'Doni Pratama', phone: '0813-1111-2003' },
  { name: 'Citra Ayu', phone: '0813-1111-2004' },
];

/** Isi data contoh Resto Pro/Business: multi-cabang, meja + KDS, BOM bahan baku, staff, membership, absensi, biaya operasional. */
export async function seedRestoMockup(db: Db, tenantId: string) {
  // ── Cabang ──────────────────────────────────────────────────────────────
  const outletRows: (typeof outlets.$inferSelect)[] = [];
  for (const name of OUTLET_NAMES) {
    const [row] = await db.insert(outlets).values({ tenant_id: tenantId, name, address: `Jl. ${name.split(' ')[1]} No. ${randInt(1, 99)}`, is_active: true }).returning();
    outletRows.push(row);
  }
  const mainOutlet = outletRows[0];

  // ── Staff (waiter, dapur, kasir tersebar di tiap cabang; manager di kantor pusat) ──
  const [manager] = await db.insert(users).values({
    tenant_id: tenantId, outlet_id: mainOutlet.id, name: MANAGER_NAME,
    email: `manager-${tenantId.slice(0, 8)}@inspirapos.local`, password_hash: await bcrypt.hash(STAFF_PASSWORD, 10), role: 'manager',
  }).returning();

  async function makeStaff(name: string, role: string, outletId: string) {
    const [row] = await db.insert(users).values({
      tenant_id: tenantId, outlet_id: outletId, name,
      email: `${name.toLowerCase().replace(/\s+/g, '.')}-${tenantId.slice(0, 8)}@inspirapos.local`,
      password_hash: await bcrypt.hash(STAFF_PASSWORD, 10), pin_hash: await bcrypt.hash(String(randInt(1000, 9999)), 10), role,
    }).returning();
    return row;
  }
  const waiterRows = await Promise.all(WAITERS.map((n) => makeStaff(n, 'waiter', mainOutlet.id)));
  const kitchenRows = await Promise.all(KITCHEN_STAFF.map((n) => makeStaff(n, 'kitchen_staff', mainOutlet.id)));
  const cashierRows = await Promise.all(CASHIERS.map((n, i) => makeStaff(n, 'cashier', outletRows[i % outletRows.length].id)));
  const allStaff = [manager, ...waiterRows, ...kitchenRows, ...cashierRows];

  // ── Kategori & menu + BOM resep ────────────────────────────────────────
  const categoryNames = [...new Set(MENU_ITEMS.map((m) => m.category))];
  const categoryMap = new Map<string, string>();
  for (const [i, name] of categoryNames.entries()) {
    const [row] = await db.insert(categories).values({ tenant_id: tenantId, name, sort_order: i }).returning();
    categoryMap.set(name, row.id);
  }

  const ingredientMap = new Map<string, typeof ingredients.$inferSelect>();
  for (const ing of INGREDIENTS) {
    const [row] = await db.insert(ingredients).values({
      tenant_id: tenantId, name: ing.name, unit: ing.unit,
      stock_qty: ing.stock, low_stock_threshold: ing.threshold, cost_per_unit: ing.costPerUnit,
    }).returning();
    ingredientMap.set(ing.name, row);
  }

  const [spicyGroup] = await db.insert(variant_groups).values({ tenant_id: tenantId, name: 'Level Pedas', selection: 'single', required: true }).returning();
  for (const [i, name] of ['Tidak Pedas', 'Pedas Sedang', 'Extra Pedas'].entries()) {
    await db.insert(variant_options).values({ group_id: spicyGroup.id, tenant_id: tenantId, name, price_delta: name === 'Extra Pedas' ? 3000 : 0, sort_order: i });
  }

  const menuRows: (typeof menus.$inferSelect)[] = [];
  for (const [i, item] of MENU_ITEMS.entries()) {
    const [row] = await db.insert(menus).values({
      tenant_id: tenantId, category_id: categoryMap.get(item.category),
      name: item.name, price: item.price, sort_order: i,
    }).returning();
    menuRows.push(row);
    for (const r of item.recipe) {
      const ing = ingredientMap.get(r.ingredient)!;
      await db.insert(recipe_items).values({ tenant_id: tenantId, menu_id: row.id, ingredient_id: ing.id, qty_used: r.qty });
    }
    if (item.category === 'Makanan Utama') {
      await db.insert(menu_variant_groups).values({ menu_id: row.id, variant_group_id: spicyGroup.id, tenant_id: tenantId });
    }
  }

  // ── Meja per cabang (floor map + QR self-order) ────────────────────────
  const tableRows: (typeof restaurant_tables.$inferSelect)[] = [];
  for (const outlet of outletRows) {
    const tableCount = randInt(6, 10);
    for (let i = 1; i <= tableCount; i++) {
      const [row] = await db.insert(restaurant_tables).values({
        tenant_id: tenantId, outlet_id: outlet.id, label: `Meja ${i}`,
        seats: pick([2, 2, 4, 4, 6]), zone: pick(['indoor', 'indoor', 'outdoor', 'vip']),
        shape: pick(['persegi', 'bundar']), position_x: randInt(5, 90), position_y: randInt(5, 90),
        qr_token: randomBytes(12).toString('hex'),
      }).returning();
      tableRows.push(row);
    }
  }

  // ── Membership (loyalty) ───────────────────────────────────────────────
  const memberRows: (typeof loyalty_members.$inferSelect)[] = [];
  for (const m of MEMBERS) {
    const [row] = await db.insert(loyalty_members).values({ tenant_id: tenantId, name: m.name, phone: m.phone, points_balance: randInt(50, 800) }).returning();
    memberRows.push(row);
    await db.insert(loyalty_point_logs).values({ tenant_id: tenantId, member_id: row.id, delta: row.points_balance, reason: 'manual_adjust' });
  }

  // ── Absensi 14 hari untuk semua staff ───────────────────────────────────
  const DAYS = 14;
  for (let d = DAYS - 1; d >= 0; d--) {
    for (const staff of allStaff) {
      const status = pick(['hadir', 'hadir', 'hadir', 'hadir', 'telat', 'alpha'] as const);
      const date = daysAgo(d);
      if (status === 'alpha') {
        await db.insert(attendance_logs).values({ tenant_id: tenantId, user_id: staff.id, date: date.toISOString().slice(0, 10), status });
        continue;
      }
      const clockIn = daysAgo(d, status === 'telat' ? 9 : 8, randInt(0, 30));
      const clockOut = daysAgo(d, 17, randInt(0, 45));
      await db.insert(attendance_logs).values({ tenant_id: tenantId, user_id: staff.id, date: date.toISOString().slice(0, 10), clock_in_at: clockIn, clock_out_at: clockOut, status });
    }
  }

  // ── Biaya operasional (buat P&L) ────────────────────────────────────────
  const EXPENSE_CATEGORIES = ['gaji', 'sewa', 'listrik', 'bahan_baku', 'lainnya'];
  for (let d = DAYS - 1; d >= 0; d -= 3) {
    await db.insert(operational_expenses).values({
      tenant_id: tenantId, outlet_id: pick(outletRows).id, category: pick(EXPENSE_CATEGORIES),
      amount: randInt(150000, 3500000), note: 'Biaya operasional harian', spent_at: daysAgo(d).toISOString().slice(0, 10), created_by: manager.id,
    });
  }

  // ── Waste log bahan baku ────────────────────────────────────────────────
  for (let i = 0; i < 5; i++) {
    const ing = pick([...ingredientMap.values()]);
    const qty = randInt(50, 500);
    await db.insert(ingredient_waste_logs).values({
      tenant_id: tenantId, ingredient_id: ing.id, qty, estimated_value: qty * ing.cost_per_unit,
      reason: pick(['kadaluarsa', 'rusak', 'salah_masak']), recorded_by: manager.id, created_at: daysAgo(randInt(0, DAYS)),
    });
  }

  // ── Shift + order (dine-in dengan meja, self-order QR, KDS ticket) per cabang ──
  let totalOrders = 0;
  let totalTickets = 0;
  for (let d = DAYS - 1; d >= 0; d--) {
    for (const outlet of outletRows) {
      const cashier = pick(cashierRows.filter((c) => c.outlet_id === outlet.id)) ?? pick(cashierRows);
      const openedAt = daysAgo(d, 10, 0);
      const closedAt = daysAgo(d, 22, 0);
      const [shift] = await db.insert(pos_shifts).values({
        tenant_id: tenantId, outlet_id: outlet.id, cashier_id: cashier.id, cashier_name: cashier.name,
        status: 'closed', opening_cash: 500000, closing_cash: 500000 + randInt(800000, 2500000),
        opened_at: openedAt, closed_at: closedAt,
      }).returning();

      const outletTables = tableRows.filter((t) => t.outlet_id === outlet.id);
      const ordersToday = randInt(8, 18);
      for (let o = 0; o < ordersToday; o++) {
        const lineCount = randInt(1, 5);
        const lines = Array.from({ length: lineCount }, () => pick(menuRows));
        const subtotal = lines.reduce((sum, m) => sum + m.price, 0);
        const paymentMethod = pick(['cash', 'qris', 'qris'] as const);
        const member = Math.random() < 0.35 ? pick(memberRows) : null;
        const table = pick(outletTables);
        const createdAt = new Date(openedAt.getTime() + randInt(0, 11) * 3600000 + randInt(0, 59) * 60000);

        const [order] = await db.insert(pos_orders).values({
          id: crypto.randomUUID(),
          tenant_id: tenantId, outlet_id: outlet.id, shift_id: shift.id, status: 'paid',
          subtotal, discount: 0, total: subtotal, payment_method: paymentMethod,
          cash_received: paymentMethod === 'cash' ? subtotal + pick([0, 5000, 10000]) : null,
          change_amount: paymentMethod === 'cash' ? pick([0, 5000, 10000]) : null,
          cashier_name: cashier.name, loyalty_member_id: member?.id ?? null,
          table_number: table.label, created_at: createdAt,
        }).returning();

        for (const m of lines) {
          await db.insert(pos_order_items).values({ order_id: order.id, menu_id: m.id, product_name: m.name, price: m.price, qty: 1 });
        }

        const ticketCreated = createdAt;
        const startedAt = new Date(ticketCreated.getTime() + randInt(1, 4) * 60000);
        const readyAt = new Date(startedAt.getTime() + randInt(5, 15) * 60000);
        const servedAt = new Date(readyAt.getTime() + randInt(1, 5) * 60000);
        await db.insert(kitchen_tickets).values({
          tenant_id: tenantId, order_id: order.id, status: 'served', station: pick(['dapur', 'dapur', 'bar']),
          created_at: ticketCreated, started_at: startedAt, ready_at: readyAt, served_at: servedAt,
        });
        totalTickets++;
        totalOrders++;
      }
    }
  }

  return {
    outlets: outletRows.map((o) => o.name),
    manager: { email: manager.email, password: STAFF_PASSWORD },
    waiters: waiterRows.map((w) => ({ email: w.email, password: STAFF_PASSWORD })),
    kitchenStaff: kitchenRows.map((k) => ({ email: k.email, password: STAFF_PASSWORD })),
    cashiers: cashierRows.map((c) => ({ email: c.email, password: STAFF_PASSWORD })),
    menuCount: menuRows.length,
    ingredientCount: ingredientMap.size,
    tableCount: tableRows.length,
    memberCount: memberRows.length,
    orderCount: totalOrders,
    kitchenTicketCount: totalTickets,
  };
}
