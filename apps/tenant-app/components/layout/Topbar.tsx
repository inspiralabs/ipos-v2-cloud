'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { clearToken } from '@/lib/auth';
import { useTenant } from './TenantContext';
import { TrialBadge } from '../TrialBadge';
import { ThemeToggle } from '../ThemeToggle';
import { Button } from '../ui/button';

export function Topbar() {
  const router = useRouter();
  const { tenant } = useTenant();

  function logout() {
    clearToken();
    router.replace('/login');
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-bold text-[var(--ink)]">{tenant.name}</span>
        <TrialBadge tenant={tenant} />
      </div>
      <div className="flex items-center gap-2">
        <span className="hidden text-sm text-[var(--muted)] sm:inline">{tenant.user.name}</span>
        <ThemeToggle />
        <Button variant="ghost" size="icon" onClick={logout} aria-label="Keluar">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
