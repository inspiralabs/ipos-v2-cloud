'use client';

import { useEffect, useState } from 'react';
import { TenantProvider, useTenant } from '@/components/layout/TenantContext';
import { Topbar } from '@/components/layout/Topbar';
import { Sidebar } from '@/components/layout/Sidebar';
import { BottomNav } from '@/components/layout/BottomNav';
import { TrialBanner } from '@/components/TrialBanner';
import { TrialExpiredOverlay } from '@/components/TrialExpiredOverlay';

const SIDEBAR_COLLAPSED_KEY = 'ipos_sidebar_collapsed';

function Shell({ children }: { children: React.ReactNode }) {
  const { tenant } = useTenant();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1');
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      return next;
    });
  }

  return (
    <div className="flex h-dvh flex-col md:flex-row landscape:flex-row">
      <Sidebar collapsed={collapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onToggleSidebar={toggleCollapsed} />
        <TrialBanner tenant={tenant}>
          <main className="flex-1 overflow-y-auto px-4 py-4 pb-20 md:pb-4 landscape:pb-4">{children}</main>
        </TrialBanner>
      </div>
      <BottomNav />
      <TrialExpiredOverlay tenant={tenant} />
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <TenantProvider>
      <Shell>{children}</Shell>
    </TenantProvider>
  );
}
