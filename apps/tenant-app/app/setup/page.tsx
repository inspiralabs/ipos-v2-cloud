'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, clearToken, getToken } from '../../lib/auth';
import { formatRupiah, formatThousands, parseThousands } from '../../lib/format';
import type { Category, Menu } from '../../lib/types';
import { ThemeToggle } from '../../components/ThemeToggle';
import { ThemeColorPicker } from '../../components/ThemeColorPicker';
import { applyThemeColor, setThemeColor, DEFAULT_THEME_HUE } from '../../hooks/useThemeColor';
import { Button } from '../../components/ui/button';
import { Field } from '../../components/ui/field';
import { Input } from '../../components/ui/input';
import { PasswordInput } from '../../components/ui/password-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';

const STEPS = ['Tentang Toko', 'Daftar Menu', 'Tim Kasir', 'Cara Bayar', 'Cetak Struk'] as const;

export default function SetupWizardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [storeName, setStoreName] = useState('');

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    apiFetch('/api/v1/tenants/me')
      .then(() => setLoading(false))
      .catch((e) => {
        if (e.status === 401) {
          clearToken();
          router.replace('/login');
        } else {
          setError(e.message);
          setLoading(false);
        }
      });
  }, [router]);

  async function finishSetup() {
    try {
      await apiFetch('/api/v1/tenants/me', { method: 'PATCH', body: JSON.stringify({ setup_completed: true }) });
      router.push('/');
    } catch (e: any) {
      setError(e.message);
    }
  }

  if (loading) {
    return <main className="flex min-h-dvh items-center justify-center text-sm text-[var(--muted)]">Sebentar ya, lagi disiapin...</main>;
  }

  return (
    <main className="min-h-dvh bg-[var(--bg)]">
      <header className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--surface)]/90 px-4 py-4 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-[var(--ink)]">Yuk, siapkan tokomu</h1>
            <p className="text-xs text-[var(--muted)]">Langkah {step + 1} dari {STEPS.length} · {STEPS[step]}</p>
          </div>
          <ThemeToggle />
        </div>
        <div className="mx-auto mt-3 max-w-2xl">
          <StepIndicator step={step} />
        </div>
      </header>

      {error && (
        <div className="border-b border-[var(--border)] bg-red-500/10 px-4 py-2 text-sm text-red-500 sm:px-6">{error}</div>
      )}

      <div className="mx-auto max-w-2xl px-4 py-6 sm:py-8 sm:px-6">
        {step === 0 && <ProfileStep name={storeName} onNameChange={setStoreName} onNext={() => setStep(1)} />}
        {step === 1 && <MenuStep onNext={() => setStep(2)} onBack={() => setStep(0)} />}
        {step === 2 && <CashierStep onNext={() => setStep(3)} onBack={() => setStep(1)} />}
        {step === 3 && <PaymentStep onNext={() => setStep(4)} onBack={() => setStep(2)} />}
        {step === 4 && <PrinterStep storeName={storeName} onFinish={finishSetup} onBack={() => setStep(3)} />}
      </div>
    </main>
  );
}

function StepIndicator({ step }: { step: number }) {
  return (
    <ol className="flex gap-1.5">
      {STEPS.map((label, i) => (
        <li key={label} className="flex-1">
          <div
            aria-label={label}
            className={`h-1.5 rounded-full transition-colors ${i <= step ? 'bg-[var(--primary)]' : 'bg-[var(--surface-2)]'}`}
          />
        </li>
      ))}
    </ol>
  );
}

function WizardCard({
  icon, title, subtitle, children,
}: { icon: React.ReactNode; title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-7">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary)]">
          {icon}
        </div>
        <div>
          <h2 className="text-lg font-bold text-[var(--ink)]">{title}</h2>
          <p className="text-sm text-[var(--muted)]">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function NextButton({ label = 'Lanjut', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label?: string }) {
  return (
    <Button {...props} className="w-full flex-1">
      {label}
    </Button>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button type="button" variant="ghost" onClick={onClick}>
      Kembali
    </Button>
  );
}

// ── Ikon step (SVG inline, bukan emoji) ──────────────────────────────────

function StoreIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l1.5-5h15L21 9" /><path d="M3 9h18v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9Z" /><path d="M9 20v-6h6v6" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  );
}

function TeamIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="7" r="3" /><path d="M2 21v-1a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v1" />
      <circle cx="17" cy="6" r="2.5" /><path d="M20.5 21v-1a5 5 0 0 0-3-4.6" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 7a2 2 0 0 1 2-2h13a1 1 0 0 1 1 1v2" /><path d="M3 7v10a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2Z" />
      <circle cx="16.5" cy="14" r="1.5" />
    </svg>
  );
}

function PrinterIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9V3h12v6" /><rect x="4" y="9" width="16" height="8" rx="1.5" />
      <path d="M6 14h12v7H6z" />
    </svg>
  );
}

