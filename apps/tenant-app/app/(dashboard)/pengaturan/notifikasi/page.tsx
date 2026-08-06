'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Mail, Send } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { useTenant } from '@/components/layout/TenantContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const PREFS = [
  { id: 'trial_reminder', label: 'Pengingat masa coba', desc: 'WA & email H-2 sebelum trial habis' },
  { id: 'low_stock', label: 'Stok menipis', desc: 'Notifikasi saat stok menu di bawah batas' },
  { id: 'daily_summary', label: 'Ringkasan harian', desc: 'Kirim rekap omzet tiap akhir hari' },
] as const;

// ponytail: preferensi disimpan lokal dulu — belum ada endpoint notification-service untuk
// baca/tulis preferensi per tenant. Sambungkan ke PATCH saat rute itu ada.
export default function NotifikasiPage() {
  const { tenant } = useTenant();
  const [enabled, setEnabled] = useState<Record<string, boolean>>({ trial_reminder: true, low_stock: true, daily_summary: false });
  const [sending, setSending] = useState(false);

  async function sendTest() {
    setSending(true);
    try {
      const res = await apiFetch('/api/v1/tenants/me/test-notification', { method: 'POST' });
      toast.success(`Email test dikirim ke ${res.sent_to}. Cek inbox (& folder spam) kamu.`);
    } catch (e: any) {
      toast.error(e.message || 'Gagal mengirim notifikasi test');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Notifikasi</CardTitle>
          <CardDescription>Atur pengingat & pemberitahuan yang kamu terima.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {PREFS.map((pref) => (
            <div key={pref.id} className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-[var(--ink)]">{pref.label}</p>
                <p className="text-xs text-[var(--muted)]">{pref.desc}</p>
              </div>
              <Switch
                checked={enabled[pref.id]}
                onCheckedChange={(v) => setEnabled((prev) => ({ ...prev, [pref.id]: v }))}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Status Pengiriman</CardTitle>
          <CardDescription>Cek apakah notifikasi benar-benar sampai ke kamu.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-[var(--muted)]" />
              <div>
                <p className="text-sm font-medium text-[var(--ink)]">Email</p>
                <p className="text-xs text-[var(--muted)]">Terkirim ke {tenant.user.email}</p>
              </div>
            </div>
            <Badge variant="success">Aktif</Badge>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 opacity-70">
            <div>
              <p className="text-sm font-medium text-[var(--ink)]">WhatsApp</p>
              <p className="text-xs text-[var(--muted)]">Belum tersedia, menyusul</p>
            </div>
            <Badge variant="neutral">Segera hadir</Badge>
          </div>
          <Button variant="outline" className="w-full" onClick={sendTest} disabled={sending}>
            <Send className="h-4 w-4" />
            {sending ? 'Mengirim...' : 'Kirim Notifikasi Test'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
