'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { apiFetch, clearToken, getToken } from '@/lib/auth';
import { formatRupiah, formatThousands, parseThousands } from '@/lib/format';
import type { Category, Menu, MenuVariantGroup, VariantGroup } from '@/lib/types';
import { useTenant } from '@/components/layout/TenantContext';
import { SandboxLimitBanner } from '@/components/SandboxLimitBanner';
import { MenuCard } from '@/components/menu/MenuCard';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const TRIAL_MENU_LIMIT = 20; // PRD §3.1/§4: sandbox trial dibatasi 20 menu

export default function MenuPage() {
  const router = useRouter();
  const { tenant } = useTenant();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [groups, setGroups] = useState<VariantGroup[]>([]);
  const [links, setLinks] = useState<MenuVariantGroup[]>([]);
  const [editing, setEditing] = useState<Menu | 'new' | null>(null);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [removing, setRemoving] = useState<Menu | null>(null);

  async function reload() {
    const [cats, ms, gs, ls] = await Promise.all([
      apiFetch('/api/v1/catalog/categories'),
      apiFetch('/api/v1/catalog/menus'),
      apiFetch('/api/v1/catalog/variant-groups'),
      apiFetch('/api/v1/catalog/menu-variant-groups'),
    ]);
    setCategories(cats);
    setMenus(ms);
    setGroups(gs);
    setLinks(ls);
  }

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    reload()
      .catch((e) => {
        if (e.status === 401) {
          clearToken();
          router.replace('/login');
        } else setError(e.message);
      })
      .finally(() => setLoading(false));
  }, [router]);

  async function removeMenu(menu: Menu) {
    await apiFetch(`/api/v1/catalog/menus/${menu.id}`, { method: 'DELETE' });
    setRemoving(null);
    await reload();
  }

  async function toggleSoldOut(menu: Menu) {
    await apiFetch(`/api/v1/catalog/menus/${menu.id}/sold-out`, {
      method: 'POST',
      body: JSON.stringify({ is_sold_out: !menu.is_sold_out }),
    });
    await reload();
  }

  if (loading) {
    return <main className="flex min-h-dvh items-center justify-center text-[var(--muted)]">Memuat...</main>;
  }

  const byCategory = [
    ...categories.map((c) => ({ category: c, items: menus.filter((m) => m.category_id === c.id) })),
    { category: null, items: menus.filter((m) => !m.category_id) },
  ].filter((g) => g.items.length > 0);

  const sandboxLimitReached = tenant.status === 'trial' && menus.length >= TRIAL_MENU_LIMIT;

  return (
    <main className="min-h-dvh bg-[var(--bg)]">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/')} aria-label="Kembali ke dashboard">
            ←
          </Button>
          <h1 className="text-lg font-bold text-[var(--ink)]">Menu</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setGroupsOpen(true)}>
            Grup Variasi
          </Button>
          <Button size="sm" onClick={() => setEditing('new')} disabled={sandboxLimitReached}>
            + Menu
          </Button>
        </div>
      </header>

      {error && (
        <div className="border-b border-[var(--border)] bg-red-500/10 px-4 py-2 text-sm text-red-500 sm:px-6">{error}</div>
      )}

      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {sandboxLimitReached && (
          <div className="mb-4">
            <SandboxLimitBanner message={`Batas menu trial (${TRIAL_MENU_LIMIT}) tercapai. Upgrade untuk tambah menu lagi.`} />
          </div>
        )}
        {menus.length === 0 ? (
          <EmptyState>
            Belum ada menu. Klik <span className="font-semibold text-[var(--ink)]">+ Menu</span> untuk menambah.
          </EmptyState>
        ) : (
          byCategory.map(({ category, items }) => (
            <section key={category?.id ?? 'uncat'} className="mb-8">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
                {category?.name ?? 'Tanpa Kategori'}
              </h2>
              <motion.div
                className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
                initial="hidden"
                animate="visible"
                variants={{ visible: { transition: { staggerChildren: 0.03 } } }}
              >
                {items.map((menu) => {
                  const groupCount = links.filter((l) => l.menu_id === menu.id).length;
                  return (
                    <motion.div
                      key={menu.id}
                      variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}
                    >
                      <MenuCard
                        menu={menu}
                        groupCount={groupCount}
                        categoryName={category?.name}
                        onToggleSoldOut={() => toggleSoldOut(menu)}
                        onEdit={() => setEditing(menu)}
                        onDelete={() => setRemoving(menu)}
                      />
                    </motion.div>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setEditing('new')}
                  disabled={sandboxLimitReached}
                  className="flex h-full min-h-[140px] flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-[var(--border)] text-sm font-medium text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="text-xl">+</span>
                  <span>Tambah</span>
                </button>
              </motion.div>
            </section>
          ))
        )}
      </div>

      {editing && (
        <MenuForm
          menu={editing === 'new' ? null : editing}
          categories={categories}
          groups={groups}
          linkedGroupIds={editing === 'new' ? [] : links.filter((l) => l.menu_id === editing.id).map((l) => l.variant_group_id)}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await reload();
          }}
        />
      )}

      {groupsOpen && (
        <VariantGroupsModal
          groups={groups}
          onClose={() => setGroupsOpen(false)}
          onChanged={reload}
        />
      )}

      <AlertDialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus menu?</AlertDialogTitle>
            <AlertDialogDescription>
              Menu &ldquo;{removing?.name}&rdquo; akan dihapus permanen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => removing && removeMenu(removing)}>Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

