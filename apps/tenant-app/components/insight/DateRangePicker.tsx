'use client';

export type DateRange = { from: string; to: string };
export type Period = 'daily' | 'weekly' | 'monthly' | 'yearly';

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function rangeForPeriod(period: Period): DateRange {
  const now = new Date();
  const to = toISODate(now);
  if (period === 'daily') return { from: to, to };
  if (period === 'weekly') {
    const from = new Date(now);
    from.setDate(from.getDate() - 7);
    return { from: toISODate(from), to };
  }
  if (period === 'monthly') {
    const from = new Date(now);
    from.setDate(from.getDate() - 30);
    return { from: toISODate(from), to };
  }
  const from = new Date(now);
  from.setFullYear(from.getFullYear() - 1);
  return { from: toISODate(from), to };
}

export function granularityForPeriod(period: Period): 'hour' | 'day' | 'week' | 'month' {
  if (period === 'daily') return 'hour';
  if (period === 'weekly') return 'day';
  if (period === 'monthly') return 'week';
  return 'month';
}

// Kompat lama — dipakai app/laporan/insight/page.tsx yang belum ikut redesign task ini.
export function rangeFor(preset: 'today' | 'week' | 'month'): DateRange {
  return rangeForPeriod(preset === 'today' ? 'daily' : preset === 'week' ? 'weekly' : 'monthly');
}

export function PeriodSwitcher({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  const options: Array<{ key: Period; label: string }> = [
    { key: 'daily', label: 'Harian' },
    { key: 'weekly', label: 'Mingguan' },
    { key: 'monthly', label: 'Bulanan' },
    { key: 'yearly', label: 'Tahunan' },
  ];
  return (
    <div className="flex gap-2 overflow-x-auto">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`h-10 shrink-0 rounded-full px-4 text-sm font-medium ${
            value === o.key ? 'bg-[var(--nav-active)] text-[var(--nav-active-ink)]' : 'border border-[var(--border)] text-[var(--ink)]'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Kompat lama — dipakai app/laporan/insight/page.tsx (belum ikut redesign task ini).
export function DateRangePicker({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const presets: Array<{ key: 'today' | 'week' | 'month'; label: string }> = [
    { key: 'today', label: 'Hari Ini' },
    { key: 'week', label: 'Minggu Ini' },
    { key: 'month', label: 'Bulan Ini' },
  ];
  return (
    <div className="flex gap-2">
      {presets.map((p) => {
        const presetRange = rangeFor(p.key);
        const active = presetRange.from === value.from && presetRange.to === value.to;
        return (
          <button
            key={p.key}
            onClick={() => onChange(presetRange)}
            className={`h-9 rounded-full px-3 text-sm font-medium ${active ? 'bg-[var(--nav-active)] text-[var(--nav-active-ink)]' : 'border border-[var(--border)] text-[var(--ink)]'}`}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
