'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, Sparkles } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { formatRupiah } from '@/lib/format';
import { PlanGate } from '@/components/PlanGate';
import { DateRangePicker, rangeFor, type DateRange } from '@/components/insight/DateRangePicker';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

type SalesSummary = {
  total_omzet: number;
  total_transactions: number;
  avg_transaction: number;
  change_percent: number;
};

function SalesSummaryCard({ range }: { range: DateRange }) {
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSummary(null);
    setFailed(false);
    apiFetch(`/api/v1/reports/sales-summary?from=${range.from}&to=${range.to}`)
      .then(setSummary)
      .catch(() => setFailed(true));
  }, [range.from, range.to]);

  if (failed) return <EmptyState>Belum ada data laporan untuk periode ini.</EmptyState>;
  if (!summary) return <Skeleton className="h-40 w-full" />;
  if (summary.total_transactions === 0) return <EmptyState>Belum ada transaksi tercatat.</EmptyState>;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <div>
        <p className="text-xs text-[var(--muted)]">Omzet</p>
        <p className="text-lg font-bold text-[var(--ink)]">{formatRupiah(summary.total_omzet)}</p>
        <p className={`text-xs ${summary.change_percent >= 0 ? 'text-[var(--status-active)]' : 'text-[var(--muted)]'}`}>
          {summary.change_percent >= 0 ? '+' : ''}
          {summary.change_percent}% dari periode sebelumnya
        </p>
      </div>
      <div>
        <p className="text-xs text-[var(--muted)]">Transaksi</p>
        <p className="text-lg font-bold text-[var(--ink)]">{summary.total_transactions}</p>
      </div>
      <div>
        <p className="text-xs text-[var(--muted)]">Rata-rata / Transaksi</p>
        <p className="text-lg font-bold text-[var(--ink)]">{formatRupiah(summary.avg_transaction)}</p>
      </div>
    </div>
  );
}

export default function LaporanPage() {
  const [range, setRange] = useState<DateRange>(rangeFor('today'));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--ink)]">Laporan</h1>
        <div className="flex items-center gap-2">
          <Link href="/laporan/insight">
            <Button variant="primary" size="sm">
              <Sparkles className="h-4 w-4" /> Lihat Insight
            </Button>
          </Link>
          <PlanGate featureKey="advanced_report" featureLabel="Export laporan">
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4" /> Export
            </Button>
          </PlanGate>
        </div>
      </div>

      <DateRangePicker value={range} onChange={setRange} />

      <Card>
        <CardContent className="pt-4">
          <SalesSummaryCard range={range} />
        </CardContent>
      </Card>
    </div>
  );
}
