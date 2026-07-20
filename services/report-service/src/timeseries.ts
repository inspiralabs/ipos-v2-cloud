// ponytail: satu helper murni supaya granularity->SQL truncation testable tanpa boot Fastify.
export type Granularity = 'hour' | 'day' | 'week' | 'month';

export function bucketLabel(date: Date, granularity: Granularity): string {
  const iso = date.toISOString();
  if (granularity === 'hour') return iso.slice(0, 13) + ':00'; // 2026-07-16T14:00
  if (granularity === 'day') return iso.slice(0, 10); // 2026-07-16
  if (granularity === 'month') return iso.slice(0, 7); // 2026-07
  // week: ISO week number
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}
