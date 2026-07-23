import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './button';

export function Pagination({ page, limit, total, onPageChange }: {
  page: number; limit: number; total: number; onPageChange: (page: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / limit));
  if (pageCount <= 1) return null;

  return (
    <div className="mt-4 flex items-center justify-between text-sm text-[var(--muted)]">
      <p>Halaman {page} dari {pageCount} · {total} data</p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft className="h-4 w-4" /> Sebelumnya
        </Button>
        <Button size="sm" variant="outline" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
          Berikutnya <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
