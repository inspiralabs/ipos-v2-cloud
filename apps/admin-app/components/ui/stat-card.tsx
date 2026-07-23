import type { BadgeTone } from './badge';

const TONE_TEXT: Record<BadgeTone, string> = {
  trial: 'text-[var(--status-trial)]',
  active: 'text-[var(--status-active)]',
  expired: 'text-[var(--status-expired)]',
  inactive: 'text-[var(--muted)]',
  progress: 'text-[var(--accent)]',
};

export function StatCard({ label, value, tone }: { label: string; value: number; tone: BadgeTone }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="font-display text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className={`mt-1 font-display text-2xl font-bold tabular-nums ${TONE_TEXT[tone]}`}>{value}</p>
    </div>
  );
}
