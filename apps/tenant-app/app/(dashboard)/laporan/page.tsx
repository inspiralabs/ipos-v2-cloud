'use client';

import { useEffect, useState } from 'react';
import { Download, TrendingUp, Receipt } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { apiFetch } from '@/lib/auth';
import { formatRupiah } from '@/lib/format';
import { PlanGate } from '@/components/PlanGate';
import { PeriodSwitcher, rangeForPeriod, granularityForPeriod, type Period, type DateRange } from '@/components/insight/DateRangePicker';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

type SalesSummary = { total_omzet: number; total_transactions: number; avg_transaction: number; change_percent: number };
type TimeseriesPoint = { bucket: string; omzet: number; transaction_count: number };

function HeroSummary({ summary }: { summary: SalesSummary }) {
  return (
    <Card className="relative overflow-hidden bg-[var(--primary)] text-[var(--primary-ink)]">
      <Receipt className="absolute -right-2 -top-2 h-24 w-24 opacity-20" />
      <CardHeader>
        <CardTitle className="text-[34px] tabular-nums text-[var(--primary-ink)]">{formatRupiah(summary.total_omzet)}</CardTitle>
        <p className="text-xs opacity-80">Omzet periode ini</p>
        <p className="text-xs font-semibold text-[var(--accent)]">
          {summary.change_percent >= 0 ? '▲' : '▼'} {Math.abs(summary.change_percent)}% dari periode sebelumnya
        </p>
      </CardHeader>
    </Card>
  );
}

function InsightRekomendasi({ summary, period }: { summary: SalesSummary; period: Period }) {
  const insight = summary.total_transactions > 0
    ? `Rata-rata transaksi Rp ${summary.avg_transaction.toLocaleString('id-ID')} periode ini.`
    : 'Belum ada transaksi untuk dianalisis periode ini.';
  const rekomendasi = period === 'daily'
    ? 'Siapkan stok ekstra di jam ramai supaya tidak kehabisan.'
    : 'Coba promo menu favorit untuk dorong omzet periode berikutnya.';
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <Card><CardContent className="pt-4"><p className="mb-1 text-xs font-semibold text-[var(--muted)]">INSIGHT</p><p className="text-sm text-[var(--ink)]">{insight}</p></CardContent></Card>
      <Card className="bg-[#fdf3e3]"><CardContent className="pt-4"><p className="mb-1 text-xs font-semibold text-[#8a6a1f]">REKOMENDASI</p><p className="text-sm text-[var(--ink)]">{rekomendasi}</p></CardContent></Card>
    </div>
  );
}

function TrendChart({ period, range }: { period: Period; range: DateRange }) {
  const [data, setData] = useState<TimeseriesPoint[] | null>(null);

  useEffect(() => {
    setData(null);
    const granularity = granularityForPeriod(period);
    apiFetch(`/api/v1/reports/timeseries?from=${range.from}&to=${range.to}&granularity=${granularity}`)
      .then(setData)
      .catch(() => setData([]));
  }, [period, range.from, range.to]);

  if (data === null) return <Skeleton className="h-[100px] w-full" />;
  if (data.length === 0) return <p className="py-6 text-center text-sm text-[var(--muted)]">Belum ada data tren untuk periode ini.</p>;

  if (period === 'daily') {
    const maxCount = Math.max(...data.map((d) => d.transaction_count));
    return (
      <ResponsiveContainer width="100%" height={100}>
        <BarChart data={data}>
          <XAxis dataKey="bucket" stroke="var(--muted)" fontSize={10} tickFormatter={(v) => v.slice(11, 16)} />
          <YAxis hide />
          <Tooltip formatter={(value: number) => [`${value} transaksi`, '']} labelFormatter={(l) => l.slice(11, 16)} />
          <Bar dataKey="transaction_count" radius={[4, 4, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.transaction_count === maxCount ? 'var(--primary)' : 'var(--accent)'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={100}>
      <LineChart data={data}>
        <XAxis dataKey="bucket" stroke="var(--muted)" fontSize={10} />
        <YAxis stroke="var(--muted)" fontSize={10} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
        <Tooltip formatter={(value: number) => formatRupiah(value)} />
        <Line type="monotone" dataKey="omzet" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export default function LaporanPage() {
  const [period, setPeriod] = useState<Period>('daily');
  const [range, setRange] = useState<DateRange>(rangeForPeriod('daily'));
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const r = rangeForPeriod(period);
    setRange(r);
    setSummary(null);
    setFailed(false);
    apiFetch(`/api/v1/reports/sales-summary?from=${r.from}&to=${r.to}`).then(setSummary).catch(() => setFailed(true));
  }, [period]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--ink)]">Laporan</h1>
        <PlanGate featureKey="advanced_report" featureLabel="Export laporan">
          <Button variant="outline" size="sm"><Download className="h-4 w-4" /> Export</Button>
        </PlanGate>
      </div>

      <PeriodSwitcher value={period} onChange={setPeriod} />

      {failed ? (
        <EmptyState>Tidak ada transaksi di periode ini. Coba pilih rentang tanggal lain.</EmptyState>
      ) : !summary ? (
        <Skeleton className="h-32 w-full" />
      ) : summary.total_transactions === 0 ? (
        <EmptyState>Tidak ada transaksi di periode ini. Coba pilih rentang tanggal lain.</EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.4fr_1fr]">
            <HeroSummary summary={summary} />
            <div className="flex flex-col gap-3">
              <Card><CardHeader><CardTitle className="tabular-nums">{summary.total_transactions}</CardTitle><p className="text-xs text-[var(--muted)]">Transaksi</p></CardHeader></Card>
              <Card><CardHeader><CardTitle className="tabular-nums">{formatRupiah(summary.avg_transaction)}</CardTitle><p className="text-xs text-[var(--muted)]">Rata-rata</p></CardHeader></Card>
            </div>
          </div>

          <InsightRekomendasi summary={summary} period={period} />

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-sm"><TrendingUp className="h-4 w-4" /> {period === 'daily' ? 'Jam Sibuk' : 'Tren Omzet'}</CardTitle></CardHeader>
            <CardContent className="pt-0"><TrendChart period={period} range={range} /></CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
