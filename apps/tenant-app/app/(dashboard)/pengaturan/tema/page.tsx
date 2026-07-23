'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { useTenant } from '@/components/layout/TenantContext';
import { ThemeColorPicker } from '@/components/ThemeColorPicker';
import { setThemeColor, DEFAULT_THEME_HUE } from '@/hooks/useThemeColor';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export default function TemaPage() {
  const { tenant, refetch } = useTenant();
  const [hue, setHue] = useState(tenant.theme_color ?? DEFAULT_THEME_HUE);
  const [saving, setSaving] = useState(false);

  async function handleChange(newHue: string) {
    const previous = hue;
    setHue(newHue);
    setSaving(true);
    try {
      await setThemeColor(newHue, previous);
      await refetch();
      toast.success('Warna toko disimpan');
    } catch {
      setHue(previous);
      toast.error('Gagal menyimpan warna, coba lagi');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Tema Warna Toko</CardTitle>
          <CardDescription>Pilih warna utama tampilan toko kamu. Bisa diganti kapan saja.</CardDescription>
        </CardHeader>
        <CardContent>
          <ThemeColorPicker value={hue} onChange={handleChange} />
          {saving && <p className="mt-3 text-xs text-[var(--muted)]">Menyimpan…</p>}
        </CardContent>
      </Card>
    </div>
  );
}
