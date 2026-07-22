'use client';

import { useState, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { useTenant } from './layout/TenantContext';
import { hasFeature } from '@/lib/plan-features';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { UpgradeBanner } from './UpgradeBanner';

/** Fitur di luar plan: JANGAN disembunyikan (PRD §2.4/§10.3) — tampil terkunci + overlay klik-untuk-upgrade. */
export function PlanGate({ featureKey, featureLabel, children }: { featureKey: string; featureLabel?: string; children: ReactNode }) {
  const { tenant } = useTenant();
  const [open, setOpen] = useState(false);
  const allowed = hasFeature(tenant.plan, featureKey, tenant.feature_overrides);

  if (allowed) return <>{children}</>;

  return (
    <>
      <div className="relative">
        <div className="pointer-events-none select-none opacity-40 blur-[1px]">{children}</div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="absolute inset-0 flex items-center justify-center rounded-2xl bg-[var(--surface)]/40"
          aria-label="Fitur terkunci, klik untuk upgrade"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface)] shadow-md">
            <Lock className="h-5 w-5 text-[var(--muted)]" />
          </span>
        </button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upgrade Paket</DialogTitle>
          </DialogHeader>
          <UpgradeBanner variant="inline" featureLabel={featureLabel} />
        </DialogContent>
      </Dialog>
    </>
  );
}
