'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import { useTenant } from '@/components/layout/TenantContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TenantPlan } from '@/lib/types';

// Harga & tier ikut docs/PRICING.md §2–3 (per 10 Juli 2026) — jaga tetap sinkron kalau harga berubah.
// monthlyPrice dipakai untuk deteksi arah upgrade/downgrade, price cuma buat tampilan.
const PLANS: { code: TenantPlan; group: 'UMKM' | 'F&B'; name: string; price: string; monthlyPrice: number }[] = [
  { code: 'umkm_lite', group: 'UMKM', name: 'UMKM Lite', price: 'Rp 149.000/bln', monthlyPrice: 149_000 },
  { code: 'umkm_pro', group: 'UMKM', name: 'UMKM Pro', price: 'Rp 299.000/bln', monthlyPrice: 299_000 },
  { code: 'resto_basic', group: 'F&B', name: 'Resto Basic', price: 'Rp 599.000/bln', monthlyPrice: 599_000 },
  { code: 'resto_starter', group: 'F&B', name: 'Resto Starter', price: 'Rp 999.000/bln', monthlyPrice: 999_000 },
  { code: 'resto_pro', group: 'F&B', name: 'Resto Pro', price: 'Rp 2.499.000/bln', monthlyPrice: 2_499_000 },
  { code: 'resto_business', group: 'F&B', name: 'Resto Business', price: 'Rp 4.999.000/bln', monthlyPrice: 4_999_000 },
];

const PLAN_LABELS: Record<string, string> = Object.fromEntries(PLANS.map((p) => [p.code, `${p.name} — ${p.price}`]));
const WHATSAPP_ADMIN_NUMBER = '6282124533265';

export default function BillingPage() {
  const { tenant } = useTenant();
  const [selected, setSelected] = useState<TenantPlan>(tenant.plan);

  const currentPlan = PLANS.find((p) => p.code === tenant.plan);
  const selectedPlan = PLANS.find((p) => p.code === selected);
  const isCurrentPlan = selected === tenant.plan;

  // Upgrade/downgrade cuma berlaku dibandingkan harga dalam satu lini produk (UMKM atau F&B).
  // Pindah lini (mis. UMKM → F&B) bukan gerakan naik/turun yang jelas buat pemilik toko, jadi disebut "ganti paket".
  const sameLine = currentPlan?.group === selectedPlan?.group;
  const direction =
    !sameLine || !currentPlan || !selectedPlan || currentPlan.monthlyPrice === selectedPlan.monthlyPrice
      ? 'switch'
      : selectedPlan.monthlyPrice > currentPlan.monthlyPrice
        ? 'upgrade'
        : 'downgrade';

  const ACTION_VERB = { upgrade: 'upgrade', downgrade: 'downgrade', switch: 'ganti' } as const;
  const ACTION_LABEL = { upgrade: 'Upgrade', downgrade: 'Downgrade', switch: 'Ganti Paket' } as const;

  const message = [
    'Halo Admin Inspira POS,',
    `Saya mau ${ACTION_VERB[direction]} paket toko *${tenant.name}*, mohon dibantu ya.`,
    '',
    `Toko: ${tenant.name}`,
    `Pemilik: ${tenant.user.name}`,
    `Email akun: ${tenant.user.email}`,
    `Kode toko: ${tenant.slug}`,
    `Alamat: ${tenant.address || '-'}`,
    '',
    `Paket saat ini: ${currentPlan?.name ?? tenant.plan}`,
    `Mau ${ACTION_VERB[direction]} ke: *${selectedPlan?.name ?? selected}* (${selectedPlan?.price ?? ''})`,
    '',
    'Mohon info langkah selanjutnya. Terima kasih!',
  ].join('\n');
  const waLink = `https://wa.me/${WHATSAPP_ADMIN_NUMBER}?text=${encodeURIComponent(message)}`;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Paket & Tagihan</CardTitle>
          <CardDescription>Lihat paket aktif dan ajukan perubahan paket kapan saja.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between rounded-xl bg-[var(--surface-2)] p-4">
            <div>
              <p className="text-sm font-semibold text-[var(--ink)]">{PLAN_LABELS[tenant.plan] ?? tenant.plan}</p>
              <p className="text-xs text-[var(--muted)]">Status: {tenant.status}</p>
            </div>
            <Badge variant={tenant.status === 'active' ? 'success' : 'accent'}>{tenant.status}</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pilih Paket</CardTitle>
          <CardDescription>Pilih paket yang sesuai kebutuhan toko kamu, lalu ajukan lewat WhatsApp.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {(['UMKM', 'F&B'] as const).map((group) => (
            <div key={group}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{group}</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {PLANS.filter((p) => p.group === group).map((plan) => {
                  const isSelected = selected === plan.code;
                  const isActive = tenant.plan === plan.code;
                  return (
                    <button
                      key={plan.code}
                      type="button"
                      onClick={() => setSelected(plan.code)}
                      className={cn(
                        'relative rounded-xl border p-4 text-left transition-colors active:scale-[0.98]',
                        isSelected
                          ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                          : 'border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-2)]'
                      )}
                    >
                      {isSelected && (
                        <span className="absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-ink)]">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                      <p className="text-sm font-semibold text-[var(--ink)]">{plan.name}</p>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">{plan.price}</p>
                      {isActive && (
                        <Badge variant="success" className="mt-2">Paket Aktif</Badge>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <a href={waLink} target="_blank" rel="noreferrer">
            <Button className="w-full" disabled={isCurrentPlan}>
              {isCurrentPlan ? 'Ini Paket Kamu Saat Ini' : `Ajukan ${ACTION_LABEL[direction]} via WhatsApp`}
            </Button>
          </a>
          <p className="text-center text-xs text-[var(--muted)]">
            Pesan WA sudah otomatis terisi info toko & paket pilihan kamu — tinggal kirim ke Admin.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
