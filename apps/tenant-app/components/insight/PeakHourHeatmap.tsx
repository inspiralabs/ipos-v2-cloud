import type { PeakHours } from '@/lib/insights';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export function PeakHourHeatmap({ data }: { data: PeakHours }) {
  const maxCount = Math.max(1, ...data.by_hour.map((h) => h.transaction_count));
  const countByHour = new Map(data.by_hour.map((h) => [h.hour, h.transaction_count]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Jam Tersibuk</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-12 gap-1 sm:grid-cols-24">
          {Array.from({ length: 24 }, (_, hour) => {
            const count = countByHour.get(hour) ?? 0;
            const opacity = count === 0 ? 0.08 : 0.15 + (count / maxCount) * 0.85;
            return (
              <div
                key={hour}
                title={`${hour}:00 — ${count} transaksi`}
                className="flex aspect-square items-center justify-center rounded text-[10px] font-medium text-[var(--primary-ink)]"
                style={{ backgroundColor: `var(--primary)`, opacity }}
              >
                {hour}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">Warna lebih pekat = lebih banyak transaksi.</p>
      </CardContent>
    </Card>
  );
}
