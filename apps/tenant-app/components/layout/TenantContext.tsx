'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, clearToken, getToken } from '@/lib/auth';
import type { Tenant } from '@/lib/types';

type TenantContextValue = {
  tenant: Tenant;
  refetch: () => Promise<void>;
};

const TenantContext = createContext<TenantContextValue | null>(null);

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error('useTenant harus dipakai di dalam <TenantProvider>');
  return ctx;
}

/** Fetch GET /api/v1/tenants/me sekali per mount, redirect ke /login kalau tidak ada token/401. */
export function TenantProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [error, setError] = useState('');

  async function load() {
    const data = await apiFetch('/api/v1/tenants/me');
    if (!data.setup_completed_at) {
      router.replace('/setup');
      return;
    }
    setTenant(data);
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    load().catch((e) => {
      if (e.status === 401) {
        clearToken();
        router.replace('/login');
      } else {
        setError(e.message);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return <div className="flex h-dvh items-center justify-center text-sm text-[var(--muted)]">{error}</div>;
  }

  if (!tenant) {
    return <div className="flex h-dvh items-center justify-center text-sm text-[var(--muted)]">Memuat…</div>;
  }

  return <TenantContext.Provider value={{ tenant, refetch: load }}>{children}</TenantContext.Provider>;
}
