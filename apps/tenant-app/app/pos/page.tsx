'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, clearToken, getToken } from '../../lib/auth';
import { formatRupiah, formatThousands, parseThousands } from '../../lib/format';
import { effectivePrice } from '../../lib/types';
import type { CartLine, Category, Customer, Menu, MenuVariantGroup, Shift, VariantGroup } from '../../lib/types';
import { ThemeToggle } from '../../components/ThemeToggle';
import { SandboxLimitBanner } from '../../components/SandboxLimitBanner';
import { Button } from '../../components/ui/button';
import { Field } from '../../components/ui/field';
import { Input } from '../../components/ui/input';
import { Modal } from '../../components/ui/modal';

export default function PosPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [shift, setShift] = useState<Shift | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [groups, setGroups] = useState<VariantGroup[]>([]);
  const [links, setLinks] = useState<MenuVariantGroup[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | 'all'>('all');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [variantFor, setVariantFor] = useState<Menu | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [sandboxLimitMsg, setSandboxLimitMsg] = useState('');
  const [tableNumber, setTableNumber] = useState('');

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    Promise.all([
      apiFetch('/api/v1/catalog/categories'),
      apiFetch('/api/v1/catalog/menus'),
      apiFetch('/api/v1/catalog/variant-groups'),
      apiFetch('/api/v1/catalog/menu-variant-groups'),
      apiFetch('/api/v1/pos/shifts/current').catch((e) => (e.status === 404 ? null : Promise.reject(e))),
    ])
      .then(([cats, ms, gs, ls, currentShift]) => {
        setCategories(cats);
        setMenus(ms);
        setGroups(gs);
        setLinks(ls);
        setShift(currentShift);
      })
      .catch((e) => {
        if (e.status === 401) {
          clearToken();
          router.replace('/login');
        } else {
          setError(e.message);
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  const visibleMenus = useMemo(
    () =>
      menus
        .filter((m) => m.is_active)
        .filter((m) => activeCategory === 'all' || m.category_id === activeCategory)
        .sort((a, b) => a.sort_order - b.sort_order),
    [menus, activeCategory]
  );

  /** Grup variasi yang berlaku untuk sebuah menu. */
  function groupsForMenu(menu: Menu) {
    const ids = links.filter((l) => l.menu_id === menu.id).map((l) => l.variant_group_id);
    return groups.filter((g) => ids.includes(g.id));
  }

  const subtotal = cart.reduce((sum, line) => sum + line.price * line.qty, 0);

  function tapMenu(menu: Menu) {
    if (menu.is_sold_out) return;
    if (groupsForMenu(menu).length > 0) {
      setVariantFor(menu); // punya variasi → pilih dulu
      return;
    }
    addLine(menu, [], null);
  }

  function addLine(menu: Menu, deltas: number[], variantSummary: string | null) {
    const unitPrice = effectivePrice(menu) + deltas.reduce((a, b) => a + b, 0);
    setCart((prev) => {
      // Baris digabung hanya kalau menu DAN variasinya sama persis.
      const existing = prev.find((l) => l.menu_id === menu.id && l.variant_summary === variantSummary);
      if (existing) {
        return prev.map((l) => (l.line_id === existing.line_id ? { ...l, qty: l.qty + 1 } : l));
      }
      return [
        ...prev,
        {
          line_id: crypto.randomUUID(),
          menu_id: menu.id,
          product_name: menu.name,
          variant_summary: variantSummary,
          price: unitPrice,
          qty: 1,
          notes: null,
        },
      ];
    });
  }

  function changeQty(lineId: string, delta: number) {
    setCart((prev) =>
      prev.map((l) => (l.line_id === lineId ? { ...l, qty: l.qty + delta } : l)).filter((l) => l.qty > 0)
    );
  }

  async function openShift(cashierName: string, openingCash: number) {
    setError('');
    try {
      const row = await apiFetch('/api/v1/pos/shifts', {
        method: 'POST',
        body: JSON.stringify({ cashier_name: cashierName, opening_cash: openingCash }),
      });
      setShift(row);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function submitOrder(
    paymentMethod: 'cash' | 'qris' | 'transfer',
    cashReceived: number | null,
    customer: Customer | null
  ) {
    if (!cart.length) return;
    const total = subtotal;
    const change = paymentMethod === 'cash' && cashReceived != null ? Math.max(0, cashReceived - total) : null;
    try {
      await apiFetch('/api/v1/pos/orders', {
        method: 'POST',
        body: JSON.stringify({
          id: crypto.randomUUID(),
          shift_id: shift?.id ?? null,
          status: 'paid',
          subtotal,
          discount: 0,
          total,
          payment_method: paymentMethod,
          cash_received: cashReceived,
          change_amount: change,
          customer_id: customer?.id ?? null,
          customer_name: customer?.name ?? null,
          table_number: tableNumber || null,
          created_at: new Date().toISOString(),
          items: cart.map((l) => ({
            menu_id: l.menu_id,
            product_name: l.product_name,
            variant_summary: l.variant_summary,
            price: l.price,
            qty: l.qty,
            notes: l.notes,
          })),
        }),
      });
      setCart([]);
      setPayOpen(false);
      setTableNumber('');
    } catch (e: any) {
      if (e.code === 'SANDBOX_LIMIT') {
        setSandboxLimitMsg(e.message || 'Batas transaksi trial tercapai. Upgrade untuk lanjutkan.');
        setPayOpen(false);
      } else {
        setError(e.message);
      }
    }
  }

  if (loading) {
    return <main className="flex min-h-dvh items-center justify-center text-[var(--muted)]">Memuat...</main>;
  }

  if (!shift) {
    return <OpenShiftScreen error={error} onOpen={openShift} />;
  }

  return (
    <main className="flex min-h-dvh flex-col bg-[var(--bg)]">
      <header className="flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/')} aria-label="Kembali ke dashboard">
            ←
          </Button>
          <div>
            <p className="text-sm font-semibold text-[var(--ink)]">Kasir POS</p>
            <p className="text-xs text-[var(--muted)]">{shift.cashier_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-[var(--status-active)] px-3 py-1 text-xs font-semibold text-[var(--status-active-ink)]">
            Shift Terbuka
          </span>
          <ThemeToggle />
        </div>
      </header>

      {error && (
        <div className="border-b border-[var(--border)] bg-red-500/10 px-4 py-2 text-sm text-red-500">{error}</div>
      )}
      {sandboxLimitMsg && (
        <div className="border-b border-[var(--border)] p-3">
          <SandboxLimitBanner message={sandboxLimitMsg} />
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col md:flex-row landscape:flex-row">
        {/* Panel menu */}
        <section className="flex min-h-0 flex-1 flex-col md:w-[60%] md:flex-none landscape:w-[60%] landscape:flex-none">
          <div className="flex gap-2 overflow-x-auto border-b border-[var(--border)] p-3">
            <CategoryChip label="Semua" active={activeCategory === 'all'} onClick={() => setActiveCategory('all')} />
            {categories
              .filter((c) => c.is_active)
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((c) => (
                <CategoryChip
                  key={c.id}
                  label={c.name}
                  active={activeCategory === c.id}
                  onClick={() => setActiveCategory(c.id)}
                />
              ))}
          </div>

          <div className="grid flex-1 auto-rows-min grid-cols-2 gap-3 overflow-y-auto p-3 sm:grid-cols-3 lg:grid-cols-4">
            {visibleMenus.map((menu) => (
              <MenuCard
                key={menu.id}
                menu={menu}
                hasVariants={groupsForMenu(menu).length > 0}
                onTap={() => tapMenu(menu)}
              />
            ))}
            {visibleMenus.length === 0 && (
              <p className="col-span-full py-10 text-center text-sm text-[var(--muted)]">
                Belum ada menu di kategori ini.
              </p>
            )}
          </div>
        </section>

        {/* Panel cart */}
        <aside className="flex min-h-0 flex-1 flex-col border-t border-[var(--border)] bg-[var(--surface)] md:w-[40%] md:max-w-md md:flex-none md:border-l md:border-t-0 landscape:w-[40%] landscape:max-w-md landscape:flex-none landscape:border-l landscape:border-t-0">
          <div className="flex-1 overflow-y-auto p-4">
            <h2 className="mb-3 text-sm font-semibold text-[var(--ink)]">Keranjang</h2>
            {cart.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">Belum ada item. Ketuk menu untuk menambah.</p>
            ) : (
              <ul className="space-y-3">
                {cart.map((line) => (
                  <li key={line.line_id} className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--ink)]">{line.product_name}</p>
                      {line.variant_summary && (
                        <p className="truncate text-xs text-[var(--muted)]">{line.variant_summary}</p>
                      )}
                      <p className="text-xs text-[var(--muted)]">{formatRupiah(line.price)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        aria-label={`Kurangi ${line.product_name}`}
                        onClick={() => changeQty(line.line_id, -1)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--ink)] hover:bg-[var(--surface-2)]"
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-sm font-semibold text-[var(--ink)]">{line.qty}</span>
                      <button
                        aria-label={`Tambah ${line.product_name}`}
                        onClick={() => changeQty(line.line_id, 1)}
                        className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--ink)] hover:bg-[var(--surface-2)]"
                      >
                        +
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="border-t border-[var(--border)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-[var(--muted)]">Total</span>
              <span className="text-xl font-bold text-[var(--ink)]">{formatRupiah(subtotal)}</span>
            </div>
            <Button size="lg" disabled={cart.length === 0 || !!sandboxLimitMsg} onClick={() => setPayOpen(true)} className="w-full">
              Bayar
            </Button>
          </div>
        </aside>
      </div>

      {variantFor && (
        <VariantModal
          menu={variantFor}
          groups={groupsForMenu(variantFor)}
          onClose={() => setVariantFor(null)}
          onConfirm={(deltas, summary) => {
            addLine(variantFor, deltas, summary);
            setVariantFor(null);
          }}
        />
      )}

      {payOpen && <PaymentModal total={subtotal} onClose={() => setPayOpen(false)} onConfirm={submitOrder} />}
    </main>
  );
}

function CategoryChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`h-10 shrink-0 rounded-full px-4 text-sm font-medium transition-colors ${
        active
          ? 'bg-[var(--primary)] text-[var(--primary-ink)]'
          : 'border border-[var(--border)] text-[var(--ink)] hover:bg-[var(--surface-2)]'
      }`}
    >
      {label}
    </button>
  );
}

function MenuCard({ menu, hasVariants, onTap }: { menu: Menu; hasVariants: boolean; onTap: () => void }) {
  const discounted = menu.discount_price != null;
  return (
    <button
      onClick={onTap}
      disabled={menu.is_sold_out}
      className="flex min-h-[104px] flex-col justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left transition-transform active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <div>
        <span className="line-clamp-2 text-sm font-semibold text-[var(--ink)]">{menu.name}</span>
        {hasVariants && !menu.is_sold_out && (
          <span className="mt-1 block text-xs text-[var(--muted)]">pilih variasi</span>
        )}
      </div>

      {menu.is_sold_out ? (
        <span className="mt-2 self-start rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-xs font-semibold text-[var(--muted)]">
          HABIS
        </span>
      ) : discounted ? (
        <div className="mt-2 flex flex-wrap items-baseline gap-1.5">
          <span className="text-xs text-[var(--muted)] line-through">{formatRupiah(menu.price)}</span>
          <span className="text-sm font-bold text-[var(--primary)]">{formatRupiah(menu.discount_price!)}</span>
        </div>
      ) : (
        <span className="mt-2 text-sm font-bold text-[var(--primary)]">{formatRupiah(menu.price)}</span>
      )}
    </button>
  );
}

// ── Modal pilih variasi ───────────────────────────────────────────────────────

function VariantModal({
  menu,
  groups,
  onClose,
  onConfirm,
}: {
  menu: Menu;
  groups: VariantGroup[];
  onClose: () => void;
  onConfirm: (deltas: number[], summary: string | null) => void;
}) {
  // groupId -> optionId[] (single = maksimal 1)
  const [picked, setPicked] = useState<Record<string, string[]>>({});

  function toggle(group: VariantGroup, optionId: string) {
    setPicked((prev) => {
      const current = prev[group.id] ?? [];
      if (group.selection === 'single') {
        return { ...prev, [group.id]: current[0] === optionId ? [] : [optionId] };
      }
      return {
        ...prev,
        [group.id]: current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId],
      };
    });
  }

  const missingRequired = groups.filter((g) => g.required && !(picked[g.id]?.length));

  const chosen = groups.flatMap((g) =>
    (picked[g.id] ?? []).map((oid) => g.options.find((o) => o.id === oid)!).filter(Boolean)
  );
  const extra = chosen.reduce((sum, o) => sum + o.price_delta, 0);
  const unitPrice = effectivePrice(menu) + extra;

  return (
    <Modal title={menu.name} onClose={onClose}>
      <div className="space-y-5">
        {groups.map((g) => (
          <fieldset key={g.id}>
            <legend className="mb-2 text-sm font-semibold text-[var(--ink)]">
              {g.name}
              <span className="ml-1.5 text-xs font-normal text-[var(--muted)]">
                {g.selection === 'single' ? 'pilih satu' : 'pilih banyak'}
                {g.required ? ' · wajib' : ' · opsional'}
              </span>
            </legend>
            <div className="space-y-1.5">
              {g.options.map((o) => {
                const isPicked = (picked[g.id] ?? []).includes(o.id);
                return (
                  <label
                    key={o.id}
                    className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 transition-colors ${
                      isPicked
                        ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                        : 'border-[var(--border)] hover:bg-[var(--surface-2)]'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <input
                        type={g.selection === 'single' ? 'radio' : 'checkbox'}
                        name={g.id}
                        checked={isPicked}
                        onChange={() => toggle(g, o.id)}
                        className="h-4 w-4 accent-[var(--primary)]"
                      />
                      <span className="text-sm text-[var(--ink)]">{o.name}</span>
                    </span>
                    {o.price_delta !== 0 && (
                      <span className="shrink-0 text-sm font-medium text-[var(--muted)]">
                        {o.price_delta > 0 ? '+' : '−'}
                        {formatRupiah(Math.abs(o.price_delta))}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}

        {missingRequired.length > 0 && (
          <p className="text-sm text-[var(--muted)]">
            Wajib pilih: {missingRequired.map((g) => g.name).join(', ')}
          </p>
        )}

        <Button
          size="lg"
          className="w-full"
          disabled={missingRequired.length > 0}
          onClick={() => onConfirm(chosen.map((o) => o.price_delta), chosen.map((o) => o.name).join(', ') || null)}
        >
          Tambah · {formatRupiah(unitPrice)}
        </Button>
      </div>
    </Modal>
  );
}

// ── Modal bayar (dengan pilih pelanggan) ──────────────────────────────────────

function PaymentModal({
  total,
  onClose,
  onConfirm,
}: {
  total: number;
  onClose: () => void;
  onConfirm: (method: 'cash' | 'qris' | 'transfer', cashReceived: number | null, customer: Customer | null) => void;
}) {
  const [method, setMethod] = useState<'cash' | 'qris' | 'transfer'>('cash');
  const [cashInput, setCashInput] = useState('');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [pickCustomer, setPickCustomer] = useState(false);

  const cashReceived = parseInt(cashInput || '0', 10);
  const change = Math.max(0, cashReceived - total);
  const canConfirm = method !== 'cash' || cashReceived >= total;

  if (pickCustomer) {
    return (
      <CustomerPicker
        onClose={() => setPickCustomer(false)}
        onPick={(c) => {
          setCustomer(c);
          setPickCustomer(false);
        }}
      />
    );
  }

  return (
    <Modal title="Bayar" onClose={onClose}>
      <p className="mb-4 text-3xl font-bold text-[var(--ink)]">{formatRupiah(total)}</p>

      {/* Pelanggan — opsional, muncul di struk */}
      <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] p-3">
        <div className="min-w-0">
          <p className="text-xs text-[var(--muted)]">Pelanggan</p>
          <p className="truncate text-sm font-medium text-[var(--ink)]">
            {customer ? customer.name : 'Tanpa nama'}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          {customer && (
            <Button variant="ghost" size="sm" onClick={() => setCustomer(null)}>
              Hapus
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setPickCustomer(true)}>
            {customer ? 'Ganti' : 'Pilih'}
          </Button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-2">
        {(['cash', 'qris', 'transfer'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMethod(m)}
            className={`h-11 rounded-lg text-sm font-semibold capitalize transition-colors ${
              method === m
                ? 'bg-[var(--primary)] text-[var(--primary-ink)]'
                : 'border border-[var(--border)] text-[var(--ink)] hover:bg-[var(--surface-2)]'
            }`}
          >
            {m === 'cash' ? 'Tunai' : m === 'qris' ? 'QRIS' : 'Transfer'}
          </button>
        ))}
      </div>

      {method === 'cash' && (
        <div className="mb-4">
          <Field label="Uang Diterima">
            <Input
              inputMode="numeric" autoFocus
              className="h-12 text-lg font-semibold"
              value={formatThousands(cashInput)}
              onChange={(e) => setCashInput(parseThousands(e.target.value))}
            />
          </Field>
          {cashInput && (
            <p className="mt-2 text-sm text-[var(--muted)]">
              Kembalian: <span className="font-semibold text-[var(--ink)]">{formatRupiah(change)}</span>
            </p>
          )}
        </div>
      )}

      <Button
        size="lg"
        className="w-full"
        disabled={!canConfirm}
        onClick={() => onConfirm(method, method === 'cash' ? cashReceived : null, customer)}
      >
        Konfirmasi Bayar
      </Button>
    </Modal>
  );
}

function CustomerPicker({ onClose, onPick }: { onClose: () => void; onPick: (c: Customer) => void }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      apiFetch(`/api/v1/tenants/customers${search ? `?search=${encodeURIComponent(search)}` : ''}`)
        .then((res) => setResults(res.data))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  async function createAndPick(e: React.FormEvent) {
    e.preventDefault();
    const row = await apiFetch('/api/v1/tenants/customers', {
      method: 'POST',
      body: JSON.stringify({ name: newName, phone: newPhone || null }),
    });
    onPick(row);
  }

  return (
    <Modal title="Pilih Pelanggan" onClose={onClose}>
      {creating ? (
        <form onSubmit={createAndPick} className="space-y-4">
          <Field label="Nama">
            <Input required autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} />
          </Field>
          <Field label="No HP" hint="Opsional">
            <Input type="tel" inputMode="tel" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
          </Field>
          <div className="flex gap-3">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setCreating(false)}>
              Kembali
            </Button>
            <Button type="submit" className="flex-1">Simpan & Pilih</Button>
          </div>
        </form>
      ) : (
        <>
          <Input
            type="search" autoFocus placeholder="Cari nama atau no HP..."
            value={search} onChange={(e) => setSearch(e.target.value)}
          />

          <ul className="my-4 max-h-64 space-y-1.5 overflow-y-auto">
            {results.map((c) => (
              <li key={c.id}>
                <button
                  onClick={() => onPick(c)}
                  className="w-full rounded-xl border border-[var(--border)] p-3 text-left transition-colors hover:bg-[var(--surface-2)]"
                >
                  <p className="text-sm font-medium text-[var(--ink)]">{c.name}</p>
                  <p className="text-xs text-[var(--muted)]">{c.phone || 'Tanpa no HP'}</p>
                </button>
              </li>
            ))}
            {results.length === 0 && (
              <li className="py-6 text-center text-sm text-[var(--muted)]">
                {search ? 'Tidak ditemukan.' : 'Belum ada pelanggan.'}
              </li>
            )}
          </ul>

          <Button variant="outline" className="w-full" onClick={() => setCreating(true)}>
            + Pelanggan Baru
          </Button>
        </>
      )}
    </Modal>
  );
}

// ── Layar buka shift ──────────────────────────────────────────────────────────

function OpenShiftScreen({
  error,
  onOpen,
}: {
  error: string;
  onOpen: (cashierName: string, openingCash: number) => void;
}) {
  const [cashierName, setCashierName] = useState('');
  const [openingCash, setOpeningCash] = useState('0');

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[var(--bg)] px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h1 className="mb-1 text-lg font-bold text-[var(--ink)]">Mulai Shift</h1>
        <p className="mb-5 text-sm text-[var(--muted)]">Isi data kasir sebelum mulai berjualan.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onOpen(cashierName, parseInt(openingCash || '0', 10));
          }}
          className="space-y-4"
        >
          <Field label="Nama Kasir">
            <Input required autoFocus className="h-12" value={cashierName} onChange={(e) => setCashierName(e.target.value)} />
          </Field>
          <Field label="Uang Awal Laci">
            <Input
              inputMode="numeric" className="h-12"
              value={formatThousands(openingCash)} onChange={(e) => setOpeningCash(parseThousands(e.target.value))}
            />
          </Field>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" size="lg" className="w-full">Mulai Shift</Button>
        </form>
      </div>
    </main>
  );
}
