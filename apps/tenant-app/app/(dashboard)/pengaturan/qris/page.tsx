'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/auth';
import { useTenant } from '@/components/layout/TenantContext';
import { ImageDropzone } from '@/components/pengaturan/ImageDropzone';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';

export default function QrisPage() {
  const { tenant, refetch } = useTenant();
  const [enabled, setEnabled] = useState(true);
  const [uploading, setUploading] = useState(false);

  async function handleQrisSelected(file: File) {
    const fd = new FormData();
    fd.append('file', file);
    setUploading(true);
    try {
      await apiFetch('/api/v1/tenants/me/qris', { method: 'POST', body: fd });
      await refetch();
      toast.success('Gambar QRIS diperbarui');
    } catch (e: any) {
      toast.error(e.message || 'Gagal upload QRIS');
    } finally {
      setUploading(false);
    }
  }

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
          <div>
            <p className="mb-2 text-sm font-medium text-[var(--ink)]">Gambar QRIS statis</p>
            <ImageDropzone
              currentUrl={tenant.qris_url}
              alt="QRIS toko"
              onFileSelected={handleQrisSelected}
              uploading={uploading}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
