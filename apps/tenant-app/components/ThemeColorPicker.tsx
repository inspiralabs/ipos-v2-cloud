'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { THEME_COLORS } from '@/hooks/useThemeColor';

export function ThemeColorPicker({ value, onChange }: { value: string; onChange: (hue: string) => void }) {
  return (
    <div>
      <div className="grid grid-cols-5 gap-3 sm:grid-cols-9">
        {THEME_COLORS.map((color) => {
          const active = color.hue === value;
          return (
            <button
              key={color.hue}
              type="button"
              aria-label={color.name}
              title={color.name}
              onClick={() => onChange(color.hue)}
              className={cn(
                'relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-offset-2 ring-offset-[var(--surface)] transition-transform active:scale-95',
                active && 'ring-2 ring-[var(--ink)]'
              )}
              style={{ backgroundColor: `oklch(${color.oklch})` }}
            >
              {active && <Check className="h-5 w-5 text-white drop-shadow" />}
            </button>
          );
        })}
      </div>
      <div className="mt-4 flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <button className="h-11 rounded-xl bg-[var(--primary)] px-4 text-sm font-bold text-[var(--primary-ink)]">
          Bayar
        </button>
        <span className="rounded-full bg-[var(--nav-active)] px-3 py-1.5 text-xs font-medium text-[var(--nav-active-ink)]">
          Nav aktif
        </span>
      </div>
    </div>
  );
}
