'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useTenant } from '@/components/layout/TenantContext';
import { DateRangePicker, rangeFor, type DateRange } from '@/components/insight/DateRangePicker';

export default function InsightPage() {
  const { tenant } = useTenant();
  const [range, setRange] = useState<DateRange>(rangeFor('week'));

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
        {/* Insight cards, trend chart, top/bottom menu, peak-hour heatmap wired in Task 9 */}
        <p className="text-sm text-[var(--muted)]">
          Rentang: {range.from} — {range.to}
        </p>
      </div>
    </div>
  );
}
