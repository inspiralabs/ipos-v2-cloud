import type { ComponentType } from 'react';
import { LayoutDashboard, ShoppingCart, UtensilsCrossed, Users, Boxes, FileBarChart, Settings, type LucideProps } from 'lucide-react';

export type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<LucideProps>;
  featureKey?: string;
};

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/pos', label: 'Kasir', icon: ShoppingCart },
  { href: '/menu', label: 'Menu', icon: UtensilsCrossed },
  { href: '/pelanggan', label: 'Pengguna', icon: Users }, // Kelola Staf sekarang jadi tab di /pelanggan — lihat app/(dashboard)/pelanggan/page.tsx
  { href: '/inventory', label: 'Inventory', icon: Boxes, featureKey: 'stock_management' },
  { href: '/laporan', label: 'Laporan', icon: FileBarChart },
  { href: '/pengaturan', label: 'Pengaturan', icon: Settings },
];

/** Subset dipakai BottomNav mobile (maks 5 slot, Kasir jadi CTA tengah). */
export const BOTTOM_NAV_ITEMS: NavItem[] = [
  NAV_ITEMS[0], // Dashboard
  NAV_ITEMS[2], // Menu
  NAV_ITEMS[1], // Kasir (CTA)
  NAV_ITEMS[5], // Laporan
  NAV_ITEMS[6], // Pengaturan
];
