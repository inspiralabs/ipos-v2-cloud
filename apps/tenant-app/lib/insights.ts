export type SalesSummary = {
  total_omzet: number;
  total_transactions: number;
  avg_transaction: number;
  previous_period: { total_omzet: number; total_transactions: number };
  change_percent: number;
};

export type MenuRank = { menu_id: string | null; product_name: string; total_qty: number; total_revenue: number };

export type PeakHours = {
  by_hour: Array<{ hour: number; transaction_count: number }>;
  by_day: Array<{ day_of_week: number; transaction_count: number }>;
};

export type Insight = {
  type: 'trend' | 'top_menu' | 'bottom_menu' | 'peak_hour';
  message: string;
  severity: 'positive' | 'neutral' | 'warning';
};

const DAY_NAMES = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/** periodLabel adalah teks bebas untuk disisipkan di kalimat, mis. "minggu lalu" atau "bulan lalu". */
export function buildInsights(
  summary: SalesSummary,
  topMenu: MenuRank[],
  bottomMenu: MenuRank[] | null,
  peakHours: PeakHours | null,
  periodLabel: string
): Insight[] {
  const insights: Insight[] = [];

  if (summary.previous_period.total_omzet > 0 || summary.total_omzet > 0) {
    if (summary.change_percent > 0) {
      insights.push({
        type: 'trend',
        message: `Omzet naik ${summary.change_percent}% dibanding ${periodLabel} — pertahankan!`,
        severity: 'positive',
      });
    } else if (summary.change_percent < 0) {
      insights.push({
        type: 'trend',
        message: `Omzet turun ${Math.abs(summary.change_percent)}% dibanding ${periodLabel}`,
        severity: 'warning',
      });
    }
  }

  if (topMenu.length > 0) {
    const top = topMenu[0];
    insights.push({
      type: 'top_menu',
      message: `${top.product_name} jadi menu terlaris — ${top.total_qty} porsi terjual`,
      severity: 'positive',
    });
  }

  if (bottomMenu && bottomMenu.length > 0) {
    const bottom = bottomMenu[0];
    insights.push({
      type: 'bottom_menu',
      message: `${bottom.product_name} kurang laku (${bottom.total_qty} porsi) — coba promo atau evaluasi menu ini`,
      severity: 'warning',
    });
  }

  if (peakHours && peakHours.by_hour.length > 0) {
    const busiest = peakHours.by_hour.reduce((max, cur) => (cur.transaction_count > max.transaction_count ? cur : max));
    insights.push({
      type: 'peak_hour',
      message: `Jam tersibukmu: ${busiest.hour}:00 — siapkan stok & staf ekstra`,
      severity: 'neutral',
    });
  }

  return insights;
}

export { DAY_NAMES };
