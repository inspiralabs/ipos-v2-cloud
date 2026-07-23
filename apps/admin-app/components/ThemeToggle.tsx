'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { applyTheme, getTheme, setTheme } from '@/lib/theme';

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = getTheme();
    const isDark = saved === 'dark' || (saved === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    setDark(isDark);
    applyTheme(saved);
  }, []);

  function toggle() {
    const next = dark ? 'light' : 'dark';
    setDark(!dark);
    setTheme(next);
  }

  return (
    <button
      onClick={toggle}
      aria-label={dark ? 'Mode terang' : 'Mode gelap'}
      title={dark ? 'Mode terang' : 'Mode gelap'}
      className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)] transition-colors"
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
