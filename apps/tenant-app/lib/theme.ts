const KEY = 'tenant_theme'; // 'light' | 'dark' | 'system'

export function getTheme(): 'light' | 'dark' | 'system' {
  if (typeof window === 'undefined') return 'light';
  return (localStorage.getItem(KEY) as 'light' | 'dark' | 'system') ?? 'light';
}

export function setTheme(theme: 'light' | 'dark' | 'system') {
  localStorage.setItem(KEY, theme);
  applyTheme(theme);
}

export function applyTheme(theme: 'light' | 'dark' | 'system') {
  const root = document.documentElement;
  if (theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}

/** Inline-script source (string) dijalankan sebelum hydration supaya tidak ada kedipan tema salah. */
export const noFlashScript = `
try {
  var t = localStorage.getItem('${KEY}');
  if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
} catch (e) {}
`;
