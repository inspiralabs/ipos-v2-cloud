'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { hasFeature } from '@/lib/plan-features';
import { useTenant } from './TenantContext';
import { NAV_ITEMS } from './nav-items';

export function Sidebar({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname();
  const { tenant } = useTenant();

  return (
    <aside
      className={cn(
        'hidden shrink-0 flex-col gap-1 border-r border-[var(--border)] bg-[var(--surface)] p-3 transition-[width] duration-200 md:flex landscape:flex',
        collapsed ? 'w-[68px]' : 'w-56'
      )}
    >
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href;
        const locked = item.featureKey ? !hasFeature(tenant.plan, item.featureKey) : false;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            title={collapsed ? item.label : undefined}
            className={cn(
              'flex min-h-[44px] items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors',
              collapsed && 'justify-center px-0',
              active ? 'bg-[var(--primary)] text-[var(--primary-ink)]' : 'text-[var(--ink)] hover:bg-[var(--surface-2)]',
              locked && !active && 'text-[var(--muted)]'
            )}
          >
            <Icon className="h-4.5 w-4.5 shrink-0" />
            {!collapsed && (
              <>
                <span className="flex-1">{item.label}</span>
                {locked && <Lock className="h-3.5 w-3.5 shrink-0" />}
              </>
            )}
          </Link>
        );
      })}
    </aside>
  );
}
