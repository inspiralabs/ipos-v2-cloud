'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { UtensilsCrossed } from 'lucide-react';
import { formatRupiah } from '../../../lib/format';
import { Button } from '../../../components/ui/button';
import { Field } from '../../../components/ui/field';
import { Input } from '../../../components/ui/input';
import { Modal } from '../../../components/ui/modal';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

type PublicOption = { id: string; name: string; price_delta: number };
type PublicVariantGroup = { id: string; name: string; selection: 'single' | 'multi'; required: boolean; options: PublicOption[] };
type PublicMenu = {
  id: string; name: string; description: string | null; price: number; discount_price: number | null;
  image_url: string | null; category_id: string | null; variant_groups: PublicVariantGroup[];
};
type PublicCategory = { id: string; name: string; sort_order: number };
type CartLine = {
  line_id: string; menu_id: string; name: string; unit_price: number; qty: number;
  variant_option_ids: string[]; variant_summary: string | null;
};
type OrderResult = {
  id: string;
  total: number;
  payment_method: 'cash' | 'qris';
  table_number: string | null;
  customer_name: string | null;
  created_at: string;
  items: { product_name: string; variant_summary: string | null; price: number; qty: number }[];
  store: { name: string; phone: string | null; logo_url: string | null };
};

export default function SelfOrderPage() {
  const { qrToken } = useParams<{ qrToken: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [menus, setMenus] = useState<PublicMenu[]>([]);
  const [categories, setCategories] = useState<PublicCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | 'all'>('all');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [variantFor, setVariantFor] = useState<PublicMenu | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [receipt, setReceipt] = useState<OrderResult | null>(null); // QRIS: tampil dulu sebelum success
  const [submitted, setSubmitted] = useState<OrderResult | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/api/v1/menus/public/${qrToken}`)
      .then((res) => {
        if (!res.ok) throw new Error(res.status === 404 ? 'Meja tidak ditemukan' : 'Gagal memuat menu');
        return res.json();
      })
      .then((data) => {
        setMenus(data.menus);
        setCategories(data.categories);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [qrToken]);

  const visibleMenus = useMemo(
    () => menus.filter((m) => activeCategory === 'all' || m.category_id === activeCategory),
    [menus, activeCategory]
  );

  const subtotal = cart.reduce((sum, l) => sum + l.unit_price * l.qty, 0);

  function tapMenu(menu: PublicMenu) {
    if (menu.variant_groups.length > 0) {
      setVariantFor(menu);
      return;
    }
    addLine(menu, [], null, menu.discount_price ?? menu.price);
  }

  function addLine(menu: PublicMenu, optionIds: string[], summary: string | null, unitPrice: number) {
    setCart((prev) => {
      const existing = prev.find((l) => l.menu_id === menu.id && l.variant_summary === summary);
      if (existing) return prev.map((l) => (l.line_id === existing.line_id ? { ...l, qty: l.qty + 1 } : l));
      return [...prev, { line_id: crypto.randomUUID(), menu_id: menu.id, name: menu.name, unit_price: unitPrice, qty: 1, variant_option_ids: optionIds, variant_summary: summary }];
    });
  }

  function changeQty(lineId: string, delta: number) {
    setCart((prev) => prev.map((l) => (l.line_id === lineId ? { ...l, qty: l.qty + delta } : l)).filter((l) => l.qty > 0));
  }

  async function submitOrder(customerName: string, paymentMethod: 'cash' | 'qris') {
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/v1/pos/orders/self-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          qr_token: qrToken,
          customer_name: customerName || null,
          payment_method: paymentMethod,
          items: cart.map((l) => ({ menu_id: l.menu_id, qty: l.qty, variant_option_ids: l.variant_option_ids, notes: null })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Gagal membuat pesanan' }));
        throw new Error(err.error);
      }
      const order = (await res.json()) as OrderResult;
      setCart([]);
      setCheckoutOpen(false);
      // Alur tetap: menu -> cart/bayar -> (QRIS saja) struk -> selesai. Bayar di Kasir langsung ke selesai.
      if (paymentMethod === 'qris') setReceipt(order);
      else setSubmitted(order);
    } catch (e: any) {
      setError(e.message);
    }
  }

  if (loading) {
    return <main className="flex min-h-dvh items-center justify-center bg-[var(--bg)] text-[var(--muted)]">Memuat menu...</main>;
  }

  if (error && menus.length === 0) {
    return <main className="flex min-h-dvh items-center justify-center bg-[var(--bg)] px-4 text-center text-[var(--muted)]">{error}</main>;
  }

  if (receipt) {
    return <ReceiptScreen order={receipt} onContinue={() => { setSubmitted(receipt); setReceipt(null); }} />;
  }

  if (submitted) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-[var(--bg)] px-4 text-center">
        <h1 className="text-xl font-bold text-[var(--ink)]">Pesanan Diterima</h1>
        <p className="text-sm text-[var(--muted)]">
          Pesananmu senilai {formatRupiah(submitted.total)} sudah masuk ke dapur.
          {submitted.payment_method === 'cash' && <><br />Tunjukkan layar ini ke kasir untuk pembayaran.</>}
        </p>
        <Button className="mt-3" onClick={() => setSubmitted(null)}>Pesan Lagi</Button>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col bg-[var(--bg)] pb-24">
      <header className="border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3">
        <h1 className="text-sm font-semibold text-[var(--ink)]">Pesan Menu</h1>
        <p className="text-xs text-[var(--muted)]">Scan ulang bila menu tidak muncul</p>
      </header>

      {error && <div className="border-b border-[var(--border)] bg-red-500/10 px-4 py-2 text-sm text-red-500">{error}</div>}

      <div className="flex gap-2 overflow-x-auto border-b border-[var(--border)] p-3">
        <CategoryChip label="Semua" active={activeCategory === 'all'} onClick={() => setActiveCategory('all')} />
        {categories.sort((a, b) => a.sort_order - b.sort_order).map((c) => (
          <CategoryChip key={c.id} label={c.name} active={activeCategory === c.id} onClick={() => setActiveCategory(c.id)} />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3">
        {visibleMenus.map((menu) => (
          <MenuCard key={menu.id} menu={menu} onTap={() => tapMenu(menu)} />
        ))}
        {visibleMenus.length === 0 && (
          <p className="col-span-full py-10 text-center text-sm text-[var(--muted)]">Belum ada menu tersedia.</p>
        )}
      </div>

      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-[var(--border)] bg-[var(--surface)] p-4">
          <Button size="lg" className="w-full" onClick={() => setCheckoutOpen(true)}>
            Keranjang ({cart.reduce((n, l) => n + l.qty, 0)}) · {formatRupiah(subtotal)}
          </Button>
        </div>
      )}

      {variantFor && (
        <VariantModal
          menu={variantFor}
          onClose={() => setVariantFor(null)}
          onConfirm={(optionIds, summary, unitPrice) => {
            addLine(variantFor, optionIds, summary, unitPrice);
            setVariantFor(null);
          }}
        />
      )}

      {checkoutOpen && (
        <CheckoutModal
          cart={cart}
          subtotal={subtotal}
          onChangeQty={changeQty}
          onClose={() => setCheckoutOpen(false)}
          onConfirm={submitOrder}
        />
      )}
    </main>
  );
}

function CategoryChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`h-10 shrink-0 rounded-full px-4 text-sm font-medium transition-colors ${
        active ? 'bg-[var(--nav-active)] text-[var(--nav-active-ink)]' : 'border border-[var(--border)] text-[var(--ink)] hover:bg-[var(--surface-2)]'
      }`}
    >
      {label}
    </button>
  );
}

function MenuCard({ menu, onTap }: { menu: PublicMenu; onTap: () => void }) {
  const discounted = menu.discount_price != null;
  return (
    <button
      onClick={onTap}
      className="flex flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-left transition-transform active:scale-[0.97]"
    >
      <div className="flex h-20 items-center justify-center bg-[var(--surface-2)]">
        {menu.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={menu.image_url} alt={menu.name} className="h-full w-full object-cover" />
        ) : (
          <UtensilsCrossed className="h-6 w-6 text-[var(--muted)]" />
        )}
      </div>
      <div className="flex flex-1 flex-col justify-between p-3">
        <span className="line-clamp-2 text-sm font-semibold text-[var(--ink)]">{menu.name}</span>
        {discounted ? (
          <div className="mt-2 flex flex-wrap items-baseline gap-1.5">
            <span className="text-xs text-[var(--muted)] line-through tabular-nums">{formatRupiah(menu.price)}</span>
            <span className="text-sm font-bold text-[var(--primary)] tabular-nums">{formatRupiah(menu.discount_price!)}</span>
          </div>
        ) : (
          <span className="mt-2 text-sm font-bold text-[var(--primary)] tabular-nums">{formatRupiah(menu.price)}</span>
        )}
      </div>
    </button>
  );
}

function VariantModal({
  menu, onClose, onConfirm,
}: {
  menu: PublicMenu;
  onClose: () => void;
  onConfirm: (optionIds: string[], summary: string | null, unitPrice: number) => void;
}) {
  const [picked, setPicked] = useState<Record<string, string[]>>({});

  function toggle(group: PublicVariantGroup, optionId: string) {
    setPicked((prev) => {
      const current = prev[group.id] ?? [];
      if (group.selection === 'single') return { ...prev, [group.id]: current[0] === optionId ? [] : [optionId] };
      return { ...prev, [group.id]: current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId] };
    });
  }

  const missingRequired = menu.variant_groups.filter((g) => g.required && !(picked[g.id]?.length));
  const chosen = menu.variant_groups.flatMap((g) => (picked[g.id] ?? []).map((oid) => g.options.find((o) => o.id === oid)!).filter(Boolean));
  const basePrice = menu.discount_price ?? menu.price;
  const unitPrice = basePrice + chosen.reduce((sum, o) => sum + o.price_delta, 0);

  return (
    <Modal title={menu.name} onClose={onClose}>
      <div className="max-h-[55vh] space-y-5 overflow-y-auto pr-1">
        {menu.variant_groups.map((g) => (
          <fieldset key={g.id}>
            <legend className="mb-2 text-sm font-semibold text-[var(--ink)]">
              {g.name}
              <span className="ml-1.5 text-xs font-normal text-[var(--muted)]">
                {g.selection === 'single' ? 'pilih satu' : 'pilih banyak'}{g.required ? ' · wajib' : ' · opsional'}
              </span>
            </legend>
            <div className="space-y-1.5">
              {g.options.map((o) => {
                const isPicked = (picked[g.id] ?? []).includes(o.id);
                return (
                  <label
                    key={o.id}
                    className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 transition-colors ${
                      isPicked ? 'border-[var(--primary)] bg-[var(--primary)]/10' : 'border-[var(--border)] hover:bg-[var(--surface-2)]'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <input type={g.selection === 'single' ? 'radio' : 'checkbox'} name={g.id} checked={isPicked} onChange={() => toggle(g, o.id)} className="h-4 w-4 accent-[var(--primary)]" />
                      <span className="text-sm text-[var(--ink)]">{o.name}</span>
                    </span>
                    {o.price_delta !== 0 && (
                      <span className="shrink-0 text-sm font-medium text-[var(--muted)]">{o.price_delta > 0 ? '+' : '−'}{formatRupiah(Math.abs(o.price_delta))}</span>
                    )}
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>
      {missingRequired.length > 0 && (
        <p className="mt-3 text-sm text-[var(--muted)]">Wajib pilih: {missingRequired.map((g) => g.name).join(', ')}</p>
      )}
      <Button
        size="lg" className="mt-3 w-full" disabled={missingRequired.length > 0}
        onClick={() => onConfirm(chosen.map((o) => o.id), chosen.map((o) => o.name).join(', ') || null, unitPrice)}
      >
        Tambah · {formatRupiah(unitPrice)}
      </Button>
    </Modal>
  );
}

function CheckoutModal({
  cart, subtotal, onChangeQty, onClose, onConfirm,
}: {
  cart: CartLine[];
  subtotal: number;
  onChangeQty: (lineId: string, delta: number) => void;
  onClose: () => void;
  onConfirm: (customerName: string, paymentMethod: 'cash' | 'qris') => void;
}) {
  const [name, setName] = useState('');
  const [method, setMethod] = useState<'cash' | 'qris'>('cash');
  const [submitting, setSubmitting] = useState(false);

  return (
    <Modal title="Pesanan Kamu" onClose={onClose}>
      <ul className="mb-4 space-y-3">
        {cart.map((l) => (
          <li key={l.line_id} className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-[var(--ink)]">{l.name}</p>
              {l.variant_summary && <p className="truncate text-xs text-[var(--muted)]">{l.variant_summary}</p>}
              <p className="text-xs text-[var(--muted)] tabular-nums">{formatRupiah(l.unit_price)}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button onClick={() => onChangeQty(l.line_id, -1)} className="h-8 w-8 rounded-full border border-[var(--border)] text-[var(--ink)]">−</button>
              <span className="w-5 text-center text-sm font-semibold text-[var(--ink)]">{l.qty}</span>
              <button onClick={() => onChangeQty(l.line_id, 1)} className="h-8 w-8 rounded-full border border-[var(--border)] text-[var(--ink)]">+</button>
            </div>
          </li>
        ))}
      </ul>

      <div className="mb-4">
        <Field label="Nama (opsional)" hint="Supaya kasir bisa panggil pesananmu">
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        {(['cash', 'qris'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMethod(m)}
            className={`h-11 rounded-lg text-sm font-semibold transition-colors ${
              method === m ? 'bg-[var(--nav-active)] text-[var(--nav-active-ink)]' : 'border border-[var(--border)] text-[var(--ink)] hover:bg-[var(--surface-2)]'
            }`}
          >
            {m === 'cash' ? 'Bayar di Kasir' : 'QRIS'}
          </button>
        ))}
      </div>

      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm text-[var(--muted)]">Total</span>
        <span className="text-xl font-bold text-[var(--ink)] tabular-nums">{formatRupiah(subtotal)}</span>
      </div>

      <Button
        size="lg" className="w-full" disabled={cart.length === 0 || submitting}
        onClick={async () => { setSubmitting(true); await onConfirm(name, method); setSubmitting(false); }}
      >
        Kirim Pesanan
      </Button>
    </Modal>
  );
}

// Struk digital — ditampilkan sekali setelah bayar QRIS (§13-receipt), sebelum layar sukses.
function ReceiptScreen({ order, onContinue }: { order: OrderResult; onContinue: () => void }) {
  const date = new Date(order.created_at);
  const dateLabel = date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeLabel = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  return (
    <main className="flex min-h-dvh flex-col items-center bg-[var(--bg)] px-4 py-6">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="flex flex-col items-center gap-1.5 bg-[#1a1310] px-4 py-6 text-center text-white">
          {order.store.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={order.store.logo_url} alt={order.store.name} className="h-12 w-12 rounded-full object-cover" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-lg font-bold">
              {order.store.name.charAt(0).toUpperCase()}
            </div>
          )}
          <p className="text-sm font-bold">{order.store.name}</p>
          {order.store.phone && <p className="text-xs text-white/70">{order.store.phone}</p>}
        </div>

        <div className="space-y-1 px-4 pt-4 text-xs text-[var(--muted)]">
          <div className="flex justify-between"><span>No.</span><span className="text-[var(--ink)]">{order.id.slice(0, 8).toUpperCase()}</span></div>
          <div className="flex justify-between"><span>Tanggal</span><span className="text-[var(--ink)]">{dateLabel}, {timeLabel}</span></div>
          <div className="flex justify-between"><span>Pembayaran</span><span className="text-[var(--ink)]">QRIS</span></div>
          {order.table_number && <div className="flex justify-between"><span>Meja</span><span className="text-[var(--ink)]">{order.table_number}</span></div>}
        </div>

        <div className="mx-4 my-3 border-t border-dashed border-[var(--border)]" />

        <div className="space-y-2 px-4 text-xs">
          {order.items.map((item, i) => (
            <div key={i}>
              <div className="flex justify-between text-[var(--ink)]">
                <span>{item.product_name}</span>
                <span className="tabular-nums">{formatRupiah(item.price * item.qty)}</span>
              </div>
              {item.variant_summary && <p className="text-[var(--muted)]">› {item.variant_summary}</p>}
              <p className="text-[var(--muted)]">{item.qty} × {formatRupiah(item.price)}</p>
            </div>
          ))}
        </div>

        <div className="mx-4 my-3 border-t border-dashed border-[var(--border)]" />

        <div className="space-y-1 px-4 text-xs">
          <div className="flex justify-between text-[var(--ink)]"><span>Subtotal</span><span className="tabular-nums">{formatRupiah(order.total)}</span></div>
        </div>

        <div className="mx-4 my-3 border-t border-dashed border-[var(--border)]" />

        <div className="space-y-1 px-4 pb-2 text-sm font-bold text-[var(--ink)]">
          <div className="flex justify-between"><span>TOTAL</span><span className="tabular-nums">{formatRupiah(order.total)}</span></div>
          <div className="flex justify-between text-xs font-normal text-[var(--muted)]"><span>Bayar</span><span className="tabular-nums">{formatRupiah(order.total)}</span></div>
          <div className="flex justify-between text-xs font-normal text-[var(--muted)]"><span>Kembalian</span><span className="tabular-nums">{formatRupiah(0)}</span></div>
        </div>

        <div className="space-y-0.5 px-4 pb-6 pt-2 text-center text-[11px] text-[var(--muted)]">
          <p className="font-medium text-[var(--primary)]">Selamat Menikmati!</p>
          <p>Powered by Inspira POS</p>
        </div>
      </div>

      <Button size="lg" className="mt-6 w-full max-w-sm" onClick={onContinue}>Lanjut</Button>
    </main>
  );
}
