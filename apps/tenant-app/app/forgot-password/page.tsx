'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '../../components/ThemeToggle';
import { Button } from '../../components/ui/button';
import { Field } from '../../components/ui/field';
import { Input } from '../../components/ui/input';

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/v1/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fd.get('email') }),
      });
      if (!res.ok) throw new Error('Gagal mengirim email. Coba lagi sebentar.');
      setSent(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-[var(--ink)]">Lupa password?</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Masukkan email akun tokomu, kami kirimkan link buat atur ulang password.</p>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
          {sent ? (
            <div className="text-center">
              <p className="text-sm text-[var(--ink)]">
                Kalau email itu terdaftar, link reset password sudah kami kirim. Cek inbox (atau folder spam) kamu.
              </p>
              <Link href="/login" className="mt-4 inline-block text-sm font-medium text-[var(--primary)] hover:underline">
                Kembali ke halaman masuk
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Email">
                <Input
                  id="email" name="email" type="email" required autoFocus
                  autoComplete="email" placeholder="nama@email.com"
                />
              </Field>
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Mengirim...' : 'Kirim link reset'}
              </Button>
              <Link href="/login" className="block text-center text-sm font-medium text-[var(--muted)] hover:text-[var(--ink)]">
                Kembali ke halaman masuk
              </Link>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
