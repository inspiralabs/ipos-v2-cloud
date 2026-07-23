export function formatRupiah(value: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
}

/** Format angka ketikan jadi "20.000" — dipakai di input harga (bukan formatRupiah, tanpa "Rp"). */
export function formatThousands(digitsOnly: string) {
  if (!digitsOnly) return '';
  return new Intl.NumberFormat('id-ID').format(parseInt(digitsOnly, 10));
}

/** Kebalikan formatThousands — ambil digit murni dari input yang sudah berformat titik. */
export function parseThousands(formatted: string) {
  return formatted.replace(/\D/g, '');
}
