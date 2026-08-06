'use client';

import { useEffect, useState } from 'react';
import { applyTheme, getTheme, setTheme } from '../lib/theme';
import { Switch } from './ui/switch';

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
    </svg>
  );
}

function useDarkMode() {
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

  return { dark, toggle };
}

export function ThemeToggle() {
  const { dark, toggle } = useDarkMode();

  return (
    <button
      onClick={toggle}
      aria-label={dark ? 'Mode terang' : 'Mode gelap'}
      title={dark ? 'Mode terang' : 'Mode gelap'}
      className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--ink)]"
    >
      {dark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

/** Baris switch mode gelap — dipakai di dalam dropdown profil (Topbar), bukan icon button berdiri sendiri. */
export function ThemeToggleRow() {
  const { dark, toggle } = useDarkMode();

  return (
    <label className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-sm text-[var(--ink)] hover:bg-[var(--surface-2)]">
      <span className="flex items-center gap-2.5">
        {dark ? <MoonIcon /> : <SunIcon />}
        Mode Gelap
      </span>
      <Switch checked={dark} onCheckedChange={toggle} />
    </label>
  );
}
