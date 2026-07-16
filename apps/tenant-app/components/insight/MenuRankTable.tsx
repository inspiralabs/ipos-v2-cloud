import type { MenuRank } from '@/lib/insights';
import { formatRupiah } from '@/lib/format';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';

export function MenuRankTable({ title, rows, emptyMessage }: { title: string; rows: MenuRank[]; emptyMessage: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState>{emptyMessage}</EmptyState>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Menu</TableHead>
                <TableHead>Qty</TableHead>
                <TableHead>Omzet</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.menu_id ?? r.product_name}>
                  <TableCell>{r.product_name}</TableCell>
                  <TableCell>{r.total_qty}</TableCell>
                  <TableCell className="font-semibold">{formatRupiah(r.total_revenue)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
