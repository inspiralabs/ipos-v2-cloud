'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Download, Sparkles } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { formatRupiah } from '@/lib/format';
import { PlanGate } from '@/components/PlanGate';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

type SalesRow = { date: string; total_transactions: number; total_omzet: number };

function SalesReport({ period }: { period: 'daily' | 'weekly' | 'monthly' | 'per_cashier' }) {
  const [rows, setRows] = useState<SalesRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setRows(null);
    setFailed(false);
    apiFetch(`/api/v1/reports/sales?period=${period}`)
      .then(setRows)
      .catch(() => setFailed(true));
  }, [period]);

  if (failed) return <EmptyState>Belum ada data laporan untuk periode ini.</EmptyState>;
  if (!rows) return <Skeleton className="h-40 w-full" />;
  if (rows.length === 0) return <EmptyState>Belum ada transaksi tercatat.</EmptyState>;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Tanggal</TableHead>
          <TableHead>Transaksi</TableHead>
          <TableHead>Omzet</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.date}>
            <TableCell>{r.date}</TableCell>
            <TableCell>{r.total_transactions}</TableCell>
            <TableCell className="font-semibold">{formatRupiah(r.total_omzet)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default function LaporanPage() {
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

      <Tabs defaultValue="daily">
        <TabsList>
          <TabsTrigger value="daily">Harian</TabsTrigger>
          <TabsTrigger value="weekly">Mingguan</TabsTrigger>
          <TabsTrigger value="monthly">Bulanan</TabsTrigger>
          <TabsTrigger value="per_cashier">Per Kasir</TabsTrigger>
        </TabsList>
        <TabsContent value="daily">
          <Card><CardContent className="pt-4"><SalesReport period="daily" /></CardContent></Card>
        </TabsContent>
        <TabsContent value="weekly">
          <PlanGate featureKey="advanced_report" featureLabel="Laporan mingguan">
            <Card><CardContent className="pt-4"><SalesReport period="weekly" /></CardContent></Card>
          </PlanGate>
        </TabsContent>
        <TabsContent value="monthly">
          <PlanGate featureKey="advanced_report" featureLabel="Laporan bulanan">
            <Card><CardContent className="pt-4"><SalesReport period="monthly" /></CardContent></Card>
          </PlanGate>
        </TabsContent>
        <TabsContent value="per_cashier">
          <PlanGate featureKey="advanced_report" featureLabel="Laporan per kasir">
            <Card><CardContent className="pt-4"><SalesReport period="per_cashier" /></CardContent></Card>
          </PlanGate>
        </TabsContent>
      </Tabs>
    </div>
  );
}
