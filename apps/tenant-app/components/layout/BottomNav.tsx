'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { BOTTOM_NAV_ITEMS } from './nav-items';

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex h-[60px] items-end justify-around border-t border-[var(--border)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] md:hidden landscape:hidden">
      {BOTTOM_NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
        const isCta = item.label === 'Kasir';
        const Icon = item.icon;
        if (isCta) {
          return (
            <Link
              key={item.href}
              href={item.href}
              className="relative -top-4 flex h-14 w-14 min-h-[44px] items-center justify-center rounded-full bg-[var(--primary)] text-[var(--primary-ink)] shadow-lg active:scale-95"
            >
              <Icon className="h-6 w-6" />
            </Link>
          );
        }
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium',
              active ? 'text-[var(--primary)]' : 'text-[var(--muted)]'
            )}
          >
            <Icon className="h-5 w-5" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
