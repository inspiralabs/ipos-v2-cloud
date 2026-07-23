'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { KeyRound, Building2, Users2, ShieldCheck, ScrollText, LogOut } from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import { ThemeToggle } from '@/components/ThemeToggle';

const NAV = [
  { href: '/licenses', label: 'Lisensi Offline', icon: KeyRound },
  { href: '/tenants', label: 'Tenant', icon: Building2 },
  { href: '/leads', label: 'Leads', icon: Users2 },
  { href: '/admins', label: 'Kelola Admin', icon: ShieldCheck, superAdminOnly: true },
  { href: '/audit-log', label: 'Audit Log', icon: ScrollText, superAdminOnly: true },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { accessToken, user, setAuth, logout } = useAuthStore();
  const [checking, setChecking] = useState(true);
  const nav = NAV.filter((n) => !n.superAdminOnly || user?.role === 'super_admin');

  useEffect(() => {
    if (accessToken) { setChecking(false); return; }
    // Reload/direct nav loses in-memory accessToken — coba tukar refresh_token (httpOnly
    // cookie) jadi access_token baru dulu sebelum memutuskan sesi benar-benar habis.
    let cancelled = false;
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/refresh`, { method: 'POST', credentials: 'include' })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => { if (!cancelled) setAuth(data.access_token, data.user); })
      .catch(() => { if (!cancelled) router.replace('/login'); })
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [accessToken, router, setAuth]);

  if (checking || !accessToken) return null;

  return (
    <div className="flex min-h-screen bg-[var(--bg)]">
      {/* Sidebar — desktop */}
      <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] px-4 py-6">
        <p className="px-2 font-display text-lg font-bold text-[var(--ink)]">Inspira POS</p>
        <p className="px-2 mb-6 text-xs text-[var(--muted)]">Admin Panel</p>
        <nav className="flex flex-1 flex-col gap-1">
          {nav.map((n) => {
            const active = pathname === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-[var(--primary)] text-[var(--primary-ink)]'
                    : 'text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]'
                }`}
              >
                <n.icon className="h-4 w-4 shrink-0" aria-hidden />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-[var(--border)] pt-4">
          <div className="mb-3 flex items-center justify-between px-2">
            <p className="truncate text-sm font-medium text-[var(--ink)]">{user?.name}</p>
            <ThemeToggle />
          </div>
          <button
            onClick={() => { logout(); router.replace('/login'); }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--status-expired)] hover:bg-[var(--status-expired)]/10 transition-colors"
          >
            <LogOut className="h-4 w-4" aria-hidden /> Keluar
          </button>
        </div>
      </aside>

      {/* Top bar — mobile */}
      <header className="lg:hidden fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4">
        <p className="font-display text-base font-bold text-[var(--ink)]">Inspira POS Admin</p>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={() => { logout(); router.replace('/login'); }}
            aria-label="Keluar"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-[var(--status-expired)] hover:bg-[var(--status-expired)]/10"
          >
            <LogOut className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </header>

      <main className="flex-1 min-w-0 px-4 py-6 pt-20 pb-24 lg:px-8 lg:pt-6 lg:pb-6">
        <div className="mx-auto max-w-[1400px]">{children}</div>
      </main>

      {/* Bottom nav — mobile */}
      <nav className="lg:hidden fixed inset-x-0 bottom-0 z-30 flex border-t border-[var(--border)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)]">
        {nav.map((n) => {
          const active = pathname === n.href;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium ${
                active ? 'text-[var(--primary)]' : 'text-[var(--muted)]'
              }`}
            >
              <n.icon className="h-5 w-5" aria-hidden />
              {n.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
