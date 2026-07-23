'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Info, Pencil, Search } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { formatRupiah, formatThousands, parseThousands } from '@/lib/format';
import { PlanGate } from '@/components/PlanGate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Ingredient = {
  id: string;
  tenant_id: string;
  name: string;
  unit: string;
  stock_qty: number;
  low_stock_threshold: number;
  cost_per_unit: number;
  created_at: string;
  updated_at: string;
};

function IngredientList() {
  const [rows, setRows] = useState<Ingredient[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Ingredient | 'new' | null>(null);

  function reload() {
    apiFetch('/api/v1/inventory/ingredients')
      .then(setRows)
      .catch(() => setFailed(true));
  }

  useEffect(() => { reload(); }, []);

  if (failed) return <EmptyState>Gagal memuat bahan baku. Coba muat ulang halaman.</EmptyState>;
  if (!rows) return <Skeleton className="h-40 w-full" />;

  const filtered = rows.filter((r) => r.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex h-11 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 sm:max-w-xs">
          <Search className="h-4 w-4 shrink-0 text-[var(--muted)]" />
          <Input
            type="search"
            placeholder="Cari bahan baku..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-auto border-0 px-0 focus-visible:ring-0"
          />
        </div>
        <Button onClick={() => setEditing('new')}>+ Tambah Bahan Baku</Button>
      </div>

      <div className="mb-4 flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm text-[var(--muted)]">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>Menu otomatis ditandai <span className="font-semibold text-[var(--ink)]">Habis</span> kalau bahan baku terkait menipis ke nol — ini berjalan otomatis di sistem, tidak perlu diatur manual di sini.</p>
      </div>

      {rows.length === 0 ? (
        <EmptyState>
          Belum ada bahan baku. Klik <span className="font-semibold text-[var(--ink)]">+ Tambah Bahan Baku</span> untuk menambah.
        </EmptyState>
      ) : filtered.length === 0 ? (
        <EmptyState>Tidak ada bahan baku yang cocok.</EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nama</TableHead>
              <TableHead>Satuan</TableHead>
              <TableHead>Stok</TableHead>
              <TableHead>Harga/Satuan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => {
              const low = r.stock_qty <= r.low_stock_threshold;
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.unit}</TableCell>
                  <TableCell className="tabular-nums">{r.stock_qty}</TableCell>
                  <TableCell className="tabular-nums">{formatRupiah(r.cost_per_unit)}</TableCell>
                  <TableCell>
                    <Badge variant={low ? 'destructive' : 'success'}>{low ? 'Menipis' : 'Aman'}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      onClick={() => setEditing(r)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--ink)] active:scale-95"
                      aria-label={`Ubah ${r.name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {editing && (
        <IngredientForm
          ingredient={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); reload(); }}
        />
      )}
    </>
  );
}

function IngredientForm({
  ingredient,
  onClose,
  onSaved,
}: {
  ingredient: Ingredient | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(ingredient?.name ?? '');
  const [unit, setUnit] = useState(ingredient?.unit ?? '');
  const [stockQty, setStockQty] = useState(String(ingredient?.stock_qty ?? '0'));
  const [threshold, setThreshold] = useState(String(ingredient?.low_stock_threshold ?? '0'));
  const [costPerUnit, setCostPerUnit] = useState(String(ingredient?.cost_per_unit ?? '0'));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = {
        name,
        unit,
        stock_qty: parseFloat(stockQty || '0'),
        low_stock_threshold: parseFloat(threshold || '0'),
        cost_per_unit: parseInt(costPerUnit || '0', 10),
      };
      if (ingredient) {
        await apiFetch(`/api/v1/inventory/ingredients/${ingredient.id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await apiFetch('/api/v1/inventory/ingredients', { method: 'POST', body: JSON.stringify(body) });
      }
      onSaved();
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <Modal title={ingredient ? 'Ubah Bahan Baku' : 'Tambah Bahan Baku'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nama Bahan">
          <Input required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Satuan" hint="Contoh: kg, gram, liter, pcs">
          <Input required value={unit} onChange={(e) => setUnit(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={ingredient ? 'Stok Saat Ini' : 'Stok Awal'}>
            <Input
              required
              inputMode="decimal"
              value={stockQty}
              onChange={(e) => setStockQty(e.target.value.replace(/[^\d.]/g, ''))}
            />
          </Field>
          <Field label="Batas Stok Menipis">
            <Input
              required
              inputMode="decimal"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value.replace(/[^\d.]/g, ''))}
            />
          </Field>
        </div>
        <Field label="Harga Beli / Satuan" hint="Dipakai untuk hitung food cost resep">
          <Input
            required
            inputMode="numeric"
            value={formatThousands(costPerUnit)}
            onChange={(e) => setCostPerUnit(parseThousands(e.target.value))}
          />
        </Field>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">Batal</Button>
          <Button type="submit" disabled={saving} className="flex-1">{saving ? 'Menyimpan...' : 'Simpan'}</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function BahanBakuPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--ink)]">Bahan Baku</h1>
        <Link href="/bahan-baku/resep">
          <Button variant="outline">Kelola Resep</Button>
        </Link>
      </div>
      <PlanGate featureKey="bom_recipe" featureLabel="Bahan Baku & BOM">
        <IngredientList />
      </PlanGate>
    </div>
  );
}
