'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Switch } from '@/components/ui/switch';

// ponytail: upload gambar QRIS statis atau koneksi payment gateway butuh backend
// (upload storage / integrasi gateway) yang belum ada — halaman ini shell UI, disambungkan nanti.
export default function QrisPage() {
  const [enabled, setEnabled] = useState(true);

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>QRIS</CardTitle>
          <CardDescription>Kelola pembayaran QRIS toko kamu.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <span className="text-sm font-medium text-[var(--ink)]">Aktifkan QRIS di kasir</span>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <EmptyState>Belum ada QRIS terpasang. Unggah gambar QRIS atau sambungkan payment gateway di sini nanti.</EmptyState>
        </CardContent>
      </Card>
    </div>
  );
}
