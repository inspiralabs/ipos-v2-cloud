'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Plus, Printer } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { formatRupiah } from '@/lib/format';
import { PlanGate } from '@/components/PlanGate';
import { rangeForPeriod, type DateRange } from '@/components/insight/DateRangePicker';
import { WasteModal } from '@/components/laporan-resto/WasteModal';
import { ExpenseModal } from '@/components/laporan-resto/ExpenseModal';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// ── Tipe data dari report-service ──

type FoodCostRow = {
  menu_id: string;
  menu_name: string;
  hpp: number;
  price: number;
  ratio_percent: number;
  over_threshold: boolean;
};

type WasteItem = {
  id: string;
  ingredient_name: string;
  qty: number;
  unit: string;
  estimated_value: number;
  reason: string | null;
  created_at: string;
};

type WasteReport = { items: WasteItem[]; total_value: number };

type PnlReport = { revenue: number; cogs: number; operational: number; net_profit: number };

type CashflowReport = {
  cash_in: Array<{ payment_method: 'cash' | 'qris' | 'transfer'; total: number }>;
  cash_out: Array<{ category: string; total: number }>;
  total_in: number;
  total_out: number;
  saldo_akhir: number;
};

const PAYMENT_LABEL: Record<string, string> = { cash: 'Tunai', qris: 'QRIS', transfer: 'Transfer' };

