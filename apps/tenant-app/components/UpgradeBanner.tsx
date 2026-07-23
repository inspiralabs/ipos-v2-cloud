import { Sparkles } from 'lucide-react';
import { Button } from './ui/button';

const WHATSAPP_ADMIN = 'https://wa.me/6281234567890'; // TODO: ganti nomor WA admin asli sebelum rilis

/** Konten upgrade — dipakai PlanGate (dialog saat klik overlay terkunci) dan sebagai banner inline penuh halaman. */
export function UpgradeBanner({ variant = 'overlay', featureLabel }: { variant?: 'overlay' | 'inline'; featureLabel?: string }) {
  return (
    <div
      className={
        variant === 'inline'
          ? 'flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-6 text-center'
          : 'flex flex-col items-center gap-3 text-center'
      }
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent)]/20 text-[var(--ink)]">
        <Sparkles className="h-5 w-5" />
      </div>
      <div>
        <p className="text-sm font-semibold text-[var(--ink)]">
          {featureLabel ? `${featureLabel} butuh paket lebih tinggi` : 'Fitur ini butuh paket lebih tinggi'}
        </p>
        <p className="text-xs text-[var(--muted)]">Upgrade paket untuk membuka fitur ini kapan saja.</p>
      </div>
      <a href={WHATSAPP_ADMIN} target="_blank" rel="noreferrer">
        <Button size="sm">Upgrade ke Pro</Button>
      </a>
    </div>
  );
}
