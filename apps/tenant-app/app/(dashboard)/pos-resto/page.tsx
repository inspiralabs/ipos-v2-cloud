'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Minus, Plus, UtensilsCrossed } from 'lucide-react';
import { apiFetch, getToken } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { formatRupiah, formatThousands, parseThousands } from '@/lib/format';
import { effectivePrice } from '@/lib/types';
import type { CartLine, Category, Customer, Menu, MenuVariantGroup, Shift, VariantGroup } from '@/lib/types';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { QtyStepper } from '@/components/pos/QtyStepper';
import { ItemNoteEditor } from '@/components/pos/ItemNoteEditor';
import { STATUS_LABEL, STATUS_TILE_CLASS, type TableRow } from '@/components/meja/types';

const HOLD_KEY_PREFIX = 'ipos_pos_resto_hold_';

export default function PosRestoPage() {
  const router = useRouter();
  const [table, setTable] = useState<TableRow | null>(null);

  useEffect(() => {
    if (!getToken()) router.replace('/login');
  }, [router]);

  if (!table) return <TablePicker onPick={setTable} />;
  return <OrderScreen table={table} onChangeTable={() => setTable(null)} />;
}

// ── Step 1: pilih meja ────────────────────────────────────────────────────────

function TablePicker({ onPick }: { onPick: (table: TableRow) => void }) {
  const [tables, setTables] = useState<TableRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    apiFetch('/api/v1/tables').then(setTables).catch(() => setFailed(true));
  }, []);

  if (failed) return <main className="flex min-h-dvh items-center justify-center text-[var(--muted)]">Gagal memuat meja.</main>;
  if (!tables) return <main className="p-4"><Skeleton className="h-96 w-full" /></main>;

  return (
    <main className="mx-auto max-w-3xl p-4">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--ink)]">Pilih Meja</h1>
        <ThemeToggle />
      </div>
      {tables.length === 0 ? (
        <EmptyState>Belum ada meja. Tambahkan meja dulu di halaman Meja.</EmptyState>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {tables.map((t) => (
            <button
              key={t.id}
              disabled={t.status !== 'available'}
              onClick={() => onPick(t)}
              className={cn(
                'flex flex-col items-center justify-center gap-1 rounded-2xl border-2 p-4 text-sm font-semibold transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-40',
                STATUS_TILE_CLASS[t.status]
              )}
            >
              <span>{t.label}</span>
              <span className="text-xs font-normal">{STATUS_LABEL[t.status]}</span>
            </button>
          ))}
        </div>
      )}
    </main>
  );
}

// ── Step 2: order (menu + cart) ─────────────────────────────────────────────

