'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { setToken } from '../../lib/auth';
import { ThemeToggle } from '../../components/ThemeToggle';
import { Button } from '../../components/ui/button';
import { Field } from '../../components/ui/field';
import { Input } from '../../components/ui/input';
import { PasswordInput } from '../../components/ui/password-input';

const SALES_TIPS = [
  'Catat tiap transaksi sekecil apa pun — dari situ kamu tahu menu mana yang benar-benar laku.',
  'Menu paling laku belum tentu paling untung. Cek marginnya, bukan cuma jumlah terjualnya.',
  'Jam sibuk kelihatan dari laporan, bukan dari feeling. Siapkan stok sebelum antrian mengular.',
  'Pelanggan yang balik lagi lebih murah dari pelanggan baru. Catat siapa yang sering beli.',
];

const TIP_INTERVAL_MS = 6000;

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setTipIndex((i) => (i + 1) % SALES_TIPS.length);
    }, TIP_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: fd.get('email'), password: fd.get('password') }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login gagal');
      setToken(data.access_token);
      router.push('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-dvh grid-cols-1 lg:grid-cols-2">
      <div className="relative flex flex-col justify-center px-6 py-12 sm:px-12 lg:px-16">
        <div className="absolute right-4 top-4">
          <ThemeToggle />
        </div>
        <div className="mx-auto w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2">
            <div className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-[var(--primary)] font-serif text-sm font-bold text-white">
              IP
            </div>
            <span className="text-sm font-bold text-[var(--ink)]">Inspira POS</span>
          </div>
          <h1 className="mb-1 text-[26px] font-bold text-[var(--ink)] sm:text-[30px]">Selamat datang kembali</h1>
          <p className="mb-6 text-sm text-[var(--muted)]">Masuk untuk lanjut jualan hari ini.</p>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <Field label="Email">
                <Input
                  id="email" name="email" type="email" required autoFocus
                  autoComplete="email" placeholder="nama@email.com"
                />
              </Field>
              <Field label="Password">
                <PasswordInput
                  id="password" name="password" required autoComplete="current-password"
                  placeholder="Masukkan password"
                />
              </Field>
              <div className="text-right">
                <Link href="/forgot-password" className="text-sm font-medium text-[var(--primary)] hover:underline">
                  Lupa password?
                </Link>
              </div>
              {error && (
                <div className="mb-4 rounded-xl bg-[#fbe9e7] px-4 py-3 text-sm text-[#b23b2e]">
                  {error}
                </div>
              )}
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? 'Masuk...' : 'Masuk'}
              </Button>
            </form>
          </div>

          <p className="mt-6 text-center text-sm text-[var(--muted)]">
            Belum punya akun?{' '}
            <a href="#" className="font-semibold text-[var(--primary)]">Coba gratis 14 hari</a>
          </p>
        </div>
      </div>
      <div
        className="relative hidden overflow-hidden bg-cover bg-center lg:block"
        style={{ backgroundImage: "url('https://assets.inspirapos.biz.id/hero-images/hero-login-ipos-cloud.webp')" }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <div className="absolute bottom-8 left-8 right-8">
          <div className="max-w-[300px] rounded-2xl bg-white p-5 shadow-[0_20px_40px_rgba(0,0,0,.35)]">
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--accent)]">Tip Sukses Jualan</p>
            <p key={tipIndex} className="animate-tip-fade text-sm leading-relaxed text-[#1a1a1a]">
              &ldquo;{SALES_TIPS[tipIndex]}&rdquo;
            </p>
          </div>
          <div className="mt-4 flex gap-1.5">
            {SALES_TIPS.map((_, i) => (
              <span
                key={i}
                className="h-1 rounded-full transition-all duration-300"
                style={{
                  width: i === tipIndex ? 18 : 6,
                  background: i === tipIndex ? 'var(--accent)' : 'rgba(255,255,255,.35)',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
