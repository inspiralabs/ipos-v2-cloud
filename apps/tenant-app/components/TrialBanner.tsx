'use client';

import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { getTrialDaysLeft, getTrialState } from '@/lib/trial';
import type { Tenant } from '@/lib/types';
import { Button } from './ui/button';

/** Banner persisten untuk TRIAL_EXPIRING; TRIAL_EXPIRED dikunci total lewat TrialExpiredOverlay (lihat dashboard layout). */
export function TrialBanner({ tenant, children }: { tenant: Pick<Tenant, 'status' | 'trial_ends_at'>; children?: ReactNode }) {
  const [dismissed, setDismissed] = useState(false);
  const state = getTrialState(tenant);

  if (state !== 'TRIAL_EXPIRING' || dismissed) return <>{children}</>;

  const daysLeft = getTrialDaysLeft(tenant);
  return (
    <>
      <div className="flex items-center justify-between gap-3 bg-amber-100 px-4 py-2 text-sm text-amber-900">
        <span>
          Trial berakhir dalam {daysLeft} hari — <strong>Upgrade Sekarang</strong> supaya toko tetap jalan tanpa jeda.
        </span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => setDismissed(true)} aria-label="Tutup">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {children}
    </>
  );
}