// ── Step 1: Profil Toko ──────────────────────────────────────────────────

function ProfileStep({
  name, onNameChange, onNext,
}: { name: string; onNameChange: (name: string) => void; onNext: () => void }) {
  const [themeHue, setThemeHue] = useState(DEFAULT_THEME_HUE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function previewColor(hue: string) {
    setThemeHue(hue);
    applyThemeColor(hue); // preview langsung, disimpan ke server saat submit
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      // ponytail: zona waktu ikut device (Intl bawaan), tidak perlu tanya user.
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      await apiFetch('/api/v1/tenants/me', { method: 'PATCH', body: JSON.stringify({ name, timezone }) });
      await setThemeColor(themeHue, DEFAULT_THEME_HUE);
      onNext();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <WizardCard icon={<StoreIcon />} title="Kenalan dulu, yuk" subtitle="Nama toko ini akan muncul di struk belanja pelanggan.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nama toko">
          <Input required autoFocus value={name} onChange={(e) => onNameChange(e.target.value)} placeholder="Contoh: Warung Bu Sari" />
        </Field>
        <Field label="Warna toko">
          <ThemeColorPicker value={themeHue} onChange={previewColor} />
        </Field>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <NextButton type="submit" disabled={saving || !name} label={saving ? 'Menyimpan...' : 'Lanjut'} />
      </form>
    </WizardCard>
  );
}

// ── Step 2: Input Menu ───────────────────────────────────────────────────

function MenuStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [menus, setMenus] = useState<Menu[]>([]);
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([apiFetch('/api/v1/catalog/categories'), apiFetch('/api/v1/catalog/menus')]).then(([cats, ms]) => {
      setCategories(cats);
      setMenus(ms);
      if (cats[0]) setCategoryId(cats[0].id);
    });
  }, []);

  async function addCategory() {
    if (!newCategory.trim()) return;
    const row = await apiFetch('/api/v1/catalog/categories', {
      method: 'POST',
      body: JSON.stringify({ name: newCategory.trim(), sort_order: categories.length }),
    });
    setCategories((prev) => [...prev, row]);
    setCategoryId(row.id);
    setNewCategory('');
  }

  async function addMenu(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const row = await apiFetch('/api/v1/catalog/menus', {
        method: 'POST',
        body: JSON.stringify({ name, price: parseInt(price, 10), category_id: categoryId || null }),
      });
      setMenus((prev) => [...prev, row]);
      setName('');
      setPrice('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <WizardCard icon={<MenuIcon />} title="Apa yang kamu jual?" subtitle="Masukin minimal 1 menu dulu, sisanya bisa nyusul kapan aja.">
      <div className="mb-4 flex gap-2">
        <Input
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          placeholder="Bikin kategori (mis. Makanan, Minuman)"
          className="h-10"
        />
        <Button type="button" variant="outline" size="sm" className="h-10 shrink-0" onClick={addCategory}>
          Tambah
        </Button>
      </div>

      <form onSubmit={addMenu} className="mb-4 space-y-3 rounded-xl border border-dashed border-[var(--border)] p-4">
        <div className="flex gap-3">
          <Input
            required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama menu, mis. Nasi Goreng"
            className="flex-1"
          />
          <Input
            required inputMode="numeric" value={formatThousands(price)}
            onChange={(e) => setPrice(parseThousands(e.target.value))}
            placeholder="Harga"
            className="w-28"
          />
        </div>
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
        {error && <p className="text-sm text-red-500">{error}</p>}
        <Button type="submit" disabled={saving} className="w-full">
          Simpan menu ini
        </Button>
      </form>

      {menus.length > 0 && (
        <ul className="mb-6 space-y-2">
          {menus.map((m) => (
            <li key={m.id} className="flex items-center justify-between rounded-lg bg-[var(--surface-2)] px-3 py-2 text-sm">
              <span className="text-[var(--ink)]">{m.name}</span>
              <span className="font-semibold text-[var(--ink)]">{formatRupiah(m.price)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-3">
        <BackButton onClick={onBack} />
        <NextButton onClick={onNext} disabled={menus.length === 0} />
      </div>
    </WizardCard>
  );
}

// ── Step 3: Setup Kasir ──────────────────────────────────────────────────

function CashierStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [cashiers, setCashiers] = useState<{ id: string; name: string; email: string }[]>([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiFetch('/api/v1/tenants/users').then((res) => setCashiers(res.data));
  }, []);

  async function addCashier(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const row = await apiFetch('/api/v1/tenants/users', {
        method: 'POST',
        body: JSON.stringify({ name, email, password, role: 'cashier' }),
      });
      setCashiers((prev) => [...prev, row]);
      setName(''); setEmail(''); setPassword('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <WizardCard icon={<TeamIcon />} title="Ada yang bantu jaga kasir?" subtitle="Kalau ada karyawan, buatkan akunnya di sini. Jualan sendiri? Lewati aja.">
      <form onSubmit={addCashier} className="mb-6 space-y-3 rounded-xl border border-dashed border-[var(--border)] p-4">
        <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama karyawan" />
        <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email untuk login" />
        <PasswordInput
          required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="Password awal (bisa diganti nanti)"
        />
        {error && <p className="text-sm text-red-500">{error}</p>}
        <Button type="submit" disabled={saving} className="w-full">
          Buatkan akun
        </Button>
      </form>

      {cashiers.length > 0 && (
        <ul className="mb-6 space-y-2">
          {cashiers.map((c) => (
            <li key={c.id} className="rounded-lg bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--ink)]">
              {c.name} <span className="text-[var(--muted)]">— {c.email}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-3">
        <BackButton onClick={onBack} />
        <NextButton onClick={onNext} label={cashiers.length ? 'Lanjut' : 'Lewati dulu'} />
      </div>
    </WizardCard>
  );
}

// ── Step 4: Metode Pembayaran ────────────────────────────────────────────
// ponytail: belum ada backend config pembayaran (payment gateway/QRIS upload) — PRD
// sendiri bilang ini opsional & bisa disetel ulang nanti di Pengaturan. Simpan pilihan
// lokal saja dulu, sambungkan ke backend saat modul Pengaturan > Pembayaran digarap.

function PaymentStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const [methods, setMethods] = useState<string[]>(['cash']);

  function toggle(method: string) {
    setMethods((prev) => (prev.includes(method) ? prev.filter((m) => m !== method) : [...prev, method]));
  }

  return (
    <WizardCard icon={<WalletIcon />} title="Pelanggan bayarnya pakai apa?" subtitle="Centang semua yang kamu terima. Bisa diubah lagi kapan saja di Pengaturan.">
      <div className="mb-6 space-y-2">
        {[
          { id: 'cash', label: 'Tunai', hint: 'Bayar langsung di tempat' },
          { id: 'qris', label: 'QRIS', hint: 'Scan barcode dari HP pelanggan' },
          { id: 'transfer', label: 'Transfer Bank', hint: 'Pelanggan transfer ke rekening toko' },
        ].map((m) => {
          const checked = methods.includes(m.id);
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => toggle(m.id)}
              aria-pressed={checked}
              className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                checked
                  ? 'border-[var(--primary)] bg-[var(--primary)]/5'
                  : 'border-[var(--border)] hover:bg-[var(--surface-2)]'
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 ${
                  checked ? 'border-[var(--primary)] bg-[var(--primary)]' : 'border-[var(--border)]'
                }`}
              >
                {checked && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--primary-ink)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
              </span>
              <span>
                <span className="block text-sm font-medium text-[var(--ink)]">{m.label}</span>
                <span className="block text-xs text-[var(--muted)]">{m.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex gap-3">
        <BackButton onClick={onBack} />
        <NextButton onClick={onNext} />
      </div>
    </WizardCard>
  );
}

// ── Step 5: Printer ──────────────────────────────────────────────────────
// ponytail: koneksi printer thermal (Bluetooth/USB) butuh Web Bluetooth/WebUSB —
// di luar cakupan MVP. Langkah ini cuma penanda "bisa disetel nanti", sesuai PRD
// (opsional, skip ke Pengaturan).

function PrinterStep({
  storeName, onFinish, onBack,
}: { storeName: string; onFinish: () => void; onBack: () => void }) {
  return (
    <WizardCard icon={<PrinterIcon />} title="Terakhir, soal cetak struk" subtitle="Sambungkan printer struk sekarang, atau lewati dan atur belakangan.">
      <div className="mb-6 rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">
        Belum sempat sambungkan printer? Tenang, bisa diatur kapan saja lewat menu Pengaturan &gt; Struk.
      </div>
      <div className="mt-4 flex items-center gap-3 rounded-xl bg-[#eaf5ee] p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#5fa876] text-white">✓</div>
        <div>
          <p className="text-sm font-semibold text-[var(--ink)]">Siap Jualan!</p>
          <p className="text-xs text-[var(--muted)]">Struk otomatis tercetak setelah setiap transaksi.</p>
        </div>
      </div>
      <div className="mt-3 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-2)] p-4 text-center font-mono text-[11px] leading-relaxed text-[var(--ink)]">
        <p className="font-bold">{storeName || 'Toko Kamu'}</p>
        <div className="my-2 border-t border-dashed border-[var(--border)]" />
        <p>Contoh Menu x1 &nbsp;&nbsp; 20.000</p>
        <div className="my-2 border-t border-dashed border-[var(--border)]" />
        <p className="font-bold">TOTAL &nbsp; 20.000</p>
      </div>
      <div className="mt-6 flex gap-3">
        <BackButton onClick={onBack} />
        <NextButton onClick={onFinish} label="Selesai, mulai jualan!" />
      </div>
    </WizardCard>
  );
}
