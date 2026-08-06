'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/auth';
import { useTenant } from '@/components/layout/TenantContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

const FOOTER_MAX = 200;

// ponytail: koneksi printer thermal (Bluetooth/USB) butuh Web Bluetooth/WebUSB — di luar
// cakupan MVP (sama seperti PrinterStep di setup wizard). Halaman ini tempat menyalakannya nanti.
export default function PrinterPage() {
  const { tenant, refetch } = useTenant();
  const [footer, setFooter] = useState(tenant.receipt_footer ?? '');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/api/v1/tenants/me', {
        method: 'PATCH',
        body: JSON.stringify({ receipt_footer: footer || null }),
      });
      await refetch();
      toast.success('Kalimat struk disimpan');
    } catch (e: any) {
      toast.error(e.message || 'Gagal menyimpan');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Printer</CardTitle>
          <CardDescription>Sambungkan printer struk thermal (Bluetooth/USB/LAN).</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyState>Belum ada printer tersambung. Fitur sambung printer akan segera hadir.</EmptyState>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kalimat di Struk</CardTitle>
          <CardDescription>Pesan penutup yang tercetak di bawah setiap struk pelanggan.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <Field label="Kalimat penutup struk">
              <Textarea
                rows={2}
                maxLength={FOOTER_MAX}
                value={footer}
                onChange={(e) => setFooter(e.target.value)}
                placeholder="Terima kasih!"
              />
              <p className="mt-1 text-right text-xs text-[var(--muted)]">{footer.length}/{FOOTER_MAX}</p>
            </Field>
            <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg)] p-4 text-center">
              <p className="text-xs text-[var(--muted)]">Pratinjau struk</p>
              <p className="mt-1 text-sm font-medium text-[var(--ink)]">{footer || 'Terima kasih!'}</p>
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
