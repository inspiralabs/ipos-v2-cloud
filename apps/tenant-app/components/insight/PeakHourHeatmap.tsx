import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer } from 'recharts';
import type { PeakHours } from '@/lib/insights';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export function PeakHourHeatmap({ data }: { data: PeakHours }) {
  const countByHour = new Map(data.by_hour.map((h) => [h.hour, h.transaction_count]));
  const chartData = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: String(hour).padStart(2, '0'),
    transaction_count: countByHour.get(hour) ?? 0,
  }));
  const maxCount = Math.max(1, ...chartData.map((d) => d.transaction_count));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Jam Tersibuk</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={chartData}>
            <XAxis dataKey="label" stroke="var(--muted)" fontSize={10} interval={1} />
            <YAxis hide />
            <Tooltip formatter={(value: number) => [`${value} transaksi`, '']} labelFormatter={(l) => `Jam ${l}:00`} />
            <Bar dataKey="transaction_count" radius={[3, 3, 0, 0]}>
              {chartData.map((d) => (
                <Cell key={d.hour} fill="var(--primary)" fillOpacity={d.transaction_count === 0 ? 0.15 : 0.4 + (d.transaction_count / maxCount) * 0.6} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <p className="mt-2 text-xs text-[var(--muted)]">Batang lebih pekat = lebih banyak transaksi.</p>
      </CardContent>
    </Card>
  );
}
