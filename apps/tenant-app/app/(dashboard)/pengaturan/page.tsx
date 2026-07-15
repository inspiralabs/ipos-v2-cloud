'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Store, Printer, QrCode, Bell, CreditCard, Palette } from 'lucide-react';
import { Card } from '@/components/ui/card';

const ITEMS = [
  { href: '/pengaturan/profil', label: 'Profil Toko', desc: 'Nama, alamat, logo toko', icon: Store },
  { href: '/pengaturan/printer', label: 'Printer', desc: 'Sambungkan printer struk', icon: Printer },
  { href: '/pengaturan/qris', label: 'QRIS', desc: 'Kelola pembayaran QRIS', icon: QrCode },
  { href: '/pengaturan/notifikasi', label: 'Notifikasi', desc: 'Pengingat & pemberitahuan', icon: Bell },
  { href: '/pengaturan/billing', label: 'Paket & Tagihan', desc: 'Plan aktif, upgrade paket', icon: CreditCard },
  { href: '/pengaturan/tema', label: 'Tema', desc: 'Warna tampilan toko', icon: Palette },
];

export default function PengaturanPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-xl font-bold text-[var(--ink)]">Pengaturan</h1>
      <motion.div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
      >
        {ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <motion.div key={item.href} variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}>
              <Link href={item.href}>
                <Card className="flex min-h-[140px] flex-col items-center justify-center gap-2 p-6 text-center transition-colors hover:bg-[var(--surface-2)] active:scale-[0.98]">
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
