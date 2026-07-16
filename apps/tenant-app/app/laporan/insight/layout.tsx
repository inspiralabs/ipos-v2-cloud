'use client';

import { TenantProvider } from '@/components/layout/TenantContext';

export default function InsightLayout({ children }: { children: React.ReactNode }) {
  return <TenantProvider>{children}</TenantProvider>;
}
