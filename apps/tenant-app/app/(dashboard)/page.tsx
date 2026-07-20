'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShoppingCart, UtensilsCrossed, FileBarChart, Receipt } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { formatRupiah } from '@/lib/format';
import { useTenant } from '@/components/layout/TenantContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type SalesSummary = {
  total_omzet: number;
  total_transactions: number;
  change_percent: number;
  previous_period: { total_omzet: number; total_transactions: number };
};

// Shape nyata dari GET /api/v1/pos/orders (services/pos-service/src/index.ts:128) —
// bare array hasil `db.select().from(pos_orders)`, TANPA join ke pos_order_items,
// jadi tidak ada field `items`/nama produk di sini.
type RecentOrder = {
  id: string;
  status: string;
  total: number;
  payment_method: string;
  cashier_name: string | null;
  customer_name: string | null;
  table_number: string | null;
  created_at: string;
};

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return 'Selamat pagi';
  if (h < 15) return 'Selamat siang';
  if (h < 18) return 'Selamat sore';
  return 'Selamat malam';
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

const paymentLabel: Record<string, string> = {
  cash: 'Tunai',
  qris: 'QRIS',
  transfer: 'Transfer',
};

export default function DashboardPage() {
  const { tenant } = useTenant();
  const [summary, setSummary] = useState<SalesSummary | null>(null);
  const [recent, setRecent] = useState<RecentOrder[] | null>(null);

  useEffect(() => {
    const today = todayDate();
    apiFetch(`/api/v1/reports/sales-summary?from=${today}&to=${today}`)
      .then(setSummary)
      .catch(() => setSummary(null));
    apiFetch(`/api/v1/pos/orders?date=${today}`)
      .then((res: RecentOrder[]) => {
        const sorted = [...res]
          .filter((o) => o.status !== 'void')
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setRecent(sorted.slice(0, 5));
      })
      .catch(() => setRecent([]));
  }, []);

  const isEmpty = recent !== null && recent.length === 0;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div>
        <p className="text-sm text-[var(--muted)]">{greeting()},</p>
        <h1 className="text-xl font-bold text-[var(--ink)]">{tenant.user.name}</h1>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1.4fr_1fr]">
        <Card className="relative overflow-hidden bg-[var(--primary)] text-[var(--primary-ink)]">
          <Receipt className="absolute -right-2 -top-2 h-24 w-24 opacity-20" />
          <CardHeader>
            {summary === null ? (
              <Skeleton className="h-9 w-32 bg-white/20" />
            ) : (
              <>
                <CardTitle className="text-[34px] tabular-nums text-[var(--primary-ink)]">
                  {formatRupiah(summary.total_omzet)}
                </CardTitle>
                <p className="text-xs opacity-80">Omzet hari ini</p>
                {summary.total_omzet > 0 ? (
                  <p className="text-xs font-semibold text-[var(--accent)]">
                    {summary.change_percent >= 0 ? '▲' : '▼'} {Math.abs(summary.change_percent)}% dari kemarin
                  </p>
                ) : (
                  <p className="text-xs opacity-80">Belum ada transaksi — ayo mulai jualan hari ini.</p>
                )}
              </>
            )}
          </CardHeader>
        </Card>
        <div className="flex flex-col gap-3">
          <Card>
            <CardHeader>
              {summary === null ? (
                <Skeleton className="h-6 w-8" />
              ) : (
                <CardTitle className="tabular-nums">{summary.total_transactions}</CardTitle>
              )}
              <p className="text-xs text-[var(--muted)]">Transaksi hari ini</p>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{tenant.plan.replace('_', ' ')}</CardTitle>
              <p className="text-xs text-[var(--muted)]">Paket aktif</p>
            </CardHeader>
          </Card>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Link
          href="/pos"
          className="flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl bg-[var(--primary)] p-4 text-sm font-bold text-[var(--primary-ink)] active:scale-95"
        >
          <ShoppingCart className="h-5 w-5" /> Buka Kasir
        </Link>
        <Link
          href="/menu"
          className="flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm font-medium text-[var(--ink)] active:scale-95"
        >
          <UtensilsCrossed className="h-5 w-5" /> Kelola Menu
        </Link>
        <Link
          href="/laporan/insight"
          className="flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm font-medium text-[var(--ink)] active:scale-95"
        >
          <FileBarChart className="h-5 w-5" /> Lihat Insight
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transaksi Terbaru</CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          {recent === null ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : isEmpty ? (
            <p className="py-6 text-center text-sm text-[var(--muted)]">
              Belum ada transaksi hari ini. Transaksi terbaru akan tampil di sini.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {recent.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--ink)]">
                      {o.customer_name || (o.table_number ? `Meja ${o.table_number}` : 'Transaksi')}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      {formatTime(o.created_at)} · {paymentLabel[o.payment_method] ?? o.payment_method}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--ink)]">
                    {formatRupiah(o.total)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
