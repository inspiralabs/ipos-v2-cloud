'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { TableSkeleton } from '@/components/ui/table-skeleton';
import { Pagination } from '@/components/ui/pagination';

type AuditLog = {
  id: string;
  admin_name: string | null;
  action: string;
  target_type: string | null;
  target_name: string | null;
  created_at: string;
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
}

const PAGE_SIZE = 50;

export default function AuditLogPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useQuery<{ data: AuditLog[]; total: number }>({
    queryKey: ['audit-logs', page],
    queryFn: () => apiFetch(`/api/v1/admin/audit-logs?page=${page}&limit=${PAGE_SIZE}`),
  });

  const logs = data?.data ?? [];

  return (
    <div>
      <h1 className="mb-1 font-display text-xl font-bold text-[var(--ink)]">Audit Log</h1>
      <p className="mb-6 text-sm text-[var(--muted)]">Riwayat semua aksi admin di panel ini.</p>

      {isLoading ? (
        <TableSkeleton rows={8} />
      ) : logs.length === 0 ? (
        <Card className="py-12 text-center">
          <p className="text-sm text-[var(--muted)]">Belum ada riwayat aksi.</p>
        </Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Waktu</TableHead>
                  <TableHead>Admin</TableHead>
                  <TableHead>Aksi</TableHead>
                  <TableHead>Target</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="whitespace-nowrap text-[var(--muted)]">{formatDateTime(l.created_at)}</TableCell>
                    <TableCell className="font-medium text-[var(--ink)]">{l.admin_name ?? '-'}</TableCell>
                    <TableCell className="font-mono text-xs text-[var(--muted)]">{l.action}</TableCell>
                    <TableCell className="text-[var(--muted)]">
                      {l.target_name ?? '-'}{l.target_type && <span className="ml-1 text-xs">({l.target_type})</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
          <Pagination page={page} limit={PAGE_SIZE} total={data?.total ?? 0} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
