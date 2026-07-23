'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Search, Trash2 } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { formatRupiah } from '@/lib/format';
import type { Menu } from '@/lib/types';
import { PlanGate } from '@/components/PlanGate';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';

type Ingredient = {
  id: string;
  name: string;
  unit: string;
  cost_per_unit: number;
};

type RecipeItem = {
  id?: string;
  ingredient_id: string;
  qty_used: number;
};

function RecipeManager() {
  const [menus, setMenus] = useState<Menu[] | null>(null);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [search, setSearch] = useState('');
  const [selectedMenu, setSelectedMenu] = useState<Menu | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    Promise.all([apiFetch('/api/v1/catalog/menus'), apiFetch('/api/v1/inventory/ingredients')])
      .then(([ms, ings]) => {
        setMenus(ms);
        setIngredients(ings);
      })
      .catch(() => setFailed(true));
  }, []);

  const filteredMenus = useMemo(() => {
    if (!menus) return [];
    return menus.filter((m) => m.name.toLowerCase().includes(search.toLowerCase()));
  }, [menus, search]);

  if (failed) return <EmptyState>Gagal memuat data. Coba muat ulang halaman.</EmptyState>;
  if (!menus) return <Skeleton className="h-40 w-full" />;

  if (selectedMenu) {
    return (
      <RecipeEditor
        menu={selectedMenu}
        ingredients={ingredients}
        onBack={() => setSelectedMenu(null)}
      />
    );
  }

  return (
    <>
      <div className="mb-4 flex h-11 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 sm:max-w-xs">
        <Search className="h-4 w-4 shrink-0 text-[var(--muted)]" />
        <Input
          type="search"
          placeholder="Cari menu..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-auto border-0 px-0 focus-visible:ring-0"
        />
      </div>

      {menus.length === 0 ? (
        <EmptyState>Belum ada menu. Tambahkan menu dulu di halaman Menu.</EmptyState>
      ) : filteredMenus.length === 0 ? (
        <EmptyState>Tidak ada menu yang cocok.</EmptyState>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filteredMenus.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelectedMenu(m)}
              className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left active:scale-[0.99]"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-2)] text-xs text-[var(--muted)]">IMG</div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-[var(--ink)]">{m.name}</p>
                <p className="text-xs text-[var(--muted)]">{formatRupiah(m.price)}</p>
              </div>
              <span className="shrink-0 text-xs font-medium text-[var(--primary)]">Kelola Resep →</span>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function RecipeEditor({
  menu,
  ingredients,
  onBack,
}: {
  menu: Menu;
  ingredients: Ingredient[];
  onBack: () => void;
}) {
  const [items, setItems] = useState<RecipeItem[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch(`/api/v1/inventory/menus/${menu.id}/recipe`)
      .then((rows: RecipeItem[]) => setItems(rows.map((r) => ({ id: r.id, ingredient_id: r.ingredient_id, qty_used: r.qty_used }))))
      .catch(() => setItems([]));
  }, [menu.id]);

  function ingredientName(id: string) {
    return ingredients.find((i) => i.id === id)?.name ?? '(bahan tidak ditemukan)';
  }
  function ingredientUnit(id: string) {
    return ingredients.find((i) => i.id === id)?.unit ?? '';
  }

  function addRow() {
    const used = new Set(items?.map((i) => i.ingredient_id));
    const next = ingredients.find((i) => !used.has(i.id)) ?? ingredients[0];
    if (!next) return;
    setItems((prev) => [...(prev ?? []), { ingredient_id: next.id, qty_used: 1 }]);
  }

  function updateRow(index: number, patch: Partial<RecipeItem>) {
    setItems((prev) => (prev ?? []).map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  function removeRow(index: number) {
    setItems((prev) => (prev ?? []).filter((_, i) => i !== index));
  }

  async function save() {
    if (!items) return;
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/api/v1/inventory/menus/${menu.id}/recipe`, {
        method: 'PUT',
        body: JSON.stringify({ items: items.map((i) => ({ ingredient_id: i.ingredient_id, qty_used: i.qty_used })) }),
      });
      toast.success('Resep tersimpan');
    } catch (e: any) {
      setError(e.message);
      toast.error(e.message || 'Gagal menyimpan resep');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <button onClick={onBack} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--muted)]">
        <ArrowLeft className="h-4 w-4" /> Kembali ke daftar menu
      </button>

      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-2)] text-xs text-[var(--muted)]">IMG</div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-[var(--ink)]">{menu.name}</p>
          <p className="text-xs text-[var(--muted)]">{formatRupiah(menu.price)}</p>
        </div>
      </div>

      {items === null ? (
        <Skeleton className="h-32 w-full" />
      ) : ingredients.length === 0 ? (
        <EmptyState>Belum ada bahan baku terdaftar. Tambahkan dulu di halaman Bahan Baku.</EmptyState>
      ) : (
        <div className="space-y-3">
          {items.length === 0 ? (
            <EmptyState>Resep belum diatur. Klik &ldquo;+ Tambah Bahan&rdquo; untuk mulai.</EmptyState>
          ) : (
            <ul className="space-y-2">
              {items.map((row, i) => (
                <li key={i} className="flex items-center gap-2 rounded-xl border border-[var(--border)] p-2.5">
                  <div className="min-w-0 flex-1">
                    <Select value={row.ingredient_id} onValueChange={(v) => updateRow(i, { ingredient_id: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ingredients.map((ing) => (
                          <SelectItem key={ing.id} value={ing.id}>{ing.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Input
                    inputMode="decimal"
                    className="w-24 shrink-0 text-center"
                    value={String(row.qty_used)}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^\d.]/g, '');
                      updateRow(i, { qty_used: v === '' ? 0 : parseFloat(v) });
                    }}
                  />
                  <span className="w-14 shrink-0 text-xs text-[var(--muted)]">{ingredientUnit(row.ingredient_id) || 'satuan'}</span>
                  <button
                    onClick={() => removeRow(i)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-red-500 active:scale-95"
                    aria-label={`Hapus ${ingredientName(row.ingredient_id)}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <Button type="button" variant="outline" onClick={addRow} className="w-full">
            <Plus className="h-4 w-4" /> Tambah Bahan
          </Button>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <Button onClick={save} disabled={saving} className="w-full" size="lg">
            {saving ? 'Menyimpan...' : 'Simpan Resep'}
          </Button>
        </div>
      )}
    </>
  );
}

export default function ResepPage() {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push('/bahan-baku')} aria-label="Kembali">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-xl font-bold text-[var(--ink)]">Kelola Resep (BOM)</h1>
      </div>
      <PlanGate featureKey="bom_recipe" featureLabel="Bahan Baku & BOM">
        <RecipeManager />
      </PlanGate>
    </div>
  );
}
