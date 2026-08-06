'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShoppingCart, UtensilsCrossed, FileBarChart, Receipt, ListOrdered, Sparkles, Coffee, ShoppingBag, Soup } from 'lucide-react';
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
  items: { product_name: string; qty: number }[];
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

function timeAgo(iso: string) {
  const diffMin = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (diffMin < 1) return 'Baru saja';
  if (diffMin < 60) return `${diffMin} menit lalu`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour} jam lalu`;
  return `${Math.round(diffHour / 24)} hari lalu`;
}

function orderTitle(o: RecentOrder) {
  if (!o.items?.length) return o.customer_name || (o.table_number ? `Meja ${o.table_number}` : 'Transaksi');
  return o.items.map((i) => (i.qty > 1 ? `${i.product_name} ×${i.qty}` : i.product_name)).join(', ');
}

function orderMeta(o: RecentOrder) {
  const place = o.table_number ? `Meja ${o.table_number}` : 'Bawa pulang';
  return `${place} · ${paymentLabel[o.payment_method] ?? o.payment_method} · ${timeAgo(o.created_at)}`;
}

const paymentLabel: Record<string, string> = {
  cash: 'Tunai',
  qris: 'QRIS',
  transfer: 'Transfer',
};

const CATEGORY_ICONS = [Coffee, Soup, ShoppingBag];
function orderIcon(index: number) {
  return CATEGORY_ICONS[index % CATEGORY_ICONS.length];
}

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
          <Card className="flex-1">
            <CardContent className="flex h-full items-center gap-3 pt-6">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-2)] text-[var(--primary)]">
                <ListOrdered className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                {summary === null ? (
                  <Skeleton className="h-7 w-8" />
                ) : (
                  <p className="text-2xl font-bold tabular-nums text-[var(--ink)]">{summary.total_transactions}</p>
                )}
                <p className="text-xs text-[var(--muted)]">Transaksi hari ini</p>
              </div>
            </CardContent>
          </Card>
          <Card className="flex-1 border-[var(--accent)]/30 bg-[var(--accent)]/10">
            <CardContent className="flex h-full items-center gap-3 pt-6">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-[var(--accent-ink)]">
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-bold capitalize text-[var(--ink)]">{tenant.plan.replace('_', ' ')}</p>
                <p className="text-xs text-[var(--muted)]">Paket aktif</p>
              </div>
            </CardContent>
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
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Transaksi Terbaru</CardTitle>
          {!isEmpty && (
            <Link href="/laporan" className="text-sm font-semibold text-[var(--primary)] hover:underline">
              Lihat semua
            </Link>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          {recent === null ? (
            <div className="space-y-2">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : isEmpty ? (
            <p className="py-6 text-center text-sm text-[var(--muted)]">
              Belum ada transaksi hari ini. Transaksi terbaru akan tampil di sini.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {recent.map((o, i) => {
                const Icon = orderIcon(i);
                return (
                  <li key={o.id} className="flex items-center gap-3 py-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-2)] text-[var(--primary)]">
                      <Icon className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--ink)]">{orderTitle(o)}</p>
                      <p className="truncate text-xs text-[var(--muted)]">{orderMeta(o)}</p>
                    </div>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--ink)]">
                      {formatRupiah(o.total)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
