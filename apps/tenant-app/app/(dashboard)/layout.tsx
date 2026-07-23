'use client';

import { TenantProvider, useTenant } from '@/components/layout/TenantContext';
import { Topbar } from '@/components/layout/Topbar';
import { Sidebar } from '@/components/layout/Sidebar';
import { BottomNav } from '@/components/layout/BottomNav';
import { TrialBanner } from '@/components/TrialBanner';
import { TrialExpiredOverlay } from '@/components/TrialExpiredOverlay';
import { useThemeColor } from '@/hooks/useThemeColor';

function Shell({ children }: { children: React.ReactNode }) {
  const { tenant } = useTenant();
  useThemeColor(tenant.theme_color);

  return (
    <div className="flex h-dvh flex-col md:flex-row landscape:flex-row">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
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
