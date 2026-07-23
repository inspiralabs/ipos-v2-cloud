import type { Tenant } from '@/lib/types';
import { getTrialState } from '@/lib/trial';
import { Button } from './ui/button';
import { buttonVariantClass } from './ui/button-variants';

const WHATSAPP_ADMIN = 'https://wa.me/6281234567890'; // TODO: ganti nomor WA admin asli sebelum rilis

/** Full-screen lock — semua fitur dikunci kecuali Upgrade dan Hubungi Kami (PRD §3.5/§10.4). */
export function TrialExpiredOverlay({ tenant }: { tenant: Pick<Tenant, 'status' | 'trial_ends_at'> }) {
  if (getTrialState(tenant) !== 'TRIAL_EXPIRED') return null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-[var(--bg)] p-6 text-center">
      <h1 className="text-xl font-bold text-[var(--ink)]">Masa coba Anda telah berakhir</h1>
      <p className="max-w-sm text-sm text-[var(--muted)]">
        Data toko kamu aman tersimpan. Upgrade sekarang untuk lanjut jualan tanpa jeda.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button size="lg">Upgrade Sekarang</Button>
        <a href={WHATSAPP_ADMIN} target="_blank" rel="noreferrer" className={buttonVariantClass('outline', 'lg')}>
          Hubungi Kami
        </a>
      </div>
    </div>
  );
}
