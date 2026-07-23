'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { LogIn } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { PlanGate } from '@/components/PlanGate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type AttendanceRow = {
  id: string;
  user_id: string;
  user_name: string;
  clock_in_at: string | null;
  clock_out_at: string | null;
  status: 'hadir' | 'telat' | 'alpha';
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function statusVariant(status: AttendanceRow['status']) {
  if (status === 'hadir') return 'success';
  if (status === 'telat') return 'warning';
  return 'destructive';
}

function statusLabel(status: AttendanceRow['status']) {
  if (status === 'hadir') return 'Hadir';
  if (status === 'telat') return 'Telat';
  return 'Alpha';
}

function AttendanceTable() {
  const [date, setDate] = useState(todayStr());
  const [rows, setRows] = useState<AttendanceRow[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setRows(null);
    setError('');
    apiFetch(`/api/v1/tenants/attendance?date=${date}`)
      .then((res) => setRows(res.data))
      .catch((e) => setError(e.message));
  }, [date]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-[var(--ink)]">
          Tanggal
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={todayStr()}
            className="h-11 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-[var(--primary)]/20"
          />
        </label>
        <Link href="/absensi/clock-in">
          <Button size="sm" variant="outline">
            <LogIn className="h-4 w-4" /> Kiosk Absen
          </Button>
        </Link>
      </div>

      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      {!rows ? (
        <Skeleton className="h-40 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState>Belum ada data absensi untuk tanggal ini.</EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Jam Masuk</TableHead>
              <TableHead>Jam Keluar</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.user_name}</TableCell>
                <TableCell className="tabular-nums">{formatTime(r.clock_in_at)}</TableCell>
                <TableCell className="tabular-nums">{formatTime(r.clock_out_at)}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant(r.status)}>{statusLabel(r.status)}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}

export default function AbsensiPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-xl font-bold text-[var(--ink)]">Absensi Karyawan</h1>
      <PlanGate featureKey="absensi" featureLabel="Absensi Karyawan">
        <AttendanceTable />
      </PlanGate>
    </div>
  );
}
