import { buildInsights } from './insights';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
}

const summary = {
  total_omzet: 1_000_000,
  total_transactions: 20,
  avg_transaction: 50_000,
  previous_period: { total_omzet: 800_000, total_transactions: 15 },
  change_percent: 25,
};
const topMenu = [{ menu_id: 'a', product_name: 'Nasi Goreng', total_qty: 40, total_revenue: 800_000 }];
const bottomMenu = [{ menu_id: 'b', product_name: 'Es Teh Tawar', total_qty: 2, total_revenue: 6_000 }];
const peakHours = {
  by_hour: [
    { hour: 12, transaction_count: 10 },
    { hour: 18, transaction_count: 25 },
  ],
  by_day: [],
};

const insights = buildInsights(summary, topMenu, bottomMenu, peakHours, 'minggu lalu');

assert(insights.length === 4, 'menghasilkan 4 insight dari data lengkap');
assert(insights[0].message.includes('naik 25%'), 'trend positif menyebut persen naik');
assert(insights[0].severity === 'positive', 'trend naik severity positive');
assert(insights[1].message.includes('Nasi Goreng'), 'top menu menyebut nama menu terlaris');
assert(insights[2].message.includes('Es Teh Tawar'), 'bottom menu menyebut nama menu kurang laku');
assert(insights[3].message.includes('18:00'), 'peak hour memilih jam dengan transaksi terbanyak (18, bukan 12)');

const zeroSummary = { ...summary, previous_period: { total_omzet: 0, total_transactions: 0 }, change_percent: 0, total_omzet: 0 };
const emptyInsights = buildInsights(zeroSummary, [], null, null, 'minggu lalu');
assert(emptyInsights.length === 0, 'data kosong menghasilkan array kosong, bukan crash');

console.log('Semua assertion lolos.');
