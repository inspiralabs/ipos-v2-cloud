// ponytail: satu tab browser, satu sesi — localStorage cukup, tidak perlu state library.
const KEY = 'ipos_tenant_token';

export function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(KEY);
}

export function setToken(token: string) {
  localStorage.setItem(KEY, token);
}

export function clearToken() {
  localStorage.removeItem(KEY);
}

export async function apiFetch(path: string, init?: RequestInit) {
  const token = getToken();
  const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}${path}`, {
    ...init,
    headers: {
      // FormData: biarkan browser set Content-Type multipart + boundary sendiri.
      ...(init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    // ponytail: satu guard di sini — token expired/invalid dari request mana pun (load
    // awal atau submit form) langsung balik ke login, bukan cuma tampil pesan error mentah.
    if (res.status === 401) {
      clearToken();
      if (typeof window !== 'undefined') window.location.href = '/login';
    }
    throw Object.assign(new Error(err.error || 'Request failed'), { status: res.status, code: err.code });
  }
  if (res.status === 204) return null;
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}
