import { useAuthStore } from './store';

const BASE = process.env.NEXT_PUBLIC_API_URL || '';

// Pesan yang manusia bisa langsung paham dari toast, tanpa perlu buka devtools.
const STATUS_MESSAGE: Record<number, string> = {
  400: 'Data yang dikirim tidak valid. Periksa lagi isiannya.',
  401: 'Sesi kamu berakhir. Silakan login lagi.',
  403: 'Kamu tidak punya izin untuk melakukan ini.',
  404: 'Data tidak ditemukan. Mungkin sudah dihapus atau dipindah.',
  409: 'Aksi ini bentrok dengan data lain, tidak bisa dilanjutkan.',
  429: 'Terlalu banyak percobaan. Coba lagi sebentar lagi.',
};

export async function apiFetch(path: string, init?: RequestInit) {
  const token = useAuthStore.getState().accessToken;
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new Error('Tidak bisa terhubung ke server. Periksa koneksi internet kamu.');
  }

  if (!res.headers.get('content-type')?.includes('application/json')) {
    throw new Error(res.ok ? 'Server tidak merespons dengan benar. Coba lagi beberapa saat lagi.' : (STATUS_MESSAGE[res.status] ?? `Server bermasalah (${res.status}). Coba lagi beberapa saat lagi.`));
  }

  const data = await res.json();
  if (!res.ok) {
    throw Object.assign(new Error(data.error || STATUS_MESSAGE[res.status] || 'Terjadi kesalahan, coba lagi.'), { status: res.status, code: data.code });
  }
  return data;
}
