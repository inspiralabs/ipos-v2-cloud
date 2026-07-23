'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { PlanGate } from '@/components/PlanGate';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { AddTableModal } from '@/components/meja/AddTableModal';
import { TableDetailModal } from '@/components/meja/TableDetailModal';
import { ZONE_LABEL, STATUS_TILE_CLASS, STATUS_DOT_CLASS, STATUS_LABEL, shapeClass, type TableRow, type TableZone, type TableStatus } from '@/components/meja/types';

const ZONES: (TableZone | 'all')[] = ['all', 'indoor', 'outdoor', 'vip'];

function FloorMap() {
  const [tables, setTables] = useState<TableRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [zone, setZone] = useState<TableZone | 'all'>('all');
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<TableRow | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragging = useRef<{ id: string; moved: boolean } | null>(null);

  function reload() {
    apiFetch('/api/v1/tables').then(setTables).catch(() => setFailed(true));
  }

  useEffect(() => { reload(); }, []);

  function updateLocal(row: TableRow) {
    setTables((prev) => (prev ? prev.map((t) => (t.id === row.id ? row : t)) : prev));
  }

  async function savePositions(rows: TableRow[]) {
    try {
      await apiFetch('/api/v1/tables/positions', {
        method: 'PUT',
        body: JSON.stringify({ positions: rows.map((t) => ({ id: t.id, position_x: t.position_x, position_y: t.position_y })) }),
      });
    } catch {
      // best-effort — posisi cuma preferensi tampilan, gagal simpan tidak menghalangi kerja kasir
    }
  }

  function onPointerDown(table: TableRow, e: React.PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = { id: table.id, moved: false };
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging.current || !canvasRef.current || !tables) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.min(96, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.min(96, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
    dragging.current.moved = true;
    setTables((prev) => prev!.map((t) => (t.id === dragging.current!.id ? { ...t, position_x: Math.round(x), position_y: Math.round(y) } : t)));
  }

  function onPointerUp(table: TableRow) {
    if (!dragging.current) return;
    const moved = dragging.current.moved;
    dragging.current = null;
    if (moved && tables) {
      savePositions(tables);
    } else {
      setSelected(table);
    }
  }

  if (failed) return <EmptyState>Gagal memuat meja. Coba muat ulang halaman.</EmptyState>;
  if (!tables) return <Skeleton className="h-96 w-full" />;

  const visible = zone === 'all' ? tables : tables.filter((t) => t.zone === zone);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2 overflow-x-auto">
          {ZONES.map((z) => (
            <button
              key={z}
              onClick={() => setZone(z)}
              className={cn(
                'h-9 shrink-0 rounded-full px-4 text-sm font-medium transition-colors',
                zone === z ? 'bg-[var(--nav-active)] text-[var(--nav-active-ink)]' : 'border border-[var(--border)] text-[var(--ink)] hover:bg-[var(--surface-2)]'
              )}
            >
              {z === 'all' ? 'Semua' : ZONE_LABEL[z]}
            </button>
          ))}
        </div>
        <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Tambah Meja</Button>
      </div>

      {visible.length === 0 ? (
        <EmptyState>Belum ada meja{zone !== 'all' ? ` di zona ${ZONE_LABEL[zone]}` : ''}. Tambahkan meja pertama.</EmptyState>
      ) : (
        <>
          {/* Canvas drag-drop — tablet/desktop */}
          <div
            ref={canvasRef}
            onPointerMove={onPointerMove}
            className="relative hidden h-[420px] w-full touch-none rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] md:block"
          >
            {visible.map((t) => (
              <button
                key={t.id}
                onPointerDown={(e) => onPointerDown(t, e)}
                onPointerUp={() => onPointerUp(t)}
                style={{ left: `${t.position_x}%`, top: `${t.position_y}%` }}
                className={cn('absolute flex cursor-grab flex-col items-center justify-center border-2 text-xs font-semibold active:cursor-grabbing', STATUS_TILE_CLASS[t.status], shapeClass(t.shape))}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Grid status sederhana — mobile */}
          <div className="grid grid-cols-2 gap-3 md:hidden">
            {visible.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelected(t)}
                className={cn('flex flex-col items-start gap-1 rounded-2xl border p-3 text-left', STATUS_TILE_CLASS[t.status])}
              >
                <span className="text-sm font-bold">{t.label}</span>
                <span className="flex items-center gap-1.5 text-xs">
                  <span className={cn('h-2 w-2 rounded-full', STATUS_DOT_CLASS[t.status])} />
                  {STATUS_LABEL[t.status]}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-4 text-xs text-[var(--muted)]">
            {(['available', 'occupied', 'reserved', 'cleaning'] as TableStatus[]).map((s) => (
              <span key={s} className="flex items-center gap-1.5">
                <span className={cn('h-2.5 w-2.5 rounded-full', STATUS_DOT_CLASS[s])} />
                {STATUS_LABEL[s]}
              </span>
            ))}
          </div>
        </>
      )}

      {adding && (
        <AddTableModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />
      )}
      {selected && (
        <TableDetailModal
          table={selected}
          onClose={() => setSelected(null)}
          onChanged={(row) => { updateLocal(row); setSelected(null); }}
          onDeleted={() => { setSelected(null); reload(); }}
        />
      )}
    </div>
  );
}

export default function MejaPage() {
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-4 text-xl font-bold text-[var(--ink)]">Meja</h1>
      <PlanGate featureKey="table_management" featureLabel="Manajemen Meja">
        <FloorMap />
      </PlanGate>
    </div>
  );
}
