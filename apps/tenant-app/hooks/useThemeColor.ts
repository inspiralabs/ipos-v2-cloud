'use client';

import { useEffect } from 'react';
import { apiFetch } from '@/lib/auth';

// Port dari ipos-offline src/hooks/use-theme-color.ts — 9 preset hue tetap (OKLCH, bukan hex bebas),
// disimpan di tenants.theme_color lewat PATCH /me (bukan IndexedDB, karena cloud multi-device).
export const THEME_COLORS = [
  { name: 'Maroon', hue: '4', oklch: '0.32 0.135 25' },
  { name: 'Biru', hue: '215', oklch: '0.55 0.2 255' },
  { name: 'Oranye', hue: '25', oklch: '0.68 0.19 45' },
  { name: 'Hijau', hue: '142', oklch: '0.6 0.15 145' },
  { name: 'Ungu', hue: '262', oklch: '0.5 0.22 295' },
  { name: 'Merah', hue: '0', oklch: '0.6 0.22 25' },
  { name: 'Pink', hue: '330', oklch: '0.6 0.2 350' },
  { name: 'Teal', hue: '172', oklch: '0.68 0.13 185' },
  { name: 'Kuning', hue: '45', oklch: '0.72 0.15 85' },
] as const;

export const DEFAULT_THEME_HUE = '4'; // Maroon — brand default Inspira POS

export function getThemeOKLCH(hue: string) {
  return THEME_COLORS.find((c) => c.hue === hue)?.oklch ?? THEME_COLORS[0].oklch;
}

export function applyThemeColor(hue: string) {
  if (typeof window === 'undefined') return;
  const oklch = `oklch(${getThemeOKLCH(hue)})`;
  document.documentElement.style.setProperty('--primary', oklch);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', oklch);
}

/** Terapkan warna tersimpan tenant setiap kali berubah (dipanggil dari shell, bukan per-halaman). */
export function useThemeColor(themeColor: string | undefined) {
  useEffect(() => {
    applyThemeColor(themeColor ?? DEFAULT_THEME_HUE);
  }, [themeColor]);
}

/** Optimistic: terapkan dulu di DOM, baru simpan ke server. Rollback ke warna lama kalau gagal. */
export async function setThemeColor(hue: string, previousHue: string) {
  applyThemeColor(hue);
  try {
    await apiFetch('/api/v1/tenants/me', { method: 'PATCH', body: JSON.stringify({ theme_color: hue }) });
  } catch (e) {
    applyThemeColor(previousHue);
    throw e;
  }
}
