'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { apiFetch } from '@/lib/auth';
import { useTenant } from '@/components/layout/TenantContext';
import { hasFeature } from '@/lib/plan-features';
import { buildInsights, type SalesSummary, type MenuRank, type PeakHours } from '@/lib/insights';
import { formatRupiah } from '@/lib/format';
import { DateRangePicker, rangeFor, type DateRange } from '@/components/insight/DateRangePicker';
import { InsightCard } from '@/components/insight/InsightCard';
import { MenuRankTable } from '@/components/insight/MenuRankTable';
import { PlanGate } from '@/components/PlanGate';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export default function InsightPage() {
  const { tenant } = useTenant();
  const [range, setRange] = useState<DateRange>(rangeFor('week'));
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [topMenu, setTopMenu] = useState<MenuRank[]>([]);
  const [bottomMenu, setBottomMenu] = useState<MenuRank[] | null>(null);
  const [peakHours, setPeakHours] = useState<PeakHours | null>(null);
  const [loading, setLoading] = useState(true);

  const canAdvanced = hasFeature(tenant.plan, 'advanced_report');

  useEffect(() => {
    setLoading(true);
    const qs = `from=${range.from}&to=${range.to}`;
    Promise.all([
      apiFetch(`/api/v1/reports/sales-summary?${qs}`),
      apiFetch(`/api/v1/reports/top-menu?${qs}&limit=5`),
      canAdvanced ? apiFetch(`/api/v1/reports/bottom-menu?${qs}&limit=5`).catch(() => null) : Promise.resolve(null),
      canAdvanced ? apiFetch(`/api/v1/reports/peak-hours?${qs}`).catch(() => null) : Promise.resolve(null),
    ])
      .then(([s, t, b, p]) => {
        setSummary(s);
        setTopMenu(t);
        setBottomMenu(b);
        setPeakHours(p);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range.from, range.to, canAdvanced]);

  const insights = summary ? buildInsights(summary, topMenu, bottomMenu, peakHours, 'periode sebelumnya') : [];

  return (
    <div className="min-h-dvh bg-[var(--bg)]">
      <header className="sticky top-0 z-10 flex flex-col gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex h-11 w-11 items-center justify-center rounded-lg text-[var(--ink)] hover:bg-[var(--surface-2)]"
            aria-label="Kembali ke dashboard"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <p className="text-xs text-[var(--muted)]">{tenant.name}</p>
            <h1 className="text-lg font-bold text-[var(--ink)]">Insight Penjualan</h1>
          </div>
        </div>
        <DateRangePicker value={range} onChange={setRange} />
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {loading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : (
          <motion.div
            className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
          >
            {insights.map((insight, i) => (
              <InsightCard key={i} insight={insight} />
            ))}
          </motion.div>
        )}

        {!loading && summary && (
          <>
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>Tren Omzet</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart
                    data={[
                      { label: 'Periode Sebelumnya', omzet: summary.previous_period.total_omzet },
                      { label: 'Periode Ini', omzet: summary.total_omzet },
                    ]}
                  >
                    <XAxis dataKey="label" stroke="var(--muted)" fontSize={12} />
                    <YAxis stroke="var(--muted)" fontSize={12} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
                    <Tooltip formatter={(value: number) => formatRupiah(value)} />
                    <Line type="monotone" dataKey="omzet" stroke="var(--primary)" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <MenuRankTable title="Menu Terlaris" rows={topMenu} emptyMessage="Belum ada transaksi di periode ini." />
              <PlanGate featureKey="advanced_report" featureLabel="Menu kurang laku">
                <MenuRankTable title="Menu Kurang Laku" rows={bottomMenu ?? []} emptyMessage="Belum ada data." />
              </PlanGate>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
