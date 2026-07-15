'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { apiFetch, clearToken, getToken } from '@/lib/auth';
import { ThemeToggle } from '@/components/ThemeToggle';
import { StaffCard } from '@/components/pengguna/StaffCard';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { PasswordInput } from '@/components/ui/password-input';

type Cashier = { id: string; name: string; email: string; role: string; is_active: boolean };

export default function KasirPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [adding, setAdding] = useState(false);
  const [resetting, setResetting] = useState<Cashier | null>(null);
  const [removing, setRemoving] = useState<Cashier | null>(null);

  async function reload() {
    const res = await apiFetch('/api/v1/tenants/users');
    setCashiers(res.data);
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

  async function toggleActive(c: Cashier) {
    await apiFetch(`/api/v1/tenants/users/${c.id}/deactivate`, { method: 'PATCH' });
    await reload();
  }

  async function remove(c: Cashier) {
    await apiFetch(`/api/v1/tenants/users/${c.id}`, { method: 'DELETE' });
    setRemoving(null);
    await reload();
  }

  if (loading) {
    return <main className="flex min-h-dvh items-center justify-center text-[var(--muted)]">Memuat...</main>;
  }

  return (
    <main className="min-h-dvh bg-[var(--bg)]">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/')} aria-label="Kembali ke dashboard">
            ←
          </Button>
          <h1 className="text-lg font-bold text-[var(--ink)]">Kasir</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => setAdding(true)}>+ Kasir</Button>
          <ThemeToggle />
        </div>
      </header>

      {error && (
        <div className="border-b border-[var(--border)] bg-red-500/10 px-4 py-2 text-sm text-red-500 sm:px-6">{error}</div>
      )}

      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {cashiers.length === 0 ? (
          <EmptyState>Belum ada kasir. Klik + Kasir untuk menambah.</EmptyState>
        ) : (
          <motion.div
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.03 } } }}
          >
            {cashiers.map((c) => (
              <motion.div key={c.id} variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 } }}>
                <StaffCard
                  cashier={c}
                  onResetPassword={() => setResetting(c)}
                  onToggleActive={() => toggleActive(c)}
                  onDelete={() => setRemoving(c)}
                />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {adding && (
        <CashierForm
          onClose={() => setAdding(false)}
          onSaved={async () => {
            setAdding(false);
            await reload();
          }}
        />
      )}

      {resetting && (
        <ResetPasswordForm cashier={resetting} onClose={() => setResetting(null)} />
      )}

      <AlertDialog open={!!removing} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus kasir?</AlertDialogTitle>
            <AlertDialogDescription>
              Akun &ldquo;{removing?.name}&rdquo; akan dihapus permanen dan tidak bisa login lagi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => removing && remove(removing)}>Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

function CashierForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await apiFetch('/api/v1/tenants/users', {
        method: 'POST',
        body: JSON.stringify({ name, email, password, role: 'cashier' }),
      });
      onSaved();
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <Modal title="Tambah Kasir" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nama karyawan">
          <Input required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email untuk login">
          <Input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password awal" hint="Bisa diganti nanti lewat Reset Password.">
          <PasswordInput required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <div className="flex gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onClose} className="flex-1">Batal</Button>
          <Button type="submit" disabled={saving} className="flex-1">
            {saving ? 'Menyimpan...' : 'Simpan'}
          </Button>
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
      await apiFetch(`/api/v1/tenants/users/${cashier.id}/reset-password`, {
        method: 'PATCH',
        body: JSON.stringify({ password }),
      });
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
          <p className="text-sm text-[var(--ink)]">
            Password baru untuk <strong>{cashier.name}</strong> berhasil disimpan. Sampaikan password ini langsung ke kasirnya.
          </p>
          <Button onClick={onClose} className="w-full">Selesai</Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Password baru" hint="Minimal 6 karakter. Kasir bisa dipakai login lagi setelah ini.">
            <PasswordInput required minLength={6} autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Batal</Button>
            <Button type="submit" disabled={saving} className="flex-1">
              {saving ? 'Menyimpan...' : 'Simpan password baru'}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
