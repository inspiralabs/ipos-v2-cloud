'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';

const PREFS = [
  { id: 'trial_reminder', label: 'Pengingat masa coba', desc: 'WA & email H-2 sebelum trial habis' },
  { id: 'low_stock', label: 'Stok menipis', desc: 'Notifikasi saat stok menu di bawah batas' },
  { id: 'daily_summary', label: 'Ringkasan harian', desc: 'Kirim rekap omzet tiap akhir hari' },
] as const;

// ponytail: preferensi disimpan lokal dulu — belum ada endpoint notification-service untuk
// baca/tulis preferensi per tenant. Sambungkan ke PATCH saat rute itu ada.
export default function NotifikasiPage() {
  const [enabled, setEnabled] = useState<Record<string, boolean>>({ trial_reminder: true, low_stock: true, daily_summary: false });

  return (
    <div className="mx-auto max-w-2xl">
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
    </div>
  );
}
