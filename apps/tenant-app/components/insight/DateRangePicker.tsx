'use client';

import { Button } from '@/components/ui/button';

export type DateRange = { from: string; to: string };

function toISODate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function rangeFor(preset: 'today' | 'week' | 'month'): DateRange {
  const now = new Date();
  const to = toISODate(now);
  if (preset === 'today') return { from: to, to };
  if (preset === 'week') {
    const from = new Date(now);
    from.setDate(from.getDate() - 7);
    return { from: toISODate(from), to };
  }
  const from = new Date(now);
  from.setDate(from.getDate() - 30);
  return { from: toISODate(from), to };
}

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
          <Button
            key={p.key}
            size="sm"
            variant={active ? 'primary' : 'outline'}
            onClick={() => onChange(presetRange)}
          >
            {p.label}
          </Button>
        );
      })}
    </div>
  );
}

export { rangeFor };