function formatDateID(iso: string) {
  return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ── Tab: Food Cost ──

function FoodCostTab() {
  const [rows, setRows] = useState<FoodCostRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    apiFetch('/api/v1/reports/food-cost').then(setRows).catch(() => setFailed(true));
  }, []);

  if (failed) return <EmptyState>Gagal memuat laporan food cost. Coba muat ulang halaman.</EmptyState>;
  if (!rows) return <Skeleton className="h-48 w-full" />;
  if (rows.length === 0) {
    return (
      <EmptyState>
        Belum ada resep BOM dengan harga bahan — atur harga bahan baku dan buat resep dulu di{' '}
        <Link href="/bahan-baku" className="font-semibold text-[var(--primary)] underline">
          halaman Bahan Baku
        </Link>
        .
      </EmptyState>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rasio Food Cost per Menu</CardTitle>
        <p className="text-xs text-[var(--muted)]">
          Rasio di atas 35% ditandai boros — HPP terlalu tinggi dibanding harga jual.
        </p>
      </CardHeader>
      <CardContent className="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Menu</TableHead>
              <TableHead>HPP</TableHead>
              <TableHead>Harga Jual</TableHead>
              <TableHead>Rasio</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.menu_id} className={r.over_threshold ? 'bg-red-500/5' : undefined}>
                <TableCell className="font-medium">{r.menu_name}</TableCell>
                <TableCell className="tabular-nums">{formatRupiah(r.hpp)}</TableCell>
                <TableCell className="tabular-nums">{formatRupiah(r.price)}</TableCell>
                <TableCell>
                  <Badge variant={r.over_threshold ? 'destructive' : 'success'}>{r.ratio_percent}%</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ── Tab: Waste ──

function WasteTab({ range }: { range: DateRange }) {
  const [report, setReport] = useState<WasteReport | null>(null);
  const [failed, setFailed] = useState(false);
  const [showModal, setShowModal] = useState(false);

  function reload() {
    setReport(null);
    setFailed(false);
    apiFetch(`/api/v1/reports/waste?from=${range.from}&to=${range.to}`).then(setReport).catch(() => setFailed(true));
  }

  useEffect(reload, [range.from, range.to]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowModal(true)}>
          <Plus className="h-4 w-4" /> Catat Waste
        </Button>
      </div>

      {failed ? (
        <EmptyState>Gagal memuat laporan waste. Coba muat ulang halaman.</EmptyState>
      ) : !report ? (
        <Skeleton className="h-48 w-full" />
      ) : report.items.length === 0 ? (
        <EmptyState>Belum ada waste tercatat di periode ini.</EmptyState>
      ) : (
        <Card>
          <CardContent className="pt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bahan</TableHead>
                  <TableHead>Jumlah</TableHead>
                  <TableHead>Nilai Rugi</TableHead>
                  <TableHead>Alasan</TableHead>
                  <TableHead>Tanggal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="font-medium">{item.ingredient_name}</TableCell>
                    <TableCell className="tabular-nums">
                      {item.qty} {item.unit}
                    </TableCell>
                    <TableCell className="tabular-nums">{formatRupiah(item.estimated_value)}</TableCell>
                    <TableCell className="text-[var(--muted)]">{item.reason || '-'}</TableCell>
                    <TableCell className="text-[var(--muted)]">{formatDateID(item.created_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-4">
              <p className="text-sm font-semibold text-[var(--ink)]">Total Nilai Rugi</p>
              <p className="text-lg font-bold tabular-nums text-red-500">{formatRupiah(report.total_value)}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {showModal && (
        <WasteModal
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

// ── Tab: P&L ──

function PnlTab({ range }: { range: DateRange }) {
  const [report, setReport] = useState<PnlReport | null>(null);
  const [failed, setFailed] = useState(false);
  const [showModal, setShowModal] = useState(false);

  function reload() {
    setReport(null);
    setFailed(false);
    apiFetch(`/api/v1/reports/pnl?from=${range.from}&to=${range.to}`).then(setReport).catch(() => setFailed(true));
  }

  useEffect(reload, [range.from, range.to]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowModal(true)}>
          <Plus className="h-4 w-4" /> Catat Pengeluaran
        </Button>
      </div>

      {failed ? (
        <EmptyState>Gagal memuat laporan laba rugi. Coba muat ulang halaman.</EmptyState>
      ) : !report ? (
        <Skeleton className="h-56 w-full" />
      ) : (
        <div className="flex flex-col gap-3">
          <Card className={report.net_profit >= 0 ? 'border-[#2f7a4d]/30' : 'border-[#b23b2e]/30'}>
            <CardHeader>
              <p className="text-xs font-semibold text-[var(--muted)]">LABA BERSIH</p>
              <CardTitle className={`text-[34px] tabular-nums ${report.net_profit >= 0 ? 'text-[#2f7a4d]' : 'text-[#b23b2e]'}`}>
                {formatRupiah(report.net_profit)}
              </CardTitle>
            </CardHeader>
          </Card>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card>
              <CardHeader>
                <p className="text-xs font-semibold text-[var(--muted)]">PENDAPATAN</p>
                <CardTitle className="tabular-nums">{formatRupiah(report.revenue)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <p className="text-xs font-semibold text-[var(--muted)]">COGS (HPP)</p>
                <CardTitle className="tabular-nums">{formatRupiah(report.cogs)}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <p className="text-xs font-semibold text-[var(--muted)]">OPERASIONAL</p>
                <CardTitle className="tabular-nums">{formatRupiah(report.operational)}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          {report.cogs === 0 && (
            <p className="text-xs text-[var(--muted)]">
              COGS Rp 0 karena belum ada resep BOM dengan harga bahan. Atur di{' '}
              <Link href="/bahan-baku" className="font-semibold text-[var(--primary)] underline">
                halaman Bahan Baku
              </Link>{' '}
              supaya perhitungan laba rugi lebih akurat.
            </p>
          )}
        </div>
      )}

      {showModal && (
        <ExpenseModal
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

// ── Tab: Cashflow ──

function CashflowTab({ range }: { range: DateRange }) {
  const [report, setReport] = useState<CashflowReport | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setReport(null);
    setFailed(false);
    apiFetch(`/api/v1/reports/cashflow?from=${range.from}&to=${range.to}`).then(setReport).catch(() => setFailed(true));
  }, [range.from, range.to]);

  if (failed) return <EmptyState>Gagal memuat laporan arus kas. Coba muat ulang halaman.</EmptyState>;
  if (!report) return <Skeleton className="h-56 w-full" />;
  if (report.cash_in.length === 0 && report.cash_out.length === 0) {
    return <EmptyState>Belum ada arus kas tercatat di periode ini.</EmptyState>;
  }

  return (
    <div className="flex flex-col gap-3">
      <Card className={report.saldo_akhir >= 0 ? 'border-[#2f7a4d]/30' : 'border-[#b23b2e]/30'}>
        <CardHeader>
          <p className="text-xs font-semibold text-[var(--muted)]">SALDO AKHIR</p>
          <CardTitle className={`text-[34px] tabular-nums ${report.saldo_akhir >= 0 ? 'text-[#2f7a4d]' : 'text-[#b23b2e]'}`}>
            {formatRupiah(report.saldo_akhir)}
          </CardTitle>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Kas Masuk</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {report.cash_in.length === 0 ? (
              <p className="py-4 text-center text-sm text-[var(--muted)]">Belum ada kas masuk.</p>
            ) : (
              <div className="flex flex-col divide-y divide-[var(--border)]">
                {report.cash_in.map((row) => (
                  <div key={row.payment_method} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-[var(--ink)]">{PAYMENT_LABEL[row.payment_method] || row.payment_method}</span>
                    <span className="font-semibold tabular-nums text-[#2f7a4d]">{formatRupiah(row.total)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 flex items-center justify-between border-t border-[var(--border)] pt-2">
              <span className="text-sm font-semibold text-[var(--ink)]">Total Masuk</span>
              <span className="font-bold tabular-nums text-[#2f7a4d]">{formatRupiah(report.total_in)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Kas Keluar</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {report.cash_out.length === 0 ? (
              <p className="py-4 text-center text-sm text-[var(--muted)]">Belum ada kas keluar.</p>
            ) : (
              <div className="flex flex-col divide-y divide-[var(--border)]">
                {report.cash_out.map((row) => (
                  <div key={row.category} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-[var(--ink)]">{row.category}</span>
                    <span className="font-semibold tabular-nums text-[#b23b2e]">{formatRupiah(row.total)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 flex items-center justify-between border-t border-[var(--border)] pt-2">
              <span className="text-sm font-semibold text-[var(--ink)]">Total Keluar</span>
              <span className="font-bold tabular-nums text-[#b23b2e]">{formatRupiah(report.total_out)}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Halaman utama ──

type TabKey = 'food-cost' | 'waste' | 'pnl' | 'cashflow';

export default function LaporanRestoPage() {
  const [tab, setTab] = useState<TabKey>('food-cost');
  const [range, setRange] = useState<DateRange>(rangeForPeriod('monthly'));

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--ink)]">Food Cost & Laba Rugi</h1>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Cetak Halaman Ini
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList>
          <TabsTrigger value="food-cost">Food Cost</TabsTrigger>
          <TabsTrigger value="waste">Waste</TabsTrigger>
          <TabsTrigger value="pnl">Laba Rugi</TabsTrigger>
          <TabsTrigger value="cashflow">Arus Kas</TabsTrigger>
        </TabsList>

        {tab !== 'food-cost' && (
          <div className="mt-4 flex items-center gap-2">
            <Input
              type="date"
              value={range.from}
              max={range.to}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
              className="w-auto"
            />
            <span className="text-sm text-[var(--muted)]">s/d</span>
            <Input
              type="date"
              value={range.to}
              min={range.from}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
              className="w-auto"
            />
          </div>
        )}

        <TabsContent value="food-cost">
          <PlanGate featureKey="food_cost_report" featureLabel="Laporan Food Cost">
            <FoodCostTab />
          </PlanGate>
        </TabsContent>

        <TabsContent value="waste">
          <PlanGate featureKey="food_cost_report" featureLabel="Laporan Waste">
            <WasteTab range={range} />
          </PlanGate>
        </TabsContent>

        <TabsContent value="pnl">
          <PlanGate featureKey="pnl_report" featureLabel="Laporan Laba Rugi">
            <PnlTab range={range} />
          </PlanGate>
        </TabsContent>

        <TabsContent value="cashflow">
          <PlanGate featureKey="pnl_report" featureLabel="Laporan Arus Kas">
            <CashflowTab range={range} />
          </PlanGate>
        </TabsContent>
      </Tabs>
    </div>
  );
}
