'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/auth';
import type { Customer } from '@/lib/types';
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
import { StaffCard } from '@/components/pengguna/StaffCard';
import { PasswordInput } from '@/components/ui/password-input';

type StaffRole = 'cashier' | 'outlet_manager' | 'kitchen_staff' | 'waiter' | 'manager';

type Cashier = {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  phone?: string | null;
  outlet_id?: string | null;
  has_pin?: boolean;
};

type Outlet = { id: string; name: string };

type AttendanceToday = { user_id: string; status: 'hadir' | 'telat' | 'alpha' };

// Pill-select posisi (PRD): Kasir/Dapur/Waiter/Manager. outlet_manager tetap ada di backend
// tapi tidak ditawarkan sebagai pilihan baru di form — dipertahankan hanya untuk staf existing.
const POSITION_OPTIONS: { value: StaffRole; label: string }[] = [
  { value: 'cashier', label: 'Kasir' },
  { value: 'kitchen_staff', label: 'Dapur' },
  { value: 'waiter', label: 'Waiter' },
  { value: 'manager', label: 'Manajer' },
];

function avatarColor(name: string) {
  const colors = ['#6e150f', '#8a2015', '#5fa876', '#d0a139', '#4a5b8a'];
  const idx = name.charCodeAt(0) % colors.length;
  return colors[idx];
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function PelangganPage() {
  const [tab, setTab] = useState<'pelanggan' | 'staf'>('pelanggan');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [attendanceToday, setAttendanceToday] = useState<AttendanceToday[]>([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Customer | 'new' | null>(null);
  const [removing, setRemoving] = useState<Customer | null>(null);
  const [detail, setDetail] = useState<Customer | null>(null);
  const [addingCashier, setAddingCashier] = useState(false);
  const [resetting, setResetting] = useState<Cashier | null>(null);
  const [settingPin, setSettingPin] = useState<Cashier | null>(null);
  const [removingCashier, setRemovingCashier] = useState<Cashier | null>(null);
  const [error, setError] = useState('');

  async function reloadCustomers(q = '') {
    const res = await apiFetch(`/api/v1/tenants/customers${q ? `?search=${encodeURIComponent(q)}` : ''}`);
    setCustomers(res.data);
  }
  async function reloadCashiers() {
    const res = await apiFetch('/api/v1/tenants/users');
    setCashiers(res.data);
  }

  useEffect(() => {
    reloadCustomers().catch((e) => setError(e.message));
    reloadCashiers().catch(() => {});
    // Outlet dan absensi bersifat pelengkap (multi_outlet/absensi mungkin tidak aktif untuk tenant
    // ini) — gagal diam-diam saja, jangan blok halaman kelola staf.
    apiFetch('/api/v1/tenants/branches').then((res) => setOutlets(res.data)).catch(() => {});
    apiFetch(`/api/v1/tenants/attendance?date=${todayStr()}`).then((res) => setAttendanceToday(res.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => reloadCustomers(search).catch((e) => setError(e.message)), 300);
    return () => clearTimeout(t);
  }, [search]);

  async function removeCustomer(c: Customer) {
    await apiFetch(`/api/v1/tenants/customers/${c.id}`, { method: 'DELETE' });
    setRemoving(null);
    await reloadCustomers(search);
  }
  async function toggleCashierActive(c: Cashier) {
    await apiFetch(`/api/v1/tenants/users/${c.id}/deactivate`, { method: 'PATCH' });
    await reloadCashiers();
  }
  async function removeCashier(c: Cashier) {
    await apiFetch(`/api/v1/tenants/users/${c.id}`, { method: 'DELETE' });
    setRemovingCashier(null);
    await reloadCashiers();
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--ink)]">Pelanggan</h1>
        {tab === 'pelanggan' ? (
          <Button size="sm" onClick={() => setEditing('new')}>+ Pelanggan</Button>
        ) : (
          <Button size="sm" onClick={() => setAddingCashier(true)}>+ Kasir</Button>
        )}
      </div>

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setTab('pelanggan')}
          className={`h-10 rounded-full px-4 text-sm font-medium ${tab === 'pelanggan' ? 'bg-[var(--nav-active)] text-[var(--nav-active-ink)]' : 'border border-[var(--border)] text-[var(--ink)]'}`}
        >
          Pelanggan
        </button>
        <button
          onClick={() => setTab('staf')}
          className={`h-10 rounded-full px-4 text-sm font-medium ${tab === 'staf' ? 'bg-[var(--nav-active)] text-[var(--nav-active-ink)]' : 'border border-[var(--border)] text-[var(--ink)]'}`}
        >
          Kelola Staf ({cashiers.length})
        </button>
      </div>

      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      {tab === 'pelanggan' ? (
        <>
          <Input type="search" placeholder="Cari nama atau no HP..." value={search} onChange={(e) => setSearch(e.target.value)} className="mb-5" />
          {customers.length === 0 ? (
            <EmptyState>{search ? 'Tidak ada pelanggan yang cocok.' : 'Belum ada pelanggan tercatat.'}</EmptyState>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {customers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setDetail(c)}
                  className="flex flex-col items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-center active:scale-95"
                >
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold text-white"
                    style={{ backgroundColor: avatarColor(c.name) }}
                  >
                    {c.name.slice(0, 2).toUpperCase()}
                  </div>
                  <p className="truncate text-sm font-semibold text-[var(--ink)]">{c.name}</p>
                  <p className="truncate text-xs text-[var(--muted)]">{c.phone || 'Tanpa no HP'}</p>
                </button>
              ))}
              <button
                onClick={() => setEditing('new')}
                className="flex flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-[var(--border)] p-4 text-sm text-[var(--muted)] active:scale-95"
              >
                <span className="text-xl">+</span> Tambah baru
              </button>
            </div>
          )}
        </>
      ) : cashiers.length === 0 ? (
        <EmptyState>Belum ada kasir. Klik + Kasir untuk menambah.</EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {cashiers.map((c) => {
            const outletName = c.outlet_id ? outlets.find((o) => o.id === c.outlet_id)?.name : null;
            const today = attendanceToday.find((a) => a.user_id === c.id);
            const attendanceStatus = today ? (today.status === 'alpha' ? undefined : today.status) : c.is_active ? 'belum' : undefined;
            return (
              <StaffCard
                key={c.id}
                cashier={c}
                outletName={outletName}
                attendanceStatus={attendanceStatus}
                onResetPassword={() => setResetting(c)}
                onSetPin={() => setSettingPin(c)}
                onToggleActive={() => toggleCashierActive(c)}
                onDelete={() => setRemovingCashier(c)}
              />
            );
          })}
        </div>
      )}

      {editing && (
        <CustomerForm
          customer={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await reloadCustomers(search); }}
        />
      )}

      {detail && <CustomerDetailModal customer={detail} onClose={() => setDetail(null)} />}

      <AlertDialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus pelanggan?</AlertDialogTitle>
            <AlertDialogDescription>Data pelanggan &ldquo;{removing?.name}&rdquo; akan dihapus permanen.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => removing && removeCustomer(removing)}>Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {addingCashier && (
        <CashierForm outlets={outlets} onClose={() => setAddingCashier(false)} onSaved={async () => { setAddingCashier(false); await reloadCashiers(); }} />
      )}
      {resetting && <ResetPasswordForm cashier={resetting} onClose={() => setResetting(null)} />}
      {settingPin && (
        <PinForm cashier={settingPin} onClose={() => setSettingPin(null)} onSaved={async () => { setSettingPin(null); await reloadCashiers(); }} />
      )}

      <AlertDialog open={!!removingCashier} onOpenChange={(open) => !open && setRemovingCashier(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus kasir?</AlertDialogTitle>
            <AlertDialogDescription>Akun &ldquo;{removingCashier?.name}&rdquo; akan dihapus permanen dan tidak bisa login lagi.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => removingCashier && removeCashier(removingCashier)}>Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function CustomerForm({ customer, onClose, onSaved }: { customer: Customer | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(customer?.name ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = { name, phone: phone || null };
      if (customer) {
        await apiFetch(`/api/v1/tenants/customers/${customer.id}`, { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await apiFetch('/api/v1/tenants/customers', { method: 'POST', body: JSON.stringify(body) });
      }
      onSaved();
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <Modal title={customer ? 'Ubah Pelanggan' : 'Tambah Pelanggan'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nama"><Input required autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="No HP" hint="Opsional"><Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">Batal</Button>
          <Button type="submit" disabled={saving} className="flex-1">{saving ? 'Menyimpan...' : 'Simpan'}</Button>
        </div>
      </form>
    </Modal>
  );
}

type CustomerDetail = {
  customer: Customer;
  total_spend: number;
  visit_count: number;
  favorite_menu: { product_name: string; order_count: number }[];
  recent_orders: { id: string; created_at: string; total: number; payment_method: string; item_summary: string }[];
};

function CustomerDetailModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const [detail, setDetail] = useState<CustomerDetail | null>(null);

  useEffect(() => {
    apiFetch(`/api/v1/tenants/customers/${customer.id}/detail`).then(setDetail).catch(() => setDetail(null));
  }, [customer.id]);

  return (
    <Modal title={customer.name} onClose={onClose}>
      {!detail ? (
        <p className="py-8 text-center text-sm text-[var(--muted)]">Memuat...</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-[var(--surface-2)] p-3">
              <p className="text-xs text-[var(--muted)]">Total belanja</p>
              <p className="text-lg font-bold tabular-nums text-[var(--ink)]">Rp {detail.total_spend.toLocaleString('id-ID')}</p>
            </div>
            <div className="rounded-xl bg-[var(--surface-2)] p-3">
              <p className="text-xs text-[var(--muted)]">Kunjungan</p>
              <p className="text-lg font-bold tabular-nums text-[var(--ink)]">{detail.visit_count}×</p>
            </div>
          </div>

          {detail.favorite_menu.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-[var(--ink)]">Menu Favorit</h3>
              <ul className="space-y-1">
                {detail.favorite_menu.map((m, i) => (
                  <li key={i} className="flex justify-between text-sm">
                    <span className="text-[var(--ink)]">{m.product_name}</span>
                    <span className="text-[var(--muted)]">{m.order_count}×</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h3 className="mb-2 text-sm font-semibold text-[var(--ink)]">Riwayat Transaksi</h3>
            {detail.recent_orders.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">Belum ada transaksi.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {detail.recent_orders.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-[var(--ink)]">{o.item_summary}</p>
                      <p className="text-xs text-[var(--muted)]">{new Date(o.created_at).toLocaleDateString('id-ID')} · {o.payment_method}</p>
                    </div>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--ink)]">Rp {o.total.toLocaleString('id-ID')}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function CashierForm({ outlets, onClose, onSaved }: { outlets: Outlet[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<StaffRole>('cashier');
  const [outletId, setOutletId] = useState<string>('');
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiFetch('/api/v1/tenants/users', {
        method: 'POST',
        body: JSON.stringify({
          name,
          email,
          password,
          role,
          phone: phone || undefined,
          outlet_id: outletId || undefined,
          pin: pin || undefined,
        }),
      });
      onSaved();
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <Modal title="Tambah Staf" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nama karyawan"><Input required autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Email untuk login"><Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="No. HP" hint="Opsional"><Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>

        <Field label="Posisi">
          <div className="flex flex-wrap gap-2">
            {POSITION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRole(opt.value)}
                className={`h-10 rounded-full px-4 text-sm font-medium ${role === opt.value ? 'bg-[var(--nav-active)] text-[var(--nav-active-ink)]' : 'border border-[var(--border)] text-[var(--ink)]'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Field>

        {outlets.length > 0 && (
          <Field label="Cabang" hint="Opsional — kosongkan kalau belum ditentukan">
            <Select value={outletId} onValueChange={setOutletId}>
              <SelectTrigger><SelectValue placeholder="Pilih cabang" /></SelectTrigger>
              <SelectContent>
                {outlets.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        <Field label="Password awal" hint="Bisa diganti nanti lewat Reset Password."><PasswordInput required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></Field>

        <Field label="PIN 4 digit" hint="Opsional — untuk login cepat di POS. Bisa diatur belakangan lewat tombol Ubah PIN.">
          <Input
            inputMode="numeric"
            maxLength={4}
            placeholder="••••"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
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

function ResetPasswordForm({ cashier, onClose }: { cashier: Cashier; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/api/v1/tenants/users/${cashier.id}/reset-password`, { method: 'PATCH', body: JSON.stringify({ password }) });
      setDone(true);
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <Modal title={`Reset Password — ${cashier.name}`} onClose={onClose}>
      {done ? (
        <div className="space-y-4">
          <p className="text-sm text-[var(--ink)]">Password baru untuk <strong>{cashier.name}</strong> berhasil disimpan. Sampaikan password ini langsung ke kasirnya.</p>
          <Button onClick={onClose} className="w-full">Selesai</Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Password baru" hint="Minimal 6 karakter. Kasir bisa dipakai login lagi setelah ini."><PasswordInput required minLength={6} autoFocus value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Batal</Button>
            <Button type="submit" disabled={saving} className="flex-1">{saving ? 'Menyimpan...' : 'Simpan password baru'}</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function PinForm({ cashier, onClose, onSaved }: { cashier: Cashier; onClose: () => void; onSaved: () => void }) {
  const [pin, setPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/api/v1/tenants/users/${cashier.id}/pin`, { method: 'PATCH', body: JSON.stringify({ pin }) });
      onSaved();
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <Modal title={`Ubah PIN — ${cashier.name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="PIN baru" hint="4 digit angka, dipakai untuk login cepat di POS/kiosk absensi.">
          <Input
            required
            autoFocus
            inputMode="numeric"
            maxLength={4}
            pattern="\d{4}"
            placeholder="••••"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
          />
        </Field>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">Batal</Button>
          <Button type="submit" disabled={saving || pin.length !== 4} className="flex-1">{saving ? 'Menyimpan...' : 'Simpan PIN'}</Button>
        </div>
      </form>
    </Modal>
  );
}
