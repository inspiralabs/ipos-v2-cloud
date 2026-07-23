'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '../../components/ui/button';
import { Field } from '../../components/ui/field';
import { PasswordInput } from '../../components/ui/password-input';

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get('token');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const mismatch = confirm.length > 0 && password !== confirm;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mismatch || !token) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/v1/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mengatur ulang password');
      setDone(true);
      setTimeout(() => router.push('/login'), 2000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-[var(--ink)]">Atur password baru</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Minimal 6 karakter, pastikan mudah kamu ingat.</p>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
          {!token ? (
            <p className="text-sm text-red-500">Link reset tidak valid. Minta link baru lewat halaman lupa password.</p>
          ) : done ? (
            <p className="text-sm text-[var(--ink)]">Password berhasil diganti. Mengarahkan ke halaman masuk...</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Password baru">
                <PasswordInput
                  required minLength={6} autoFocus autoComplete="new-password"
                  value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan password baru"
                />
              </Field>
              <Field label="Ulangi password baru">
                <PasswordInput
                  required minLength={6} autoComplete="new-password"
                  value={confirm} onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Ketik ulang password baru"
                />
                {mismatch && <p className="mt-1 text-xs text-red-500">Password tidak sama.</p>}
              </Field>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button type="submit" disabled={loading || mismatch || !password} className="w-full">
                {loading ? 'Menyimpan...' : 'Simpan password baru'}
              </Button>
            </form>
          )}
          {!done && (
            <Link href="/login" className="mt-4 block text-center text-sm font-medium text-[var(--muted)] hover:text-[var(--ink)]">
              Kembali ke halaman masuk
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
