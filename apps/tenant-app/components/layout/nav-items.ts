import type { ComponentType } from 'react';
import {
  LayoutDashboard, ShoppingCart, UtensilsCrossed, Users, Boxes, FileBarChart, Settings,
  LayoutGrid, ChefHat, Bell, Building2, PiggyBank, Beef, Star, CalendarCheck,
  type LucideProps,
} from 'lucide-react';

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
  { href: '/meja', label: 'Meja', icon: LayoutGrid, featureKey: 'table_management' },
  { href: '/dapur', label: 'Dapur', icon: ChefHat, featureKey: 'kitchen_display' },
  { href: '/waiter', label: 'Waiter', icon: Bell, featureKey: 'table_management' },
  { href: '/pelanggan', label: 'Pengguna', icon: Users }, // Kelola Staf sekarang jadi tab di /pelanggan — lihat app/(dashboard)/pelanggan/page.tsx
  { href: '/inventory', label: 'Inventory', icon: Boxes, featureKey: 'stock_management' },
  { href: '/bahan-baku', label: 'Bahan Baku', icon: Beef, featureKey: 'bom_recipe' },
  { href: '/cabang', label: 'Cabang', icon: Building2, featureKey: 'multi_outlet' },
  { href: '/loyalty', label: 'Loyalty', icon: Star, featureKey: 'loyalty_program' },
  { href: '/absensi', label: 'Absensi', icon: CalendarCheck, featureKey: 'absensi' },
  { href: '/laporan', label: 'Laporan', icon: FileBarChart },
  { href: '/laporan/resto', label: 'Food Cost & P&L', icon: PiggyBank, featureKey: 'food_cost_report' },
  { href: '/pengaturan', label: 'Pengaturan', icon: Settings },
];

/** Subset dipakai BottomNav mobile (maks 5 slot, Kasir jadi CTA tengah). Referensi by href, bukan
 * index — NAV_ITEMS sudah bertambah panjang (modul Resto), index magic gampang salah geser. */
function navByHref(href: string): NavItem {
  const item = NAV_ITEMS.find((n) => n.href === href);
  if (!item) throw new Error(`nav item ${href} tidak ditemukan`);
  return item;
}

export const BOTTOM_NAV_ITEMS: NavItem[] = [
  navByHref('/'),
  navByHref('/menu'),
  navByHref('/pos'), // CTA tengah
  navByHref('/laporan'),
  navByHref('/pengaturan'),
];
