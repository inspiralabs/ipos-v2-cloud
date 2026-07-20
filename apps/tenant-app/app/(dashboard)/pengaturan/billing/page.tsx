'use client';

import { useTenant } from '@/components/layout/TenantContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const PLAN_LABELS: Record<string, string> = {
  umkm_lite: 'UMKM Lite — Rp 149.000/bln',
  umkm_pro: 'UMKM Pro — Rp 299.000/bln',
  resto_starter: 'Resto Starter — Rp 999.000/bln',
  resto_pro: 'Resto Pro — Rp 2.499.000/bln',
  resto_business: 'Resto Business — Rp 4.999.000/bln',
};

const WHATSAPP_ADMIN = 'https://wa.me/6282124533265';

export default function BillingPage() {
  const { tenant } = useTenant();

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Paket & Tagihan</CardTitle>
          <CardDescription>Lihat paket aktif dan ajukan upgrade kapan saja.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-xl bg-[var(--surface-2)] p-4">
            <div>
              <p className="text-sm font-semibold text-[var(--ink)]">{PLAN_LABELS[tenant.plan] ?? tenant.plan}</p>
              <p className="text-xs text-[var(--muted)]">Status: {tenant.status}</p>
            </div>
            <Badge variant={tenant.status === 'active' ? 'success' : 'accent'}>{tenant.status}</Badge>
          </div>
          <a href={WHATSAPP_ADMIN} target="_blank" rel="noreferrer">
            <Button className="w-full">Hubungi Admin untuk Upgrade (WA +62 821-2453-3265)</Button>
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
