'use client';

import { LogOut, ChevronDown, PanelLeft } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { clearToken } from '@/lib/auth';
import { useTenant } from './TenantContext';
import { TrialBadge } from '../TrialBadge';
import { ThemeToggleRow } from '../ThemeToggle';
import { Avatar } from '../Avatar';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover';

export function Topbar({ onToggleSidebar }: { onToggleSidebar: () => void }) {
  const router = useRouter();
  const { tenant } = useTenant();

  function logout() {
    clearToken();
    router.replace('/login');
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label="Buka/tutup sidebar"
          className="hidden h-9 w-9 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)] md:flex landscape:flex"
        >
          <PanelLeft className="h-4.5 w-4.5" />
        </button>
        <span className="text-sm font-bold text-[var(--ink)]">{tenant.name}</span>
        <TrialBadge tenant={tenant} />
      </div>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2 rounded-xl px-1.5 py-1 transition-colors hover:bg-[var(--surface-2)]"
            aria-label="Menu profil"
          >
            <Avatar name={tenant.user.name} size="sm" />
            <span className="hidden text-sm text-[var(--ink)] sm:inline">{tenant.user.name}</span>
            <ChevronDown className="h-3.5 w-3.5 text-[var(--muted)]" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-2">
          <div className="mb-1 px-3 py-2">
            <p className="truncate text-sm font-semibold text-[var(--ink)]">{tenant.user.name}</p>
            <p className="truncate text-xs text-[var(--muted)]">{tenant.user.email}</p>
          </div>
          <div className="my-1 h-px bg-[var(--border)]" />
          <ThemeToggleRow />
          <div className="my-1 h-px bg-[var(--border)]" />
          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-red-500 hover:bg-red-500/10"
          >
            <LogOut className="h-4 w-4" /> Keluar
          </button>
        </PopoverContent>
      </Popover>
    </header>
  );
}
