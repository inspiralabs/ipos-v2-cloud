/**
 * Gagal saat boot dengan pesan yang bisa ditindaklanjuti, bukan
 * "TypeError: Cannot read properties of undefined (reading 'replace')"
 * yang sudah didokumentasikan di README sebagai jebakan yang diketahui.
 */
export function requireEnv(keys: string[], env: NodeJS.ProcessEnv = process.env): void {
  const missing = keys.filter((k) => !env[k]);
  if (missing.length) {
    throw new Error(
      `Env wajib belum diisi: ${missing.join(', ')}. ` +
        `Copy .env.example ke .env di folder service ini (lihat README bagian "Isi .env per service").`
    );
  }
}

/**
 * Gagal-tertutup. Versi lama memakai `CORS_ORIGIN?.split(',') || true`, jadi env
 * yang kosong/salah nama menghasilkan origin: true — refleksikan origin apa pun —
 * digabung credentials: true. Di dev itu memang yang kita mau; di produksi itu lubang.
 */
export function resolveCorsOrigin(raw: string | undefined, nodeEnv: string | undefined): string[] | boolean {
  const list = (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (list.length) return list;
  if (nodeEnv === 'production') {
    throw new Error(
      'CORS_ORIGIN wajib diisi saat NODE_ENV=production. ' +
        'Isi daftar origin yang boleh akses API ini, pisah pakai koma (lihat .env.example).'
    );
  }
  return true;
}

/** Dipakai BARENG setCookie dan clearCookie — atributnya tidak boleh menyimpang. */
export const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/',
} as const;
