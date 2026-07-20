'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Store, Printer, QrCode, Bell, CreditCard, Palette } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useTenant } from '@/components/layout/TenantContext';
import { getTrialDaysLeft } from '@/lib/trial';

const BASE_ITEMS = [
  { href: '/pengaturan/profil', label: 'Profil Toko', desc: 'Nama, alamat, logo toko', icon: Store },
  { href: '/pengaturan/printer', label: 'Printer', desc: 'Sambungkan printer struk', icon: Printer },
  { href: '/pengaturan/qris', label: 'QRIS', desc: 'Kelola pembayaran QRIS', icon: QrCode },
  { href: '/pengaturan/notifikasi', label: 'Notifikasi', desc: 'Pengingat & pemberitahuan', icon: Bell },
  { href: '/pengaturan/billing', label: 'Paket & Tagihan', desc: 'Plan aktif, upgrade paket', icon: CreditCard },
  { href: '/pengaturan/tema', label: 'Tema', desc: 'Warna tampilan toko', icon: Palette },
];

export default function PengaturanPage() {
  const { tenant } = useTenant();
  const profileComplete = Boolean(tenant.name && tenant.address);
  const billingDesc =
    tenant.status === 'trial'
      ? `${tenant.plan.replace('_', ' ')} — trial ${getTrialDaysLeft(tenant)} hari tersisa`
      : `${tenant.plan.replace('_', ' ')} — plan aktif`;

  const items = BASE_ITEMS.map((item) => {
    if (item.href === '/pengaturan/billing') return { ...item, desc: billingDesc };
    return item;
  });

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-xl font-bold text-[var(--ink)]">Pengaturan</h1>
      <motion.div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
      >
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <motion.div key={item.href} variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}>
              <Link href={item.href}>
                <Card className="relative flex min-h-[140px] flex-col items-center justify-center gap-2 p-6 text-center transition-colors hover:bg-[var(--surface-2)] active:scale-[0.98]">
                  {item.href === '/pengaturan/profil' && profileComplete && (
                    <Badge variant="success" className="absolute right-3 top-3">
                      Lengkap
                    </Badge>
                  )}
                  {(item.href === '/pengaturan/printer' || item.href === '/pengaturan/qris') && (
                    // Belum tersambung ke backend riil — badge statis sebagai simplifikasi yang disepakati.
                    <Badge variant="warning" className="absolute right-3 top-3">
                      Belum diatur
                    </Badge>
                  )}
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface-2)]">
                    <Icon className="h-7 w-7 text-[var(--ink)]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[var(--ink)]">{item.label}</p>
                    <p className="text-xs text-[var(--muted)]">{item.desc}</p>
                  </div>
                </Card>
              </Link>
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
