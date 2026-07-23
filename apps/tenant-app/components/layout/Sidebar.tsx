'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hasFeature } from '@/lib/plan-features';
import { useTenant } from './TenantContext';
import { NAV_ITEMS } from './nav-items';

export function Sidebar() {
  const pathname = usePathname();
  const { tenant } = useTenant();

  return (
    <aside className="hidden w-56 shrink-0 flex-col gap-1 border-r border-[var(--border)] bg-[var(--surface)] p-3 md:flex landscape:flex">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
        const locked = item.featureKey ? !hasFeature(tenant.plan, item.featureKey) : false;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
              active ? 'bg-[var(--primary)] text-[var(--primary-ink)]' : 'text-[var(--ink)] hover:bg-[var(--surface-2)]',
              locked && !active && 'text-[var(--muted)]'
            )}
          >
            <Icon className="h-4.5 w-4.5 shrink-0" />
            <span className="flex-1">{item.label}</span>
            {locked && <Lock className="h-3.5 w-3.5 shrink-0" />}
          </Link>
        );
      })}
    </aside>
  );
}
