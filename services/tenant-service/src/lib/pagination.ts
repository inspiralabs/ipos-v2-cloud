/**
 * Klem page/limit dari query string list admin. Sebelumnya parseInt() dipakai mentah
 * di 4 endpoint tanpa batas atas/bawah — limit=999999 menarik seluruh tabel dalam satu
 * request, dan page/limit negatif/NaN menghasilkan .offset() yang tidak terdefinisi.
 */
export function parsePagination(query: Record<string, string>, defaultLimit = 20) {
  const rawPage = parseInt(query.page ?? '', 10);
  const rawLimit = parseInt(query.limit ?? '', 10);
  // Bukan angka (hilang/NaN) -> default. Angka valid tapi di luar batas -> diklem,
  // bukan jatuh ke default (limit=-1 artinya "minta minimal", bukan "tidak diminta").
  const page = Number.isFinite(rawPage) ? Math.max(1, rawPage) : 1;
  const limit = Number.isFinite(rawLimit) ? Math.min(100, Math.max(1, rawLimit)) : defaultLimit;
  return { page, limit, offset: (page - 1) * limit };
}