function OrderScreen({ table, onChangeTable }: { table: TableRow; onChangeTable: () => void }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [shift, setShift] = useState<Shift | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [groups, setGroups] = useState<VariantGroup[]>([]);
  const [links, setLinks] = useState<MenuVariantGroup[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | 'all'>('all');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [variantFor, setVariantFor] = useState<Menu | null>(null);
  const [guestCount, setGuestCount] = useState(1);
  const [payOpen, setPayOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [toast, setToast] = useState('');

  useEffect(() => {
    Promise.all([
      apiFetch('/api/v1/catalog/categories'),
      apiFetch('/api/v1/catalog/menus'),
      apiFetch('/api/v1/catalog/variant-groups'),
      apiFetch('/api/v1/catalog/menu-variant-groups'),
      apiFetch('/api/v1/pos/shifts/current').catch((e) => (e.status === 404 ? null : Promise.reject(e))),
    ])
      .then(([cats, ms, gs, ls, currentShift]) => {
        setCategories(cats); setMenus(ms); setGroups(gs); setLinks(ls); setShift(currentShift);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Hold: cart per-meja disimpan lokal, dipulihkan kalau kembali ke meja yang sama.
  useEffect(() => {
    const saved = localStorage.getItem(HOLD_KEY_PREFIX + table.id);
    if (saved) {
      try { setCart(JSON.parse(saved)); } catch { /* abaikan data korup */ }
    }
  }, [table.id]);

  const visibleMenus = useMemo(
    () => menus
      .filter((m) => m.is_active)
      .filter((m) => activeCategory === 'all' || m.category_id === activeCategory)
      .filter((m) => !search || m.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.sort_order - b.sort_order),
    [menus, activeCategory, search]
  );

  function groupsForMenu(menu: Menu) {
    const ids = links.filter((l) => l.menu_id === menu.id).map((l) => l.variant_group_id);
    return groups.filter((g) => ids.includes(g.id));
  }

  const subtotal = cart.reduce((sum, line) => sum + line.price * line.qty, 0);

  function tapMenu(menu: Menu) {
    if (menu.is_sold_out) return;
    if (groupsForMenu(menu).length > 0) { setVariantFor(menu); return; }
    addLine(menu, [], null);
  }

  function addLine(menu: Menu, deltas: number[], variantSummary: string | null) {
    const unitPrice = effectivePrice(menu) + deltas.reduce((a, b) => a + b, 0);
    setCart((prev) => {
      const existing = prev.find((l) => l.menu_id === menu.id && l.variant_summary === variantSummary);
      if (existing) return prev.map((l) => (l.line_id === existing.line_id ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { line_id: crypto.randomUUID(), menu_id: menu.id, product_name: menu.name, variant_summary: variantSummary, price: unitPrice, qty: 1, notes: null }];
    });
  }

  function changeQty(lineId: string, delta: number) {
    setCart((prev) => prev.map((l) => (l.line_id === lineId ? { ...l, qty: l.qty + delta } : l)).filter((l) => l.qty > 0));
  }

  function setLineNote(lineId: string, note: string) {
    setCart((prev) => prev.map((l) => (l.line_id === lineId ? { ...l, notes: note || null } : l)));
  }

  function holdOrder() {
    localStorage.setItem(HOLD_KEY_PREFIX + table.id, JSON.stringify(cart));
    setToast('Order ditahan untuk meja ' + table.label);
    setTimeout(() => setToast(''), 2000);
    onChangeTable();
  }

  async function submitOrder(paymentMethod: 'cash' | 'qris' | 'transfer', cashReceived: number | null, customer: Customer | null, discount: number) {
    if (!cart.length) return;
    const total = Math.max(0, subtotal - discount);
    const change = paymentMethod === 'cash' && cashReceived != null ? Math.max(0, cashReceived - total) : null;
    const orderId = crypto.randomUUID();
    const items = cart.map((l) => ({ menu_id: l.menu_id, product_name: l.product_name, variant_summary: l.variant_summary, price: l.price, qty: l.qty, notes: l.notes }));
    try {
      await apiFetch('/api/v1/pos/orders', {
        method: 'POST',
        body: JSON.stringify({
          id: orderId, shift_id: shift?.id ?? null, status: 'paid', subtotal, discount, total,
          payment_method: paymentMethod, cash_received: cashReceived, change_amount: change,
          customer_id: customer?.id ?? null, customer_name: customer?.name ?? null,
          table_number: table.label, created_at: new Date().toISOString(), items,
        }),
      });
      localStorage.removeItem(HOLD_KEY_PREFIX + table.id);
      // Meja jadi occupied setelah order pertama masuk — best-effort, tidak menghalangi alur bayar.
      apiFetch(`/api/v1/tables/${table.id}/status`, { method: 'POST', body: JSON.stringify({ status: 'occupied' }) }).catch(() => {});
      setCart([]);
      setPayOpen(false);
      onChangeTable();
    } catch (e: any) {
      setError(e.message);
    }
  }

  if (loading) return <main className="flex min-h-dvh items-center justify-center text-[var(--muted)]">Memuat...</main>;

  return (
    <main className="flex min-h-dvh flex-col bg-[var(--bg)]">
      <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/')} aria-label="Kembali ke dashboard">←</Button>
          <div>
            <p className="text-sm font-semibold text-[var(--ink)]">POS Resto</p>
            <p className="text-xs text-[var(--muted)]">Meja {table.label}</p>
          </div>
        </div>
        <ThemeToggle />
      </header>

      {error && <div className="border-b border-[var(--border)] bg-red-500/10 px-4 py-2 text-sm text-red-500">{error}</div>}
      {toast && <div className="border-b border-[var(--border)] bg-[var(--surface-2)] px-4 py-2 text-sm text-[var(--ink)]">{toast}</div>}

      <div className="flex min-h-0 flex-1 flex-col md:flex-row landscape:flex-row">
        <section className="flex min-h-0 flex-1 flex-col md:w-[60%] md:flex-none landscape:w-[60%] landscape:flex-none">
          <div className="border-b border-[var(--border)] p-3">
            <Input type="search" placeholder="Cari menu..." value={search} onChange={(e) => setSearch(e.target.value)} className="mb-2" />
            <div className="flex gap-2 overflow-x-auto">
              <CategoryChip label="Semua" active={activeCategory === 'all'} onClick={() => setActiveCategory('all')} />
              {categories.filter((c) => c.is_active).sort((a, b) => a.sort_order - b.sort_order).map((c) => (
                <CategoryChip key={c.id} label={c.name} active={activeCategory === c.id} onClick={() => setActiveCategory(c.id)} />
              ))}
            </div>
          </div>

          <div className="grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto p-3 sm:grid-cols-3 lg:grid-cols-4">
            {visibleMenus.map((menu) => (
              <MenuCard key={menu.id} menu={menu} hasVariants={groupsForMenu(menu).length > 0} onTap={() => tapMenu(menu)} />
            ))}
            {visibleMenus.length === 0 && <p className="col-span-full py-10 text-center text-sm text-[var(--muted)]">Belum ada menu di kategori ini.</p>}
          </div>
        </section>

        <aside className="flex min-h-0 flex-1 flex-col border-t border-[var(--border)] bg-[var(--surface)] md:w-[40%] md:max-w-md md:flex-none md:border-l md:border-t-0 landscape:w-[40%] landscape:max-w-md landscape:flex-none landscape:border-l landscape:border-t-0">
          <div className="space-y-2 border-b border-[var(--border)] p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[var(--ink)]">Meja {table.label}</span>
              <button onClick={onChangeTable} className="text-xs font-medium text-[var(--primary)]">Ganti meja</button>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--muted)]">Tamu</span>
              <div className="flex items-center gap-2">
                <button onClick={() => setGuestCount((n) => Math.max(1, n - 1))} className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)]"><Minus className="h-3.5 w-3.5" /></button>
                <span className="w-6 text-center text-sm font-semibold text-[var(--ink)]">{guestCount}</span>
                <button onClick={() => setGuestCount((n) => n + 1)} className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border)]"><Plus className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <h2 className="mb-3 text-sm font-semibold text-[var(--ink)]">Keranjang</h2>
            {cart.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">Belum ada item. Ketuk menu untuk menambah.</p>
            ) : (
              <ul className="space-y-3">
                {cart.map((line) => (
                  <li key={line.line_id} className="flex items-start justify-between gap-3 rounded-xl bg-[var(--surface)]">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--ink)]">{line.product_name}</p>
                      {line.variant_summary && <p className="truncate text-xs text-[var(--muted)]">{line.variant_summary}</p>}
                      <p className="text-xs text-[var(--muted)] tabular-nums">{formatRupiah(line.price)}</p>
                      {line.notes && <p className="mt-0.5 truncate text-xs italic text-[var(--muted)]">&quot;{line.notes}&quot;</p>}
                      <div className="mt-1"><ItemNoteEditor note={line.notes} onSave={(n) => setLineNote(line.line_id, n)} /></div>
                    </div>
                    <QtyStepper qty={line.qty} onIncrement={() => changeQty(line.line_id, 1)} onDecrement={() => changeQty(line.line_id, -1)} onRemove={() => setCart((prev) => prev.filter((l) => l.line_id !== line.line_id))} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-[var(--border)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-[var(--muted)]">Total</span>
              <span className="text-xl font-bold text-[var(--ink)] tabular-nums">{formatRupiah(subtotal)}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" disabled={cart.length === 0} onClick={holdOrder}>Tahan</Button>
              <Button variant="outline" disabled={cart.length === 0} onClick={() => setSplitOpen(true)}>Bagi Bill</Button>
            </div>
            <Button size="lg" disabled={cart.length === 0} onClick={() => setPayOpen(true)} className="mt-2 w-full">Bayar</Button>
          </div>
        </aside>
      </div>

      {variantFor && (
        <VariantModal menu={variantFor} groups={groupsForMenu(variantFor)} onClose={() => setVariantFor(null)}
          onConfirm={(deltas, summary) => { addLine(variantFor, deltas, summary); setVariantFor(null); }} />
      )}
      {payOpen && <PaymentModal total={subtotal} onClose={() => setPayOpen(false)} onConfirm={submitOrder} />}
      {splitOpen && <SplitBillModal cart={cart} subtotal={subtotal} guestCount={guestCount} onClose={() => setSplitOpen(false)} />}
    </main>
  );
}

function CategoryChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={cn('h-10 shrink-0 rounded-full px-4 text-sm font-medium transition-colors', active ? 'bg-[var(--nav-active)] text-[var(--nav-active-ink)]' : 'border border-[var(--border)] text-[var(--ink)] hover:bg-[var(--surface-2)]')}>
      {label}
    </button>
  );
}

function MenuCard({ menu, hasVariants, onTap }: { menu: Menu; hasVariants: boolean; onTap: () => void }) {
  const discounted = menu.discount_price != null;
  return (
    <button onClick={onTap} disabled={menu.is_sold_out} className="flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-left transition-transform active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50">
      <div className="relative flex h-20 items-center justify-center bg-[var(--surface-2)]">
        {menu.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={menu.image_url} alt={menu.name} className="h-full w-full object-cover" />
        ) : <UtensilsCrossed className="h-6 w-6 text-[var(--muted)]" />}
        {menu.is_sold_out && <span className="absolute right-1.5 top-1.5 rounded-full bg-[var(--surface)]/90 px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)]">HABIS</span>}
        {hasVariants && !menu.is_sold_out && <span className="absolute left-1.5 top-1.5 rounded-full bg-[var(--primary)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--primary)]">Ada Variasi</span>}
      </div>
      <div className="flex flex-1 flex-col justify-between p-3">
        <span className="line-clamp-2 text-sm font-semibold text-[var(--ink)]">{menu.name}</span>
        {discounted ? (
          <div className="mt-2 flex flex-wrap items-baseline gap-1.5">
            <span className="text-xs text-[var(--muted)] line-through tabular-nums">{formatRupiah(menu.price)}</span>
            <span className="text-sm font-bold text-[var(--primary)] tabular-nums">{formatRupiah(menu.discount_price!)}</span>
          </div>
        ) : <span className="mt-2 text-sm font-bold text-[var(--primary)] tabular-nums">{formatRupiah(menu.price)}</span>}
      </div>
    </button>
  );
}

function VariantModal({ menu, groups, onClose, onConfirm }: { menu: Menu; groups: VariantGroup[]; onClose: () => void; onConfirm: (deltas: number[], summary: string | null) => void }) {
  const [picked, setPicked] = useState<Record<string, string[]>>({});

  function toggle(group: VariantGroup, optionId: string) {
    setPicked((prev) => {
      const current = prev[group.id] ?? [];
      if (group.selection === 'single') return { ...prev, [group.id]: current[0] === optionId ? [] : [optionId] };
      return { ...prev, [group.id]: current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId] };
    });
  }

  const missingRequired = groups.filter((g) => g.required && !(picked[g.id]?.length));
  const chosen = groups.flatMap((g) => (picked[g.id] ?? []).map((oid) => g.options.find((o) => o.id === oid)!).filter(Boolean));
  const extra = chosen.reduce((sum, o) => sum + o.price_delta, 0);
  const unitPrice = effectivePrice(menu) + extra;

  return (
    <Modal title={menu.name} onClose={onClose}>
      <div className="max-h-[55vh] space-y-5 overflow-y-auto pr-1">
        {groups.map((g) => (
          <fieldset key={g.id}>
            <legend className="mb-2 text-sm font-semibold text-[var(--ink)]">
              {g.name}
              <span className="ml-1.5 text-xs font-normal text-[var(--muted)]">{g.selection === 'single' ? 'pilih satu' : 'pilih banyak'}{g.required ? ' · wajib' : ' · opsional'}</span>
            </legend>
            <div className="space-y-1.5">
              {g.options.map((o) => {
                const isPicked = (picked[g.id] ?? []).includes(o.id);
                return (
                  <label key={o.id} className={cn('flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 transition-colors', isPicked ? 'border-[var(--primary)] bg-[var(--primary)]/10' : 'border-[var(--border)] hover:bg-[var(--surface-2)]')}>
                    <span className="flex items-center gap-2.5">
                      <input type={g.selection === 'single' ? 'radio' : 'checkbox'} name={g.id} checked={isPicked} onChange={() => toggle(g, o.id)} className="h-4 w-4 accent-[var(--primary)]" />
                      <span className="text-sm text-[var(--ink)]">{o.name}</span>
                    </span>
                    {o.price_delta !== 0 && <span className="shrink-0 text-sm font-medium text-[var(--muted)]">{o.price_delta > 0 ? '+' : '−'}{formatRupiah(Math.abs(o.price_delta))}</span>}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
      {missingRequired.length > 0 && <p className="mt-3 text-sm text-[var(--muted)]">Wajib pilih: {missingRequired.map((g) => g.name).join(', ')}</p>}
      <Button size="lg" className="mt-3 w-full" disabled={missingRequired.length > 0} onClick={() => onConfirm(chosen.map((o) => o.price_delta), chosen.map((o) => o.name).join(', ') || null)}>
        Tambah · {formatRupiah(unitPrice)}
      </Button>
    </Modal>
  );
}

function cashSuggestions(total: number): number[] {
  const notes = [5000, 10000, 20000, 50000, 100000];
  const ups = notes.map((n) => Math.ceil(total / n) * n).filter((v) => v > total);
  return [total, ...Array.from(new Set(ups))].slice(0, 4);
}

function PaymentModal({ total: subtotal, onClose, onConfirm }: { total: number; onClose: () => void; onConfirm: (method: 'cash' | 'qris' | 'transfer', cashReceived: number | null, customer: Customer | null, discount: number) => void }) {
  const [method, setMethod] = useState<'cash' | 'qris' | 'transfer'>('cash');
  const [cashInput, setCashInput] = useState('');
  const [discountInput, setDiscountInput] = useState('');

  const discount = Math.min(subtotal, parseInt(discountInput || '0', 10));
  const total = subtotal - discount;
  const cashReceived = parseInt(cashInput || '0', 10);
  const change = Math.max(0, cashReceived - total);
  const canConfirm = method !== 'cash' || cashReceived >= total;

  return (
    <Modal title="Bayar" onClose={onClose}>
      <p className="mb-4 text-3xl font-bold text-[var(--ink)] tabular-nums">{formatRupiah(total)}</p>

      <div className="mb-4">
        <Field label="Diskon" hint="Opsional, potongan nominal Rp">
          <Input inputMode="numeric" className="h-11" value={formatThousands(discountInput)} onChange={(e) => setDiscountInput(parseThousands(e.target.value))} />
        </Field>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        {(['cash', 'qris', 'transfer'] as const).map((m) => (
          <button key={m} onClick={() => setMethod(m)} className={cn('h-11 rounded-lg text-sm font-semibold capitalize transition-colors', method === m ? 'bg-[var(--nav-active)] text-[var(--nav-active-ink)]' : 'border border-[var(--border)] text-[var(--ink)] hover:bg-[var(--surface-2)]')}>
            {m === 'cash' ? 'Tunai' : m === 'qris' ? 'QRIS' : 'Transfer'}
          </button>
        ))}
      </div>

      {method === 'cash' && (
        <div className="mb-4">
          <Field label="Uang Diterima">
            <Input inputMode="numeric" autoFocus className="h-12 text-lg font-semibold" value={formatThousands(cashInput)} onChange={(e) => setCashInput(parseThousands(e.target.value))} />
          </Field>
          <div className="mt-2 flex flex-wrap gap-2">
            {cashSuggestions(total).map((v, i) => (
              <button key={v} type="button" onClick={() => setCashInput(String(v))} className="rounded-full bg-[var(--surface-2)] px-3 py-1.5 text-sm font-semibold text-[var(--ink)] hover:bg-[var(--border)]">
                {i === 0 ? 'Uang Pas' : formatRupiah(v)}
              </button>
            ))}
          </div>
          {cashInput && (
            <div className="mt-2 inline-block rounded-lg bg-[var(--surface-2)] px-3 py-2">
              <p className="text-xs text-[var(--muted)]">Kembalian</p>
              <p className="text-sm font-bold text-[var(--ink)] tabular-nums">{formatRupiah(change)}</p>
            </div>
          )}
        </div>
      )}

      <Button size="lg" className="w-full" disabled={!canConfirm} onClick={() => onConfirm(method, method === 'cash' ? cashReceived : null, null, discount)}>
        Konfirmasi Bayar
      </Button>
    </Modal>
  );
}

function SplitBillModal({ cart, subtotal, guestCount, onClose }: { cart: CartLine[]; subtotal: number; guestCount: number; onClose: () => void }) {
  const [mode, setMode] = useState<'rata' | 'item'>('rata');
  const [checked, setChecked] = useState<Set<string>>(new Set());

  const perPerson = guestCount > 0 ? Math.ceil(subtotal / guestCount) : subtotal;
  const itemSubtotal = cart.filter((l) => checked.has(l.line_id)).reduce((sum, l) => sum + l.price * l.qty, 0);

  function toggleItem(lineId: string) {
    setChecked((prev) => { const next = new Set(prev); next.has(lineId) ? next.delete(lineId) : next.add(lineId); return next; });
  }

  return (
    <Modal title="Bagi Bill" onClose={onClose}>
      <div className="mb-4 grid grid-cols-2 gap-2">
        <button onClick={() => setMode('rata')} className={cn('h-11 rounded-lg text-sm font-semibold', mode === 'rata' ? 'bg-[var(--nav-active)] text-[var(--nav-active-ink)]' : 'border border-[var(--border)] text-[var(--ink)]')}>Bagi Rata</button>
        <button onClick={() => setMode('item')} className={cn('h-11 rounded-lg text-sm font-semibold', mode === 'item' ? 'bg-[var(--nav-active)] text-[var(--nav-active-ink)]' : 'border border-[var(--border)] text-[var(--ink)]')}>Per Item</button>
      </div>

      {mode === 'rata' ? (
        <div className="rounded-xl bg-[var(--surface-2)] p-4 text-center">
          <p className="text-sm text-[var(--muted)]">{guestCount} orang</p>
          <p className="mt-1 text-2xl font-bold text-[var(--ink)] tabular-nums">{formatRupiah(perPerson)}</p>
          <p className="text-xs text-[var(--muted)]">per orang</p>
        </div>
      ) : (
        <>
          <ul className="mb-3 space-y-2">
            {cart.map((l) => (
              <li key={l.line_id}>
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-[var(--border)] p-3">
                  <span className="flex items-center gap-2.5">
                    <input type="checkbox" checked={checked.has(l.line_id)} onChange={() => toggleItem(l.line_id)} className="h-4 w-4 accent-[var(--primary)]" />
                    <span className="text-sm text-[var(--ink)]">{l.product_name} x{l.qty}</span>
                  </span>
                  <span className="text-sm font-medium text-[var(--muted)] tabular-nums">{formatRupiah(l.price * l.qty)}</span>
                </label>
              </li>
            ))}
          </ul>
          <div className="rounded-xl bg-[var(--surface-2)] p-4 text-center">
            <p className="text-sm text-[var(--muted)]">Subtotal item terpilih</p>
            <p className="mt-1 text-2xl font-bold text-[var(--ink)] tabular-nums">{formatRupiah(itemSubtotal)}</p>
          </div>
        </>
      )}
      <p className="mt-3 text-xs text-[var(--muted)]">Perhitungan bantu saja — pembayaran tetap diproses lewat tombol Bayar untuk total keseluruhan.</p>
    </Modal>
  );
}
