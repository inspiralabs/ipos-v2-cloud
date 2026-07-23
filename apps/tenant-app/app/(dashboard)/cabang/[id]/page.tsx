'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/auth';
import { PlanGate } from '@/components/PlanGate';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type Outlet = { id: string; name: string; address: string | null; phone: string | null; is_active: boolean };

function OutletDetail({ id }: { id: string }) {
  const router = useRouter();
  const [outlet, setOutlet] = useState<Outlet | null | undefined>(undefined);

  useEffect(() => {
    apiFetch('/api/v1/tenants/branches')
      .then((rows: Outlet[]) => setOutlet(rows.find((o) => o.id === id) ?? null))
      .catch(() => setOutlet(null));
  }, [id]);

  if (outlet === undefined) return <Skeleton className="h-60 w-full" />;
  if (outlet === null) {
    return (
      <div className="text-center text-sm text-[var(--muted)]">
        Cabang tidak ditemukan. <button onClick={() => router.push('/cabang')} className="font-medium text-[var(--primary)]">Kembali</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={() => router.push('/cabang')}>← Kembali</Button>
      <Card>
        <CardContent className="pt-4">
          <h2 className="text-lg font-bold text-[var(--ink)]">{outlet.name}</h2>
          <p className="text-sm text-[var(--muted)]">{outlet.address || 'Alamat belum diisi'}</p>
          <p className="text-sm text-[var(--muted)]">{outlet.phone || 'No. HP belum diisi'}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          <p className="text-sm text-[var(--muted)]">
            KPI per-cabang akan tersedia setelah laporan per-outlet diimplementasikan. Untuk sekarang,
            lihat performa gabungan seluruh cabang di halaman Laporan.
          </p>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Button variant="outline" onClick={() => router.push('/pelanggan')}>Kelola Staf</Button>
        <Button variant="outline" onClick={() => router.push('/laporan')}>Buka Laporan Lengkap</Button>
      </div>
    </div>
  );
}

export default function OutletDetailPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="mx-auto max-w-2xl">
      <PlanGate featureKey="multi_outlet" featureLabel="Multi-Cabang">
        <OutletDetail id={id} />
      </PlanGate>
    </div>
  );
}
