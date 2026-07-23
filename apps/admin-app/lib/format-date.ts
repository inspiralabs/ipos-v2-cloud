export function relativeDate(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'Hari ini';
  if (days === 1) return 'Kemarin';
  if (days < 30) return `${days} hari lalu`;
  return new Date(iso).toLocaleDateString('id-ID', { dateStyle: 'medium' });
}