// ── Form tambah/ubah menu ─────────────────────────────────────────────────────

function MenuForm({
  menu,
  categories,
  groups,
  linkedGroupIds,
  onClose,
  onSaved,
}: {
  menu: Menu | null;
  categories: Category[];
  groups: VariantGroup[];
  linkedGroupIds: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(menu?.name ?? '');
  const [price, setPrice] = useState(String(menu?.price ?? ''));
  const [hasDiscount, setHasDiscount] = useState(menu?.discount_price != null);
  const [discountType, setDiscountType] = useState<'nominal' | 'percent'>(menu?.discount_type ?? 'nominal');
  const [discountValue, setDiscountValue] = useState(String(menu?.discount_value ?? ''));
  const [categoryId, setCategoryId] = useState(menu?.category_id ?? '');
  const [selectedGroups, setSelectedGroups] = useState<string[]>(linkedGroupIds);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const priceNum = parseInt(price || '0', 10);
  const discountValueNum = parseInt(discountValue || '0', 10);
  const discountNum =
    discountType === 'percent' ? Math.round((priceNum * Math.min(100, discountValueNum)) / 100) : discountValueNum;
  const discountInvalid = hasDiscount && (discountValueNum <= 0 || discountNum >= priceNum);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (discountInvalid) return;
    setSaving(true);
    setError('');
    try {
      const body = {
        name,
        price: priceNum,
        discount_price: hasDiscount ? priceNum - discountNum : null,
        discount_type: hasDiscount ? discountType : null,
        discount_value: hasDiscount ? discountValueNum : null,
        category_id: categoryId || null,
      };
      const saved = menu
        ? await apiFetch(`/api/v1/catalog/menus/${menu.id}`, { method: 'PUT', body: JSON.stringify(body) })
        : await apiFetch('/api/v1/catalog/menus', { method: 'POST', body: JSON.stringify(body) });

      await apiFetch(`/api/v1/catalog/menus/${saved.id}/variant-groups`, {
        method: 'PUT',
        body: JSON.stringify({ group_ids: selectedGroups }),
      });
      onSaved();
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <Modal title={menu ? 'Ubah Menu' : 'Tambah Menu'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nama Menu">
          <Input required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <Field label="Harga">
          <Input
            required inputMode="numeric"
            value={formatThousands(price)} onChange={(e) => setPrice(parseThousands(e.target.value))}
          />
        </Field>

        <div className="rounded-xl border border-[var(--border)] p-3">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={hasDiscount}
              onChange={(e) => setHasDiscount(e.target.checked)}
              className="h-4 w-4 accent-[var(--primary)]"
            />
            <span className="text-sm font-medium text-[var(--ink)]">Pasang harga diskon</span>
          </label>

          {hasDiscount && (
            <div className="mt-3 space-y-2">
              <div className="flex gap-2">
                {(['nominal', 'percent'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setDiscountType(t)}
                    className={`h-9 flex-1 rounded-lg text-sm font-semibold transition-colors ${
                      discountType === t
                        ? 'bg-[var(--nav-active)] text-[var(--nav-active-ink)]'
                        : 'border border-[var(--border)] text-[var(--ink)] hover:bg-[var(--surface-2)]'
                    }`}
                  >
                    {t === 'nominal' ? 'Rp' : '%'}
                  </button>
                ))}
              </div>
              <Input
                inputMode="numeric"
                placeholder={discountType === 'percent' ? 'Persen diskon (mis. 10)' : 'Potongan harga (Rp)'}
                value={discountType === 'percent' ? discountValue : formatThousands(discountValue)}
                onChange={(e) =>
                  setDiscountValue(discountType === 'percent' ? e.target.value.replace(/\D/g, '') : parseThousands(e.target.value))
                }
              />
              {discountInvalid ? (
                <p className="text-xs text-red-500">Diskon harus membuat harga akhir lebih kecil dari harga normal.</p>
              ) : (
                discountNum > 0 && (
                  <p className="text-xs text-[var(--muted)]">
                    Tampil di kasir:{' '}
                    <span className="line-through">{formatRupiah(priceNum)}</span>{' '}
                    <span className="font-semibold text-[var(--primary)]">{formatRupiah(priceNum - discountNum)}</span>
                  </p>
                )
              )}
            </div>
          )}
        </div>

        <Field label="Kategori">
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger>
              <SelectValue placeholder="Tanpa kategori" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Variasi" hint={groups.length === 0 ? 'Belum ada grup variasi — buat dulu lewat tombol "Grup Variasi".' : 'Centang grup yang berlaku untuk menu ini.'}>
          <div className="space-y-1.5">
            {groups.map((g) => (
              <label key={g.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-[var(--surface-2)]">
                <input
                  type="checkbox"
                  checked={selectedGroups.includes(g.id)}
                  onChange={(e) =>
                    setSelectedGroups((prev) => (e.target.checked ? [...prev, g.id] : prev.filter((id) => id !== g.id)))
                  }
                  className="h-4 w-4 accent-[var(--primary)]"
                />
                <span className="text-sm text-[var(--ink)]">{g.name}</span>
                <span className="text-xs text-[var(--muted)]">
                  ({g.options.length} opsi{g.required ? ', wajib' : ''})
                </span>
              </label>
            ))}
          </div>
        </Field>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">
            Batal
          </Button>
          <Button type="submit" disabled={saving || discountInvalid} className="flex-1">
            {saving ? 'Menyimpan...' : 'Simpan'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ── Kelola grup variasi ───────────────────────────────────────────────────────

function VariantGroupsModal({
  groups,
  onClose,
  onChanged,
}: {
  groups: VariantGroup[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<VariantGroup | 'new' | null>(null);
  const [removing, setRemoving] = useState<VariantGroup | null>(null);

  async function remove(g: VariantGroup) {
    await apiFetch(`/api/v1/catalog/variant-groups/${g.id}`, { method: 'DELETE' });
    setRemoving(null);
    await onChanged();
  }

  if (editing) {
    return (
      <VariantGroupForm
        group={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await onChanged();
        }}
      />
    );
  }

  return (
    <Modal title="Grup Variasi" onClose={onClose} wide>
      <p className="mb-4 text-sm text-[var(--muted)]">
        Buat sekali, pasang ke banyak menu. Contoh: &ldquo;Level Pedas&rdquo; atau &ldquo;Topping&rdquo;.
      </p>

      {groups.length === 0 ? (
        <EmptyState>Belum ada grup variasi.</EmptyState>
      ) : (
        <ul className="space-y-2">
          {groups.map((g) => (
            <li key={g.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] p-3">
              <div className="min-w-0">
                <p className="font-semibold text-[var(--ink)]">{g.name}</p>
                <p className="truncate text-xs text-[var(--muted)]">
                  {g.selection === 'single' ? 'Pilih satu' : 'Pilih banyak'}
                  {g.required ? ' · wajib' : ' · opsional'} ·{' '}
                  {g.options.map((o) => o.name).join(', ')}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="outline" size="sm" onClick={() => setEditing(g)}>Ubah</Button>
                <Button variant="destructive" size="sm" onClick={() => setRemoving(g)}>Hapus</Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Button onClick={() => setEditing('new')} className="mt-4 w-full">
        + Grup Variasi
      </Button>

      <AlertDialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus grup variasi?</AlertDialogTitle>
            <AlertDialogDescription>
              Grup &ldquo;{removing?.name}&rdquo; akan dihapus. Menu yang memakainya akan kehilangan variasi ini.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => removing && remove(removing)}>Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Modal>
  );
}

function VariantGroupForm({
  group,
  onClose,
  onSaved,
}: {
  group: VariantGroup | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(group?.name ?? '');
  const [selection, setSelection] = useState<'single' | 'multi'>(group?.selection ?? 'single');
  const [required, setRequired] = useState(group?.required ?? false);
  const [options, setOptions] = useState<{ name: string; price_delta: string }[]>(
    group?.options.map((o) => ({ name: o.name, price_delta: String(o.price_delta) })) ?? [{ name: '', price_delta: '0' }]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const validOptions = options.filter((o) => o.name.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (validOptions.length === 0) {
      setError('Minimal 1 opsi.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = {
        name,
        selection,
        required,
        options: validOptions.map((o) => ({ name: o.name.trim(), price_delta: parseInt(o.price_delta || '0', 10) })),
      };
      if (group) {
        await apiFetch(`/api/v1/catalog/variant-groups/${group.id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await apiFetch('/api/v1/catalog/variant-groups', { method: 'POST', body: JSON.stringify(body) });
      }
      onSaved();
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <Modal title={group ? 'Ubah Grup Variasi' : 'Grup Variasi Baru'} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nama Grup" hint="Contoh: Level Pedas, Ukuran, Topping">
          <Input required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Cara Pilih">
            <Select value={selection} onValueChange={(v) => setSelection(v as 'single' | 'multi')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single">Pilih satu</SelectItem>
                <SelectItem value="multi">Pilih banyak</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Wajib diisi?">
            <label className="flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-[var(--border)] px-3">
              <input
                type="checkbox"
                checked={required}
                onChange={(e) => setRequired(e.target.checked)}
                className="h-4 w-4 accent-[var(--primary)]"
              />
              <span className="text-sm text-[var(--ink)]">Wajib</span>
            </label>
          </Field>
        </div>

        <div>
          <span className="mb-2 block text-sm font-medium text-[var(--ink)]">Opsi & Selisih Harga</span>
          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {options.map((opt, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  placeholder="Nama opsi (mis. Level 3)"
                  value={opt.name}
                  onChange={(e) =>
                    setOptions((prev) => prev.map((o, j) => (j === i ? { ...o, name: e.target.value } : o)))
                  }
                />
                <Input
                  type="number" inputMode="numeric" placeholder="+Rp"
                  className="w-28 shrink-0"
                  value={opt.price_delta}
                  onChange={(e) =>
                    setOptions((prev) => prev.map((o, j) => (j === i ? { ...o, price_delta: e.target.value } : o)))
                  }
                />
                <Button
                  type="button" variant="ghost" size="md"
                  aria-label="Hapus opsi"
                  className="w-11 shrink-0"
                  onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
                  disabled={options.length === 1}
                >
                  ×
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button" variant="outline" size="sm"
            className="mt-2"
            onClick={() => setOptions((prev) => [...prev, { name: '', price_delta: '0' }])}
          >
            + Opsi
          </Button>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Selisih harga boleh 0 (gratis) atau minus (potongan).
          </p>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">
            Batal
          </Button>
          <Button type="submit" disabled={saving} className="flex-1">
            {saving ? 'Menyimpan...' : 'Simpan'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
