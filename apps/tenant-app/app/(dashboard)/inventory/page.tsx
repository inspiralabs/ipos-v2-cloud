'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, Plus, Minus } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { PlanGate } from '@/components/PlanGate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Skeleton } from '@/components/ui/skeleton';

type StockLevel = { menu_id: string; menu_name: string; stock_qty: number; low_stock_threshold: number };

function StockGrid() {
  const [rows, setRows] = useState<StockLevel[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'low' | 'safe'>('all');
  const [restocking, setRestocking] = useState<StockLevel | null>(null);

  function reload() {
    apiFetch('/api/v1/inventory/stock-levels').then(setRows).catch(() => setFailed(true));
  }

  useEffect(() => { reload(); }, []);

  const filtered = useMemo(() => {
    if (!rows) return [];
    return rows
      .filter((r) => r.menu_name.toLowerCase().includes(search.toLowerCase()))
      .filter((r) => {
        if (filter === 'all') return true;
        const low = r.stock_qty <= r.low_stock_threshold;
        return filter === 'low' ? low : !low;
      });
  }, [rows, search, filter]);

  if (failed) return <EmptyState>Belum ada data stok. Tambahkan stok dari halaman Menu.</EmptyState>;
  if (!rows) return <Skeleton className="h-40 w-full" />;
  if (rows.length === 0) return <EmptyState>Belum ada menu dengan pelacakan stok.</EmptyState>;

  return (
    <>
      <div className="mb-3 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3">
        <Search className="h-4 w-4 text-[var(--muted)]" />
        <Input
          type="search"
          placeholder="Cari menu..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border-0 px-0 focus-visible:ring-0"
        />
      </div>
      <div className="mb-4 flex gap-2">
        {(['all', 'low', 'safe'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`h-9 rounded-full px-3 text-sm font-medium ${filter === f ? 'bg-[var(--nav-active)] text-[var(--nav-active-ink)]' : 'border border-[var(--border)] text-[var(--ink)]'}`}
          >
            {f === 'all' ? 'Semua' : f === 'low' ? 'Menipis' : 'Aman'}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {filtered.map((r) => {
          const low = r.stock_qty <= r.low_stock_threshold;
          return (
            <div key={r.menu_id} className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-2)] text-xs text-[var(--muted)]">IMG</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--ink)]">{r.menu_name}</p>
                <Badge variant={low ? 'destructive' : 'success'}>Stok {r.stock_qty} · {low ? 'Menipis' : 'Aman'}</Badge>
              </div>
              <button
                onClick={() => setRestocking(r)}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--border)] text-[var(--ink)] active:scale-95"
                aria-label={`Tambah stok ${r.menu_name}`}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="col-span-full py-8 text-center text-sm text-[var(--muted)]">Tidak ada menu yang cocok.</p>
        )}
      </div>

      {restocking && (
        <RestockModal
          item={restocking}
          onClose={() => setRestocking(null)}
          onSaved={() => { setRestocking(null); reload(); }}
        />
      )}
    </>
  );
}

function RestockModal({ item, onClose, onSaved }: { item: StockLevel; onClose: () => void; onSaved: () => void }) {
  const [qty, setQty] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/api/v1/inventory/stock-levels/${item.menu_id}/restock`, {
        method: 'POST',
        body: JSON.stringify({ qty_added: qty }),
      });
      onSaved();
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <Modal title="Tambah Stok" onClose={onClose}>
      <div className="mb-4 flex items-center gap-3 rounded-xl bg-[var(--surface-2)] p-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[var(--ink)]">{item.menu_name}</p>
          <p className="text-xs text-[var(--muted)]">Stok saat ini: {item.stock_qty}</p>
        </div>
      </div>

      <Field label="Jumlah ditambah">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--border)] active:scale-95"
          >
            <Minus className="h-4 w-4" />
          </button>
          <Input
            inputMode="numeric"
            className="h-11 text-center"
            value={qty}
            onChange={(e) => {
              const digitsOnly = e.target.value.replace(/\D/g, '');
              const parsed = parseInt(digitsOnly, 10);
              setQty((q) => (Number.isNaN(parsed) ? q : Math.max(1, parsed)));
            }}
          />
          <button
            onClick={() => setQty((q) => q + 1)}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--border)] active:scale-95"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </Field>

      <p className="mt-3 text-sm text-[var(--muted)]">
        Stok setelah ditambah: <span className="font-bold tabular-nums text-[var(--ink)]">{item.stock_qty + qty}</span>
      </p>

      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}

      <Button size="lg" className="mt-4 w-full" disabled={saving} onClick={submit}>
        {saving ? 'Menyimpan...' : 'Simpan Stok'}
      </Button>
    </Modal>
  );
}

export default function InventoryPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-xl font-bold text-[var(--ink)]">Inventory</h1>
      <PlanGate featureKey="stock_management" featureLabel="Manajemen stok">
        <StockGrid />
      </PlanGate>
    </div>
  );
}
