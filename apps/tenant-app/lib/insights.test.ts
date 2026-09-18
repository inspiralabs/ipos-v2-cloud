import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInsights } from './insights';

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

test('data lengkap menghasilkan 4 insight yang benar', () => {
  const insights = buildInsights(summary, topMenu, bottomMenu, peakHours, 'minggu lalu');
  assert.equal(insights.length, 4);
  assert.match(insights[0].message, /naik 25%/);
  assert.equal(insights[0].severity, 'positive');
  assert.match(insights[1].message, /Nasi Goreng/);
  assert.match(insights[2].message, /Es Teh Tawar/);
  assert.match(insights[3].message, /18:00/, 'peak hour memilih jam transaksi terbanyak (18, bukan 12)');
});

test('data kosong menghasilkan array kosong, bukan crash', () => {
  const zeroSummary = {
    ...summary,
    total_omzet: 0,
    change_percent: 0,
    previous_period: { total_omzet: 0, total_transactions: 0 },
  };
  assert.deepEqual(buildInsights(zeroSummary, [], null, null, 'minggu lalu'), []);
});
