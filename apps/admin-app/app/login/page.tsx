'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Building2 } from 'lucide-react';
import { useAuthStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { ThemeToggle } from '@/components/ThemeToggle';

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      let res: Response;
      try {
        res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/login`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: fd.get('email'), password: fd.get('password'), admin_only: true }),
        });
      } catch {
        throw new Error('Tidak bisa terhubung ke server. Periksa koneksi internet kamu.');
      }
      if (!res.headers.get('content-type')?.includes('application/json')) {
        throw new Error(res.ok ? 'Server tidak merespons dengan benar. Coba lagi beberapa saat lagi.' : `Server bermasalah (${res.status}). Coba lagi beberapa saat lagi.`);
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Email atau password salah.');
      setAuth(data.access_token, data.user);
      toast.success(`Selamat datang, ${data.user.name}.`);
      router.push('/licenses');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--primary)]">
            <Building2 className="h-7 w-7 text-[var(--primary-ink)]" aria-hidden />
          </div>
          <h1 className="font-display text-2xl font-bold text-[var(--ink)]">Inspira POS</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Admin Panel — masuk untuk melanjutkan</p>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required autoFocus placeholder="admin@inspiralabs.id" />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <PasswordInput id="password" name="password" required placeholder="••••••••" />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Masuk...' : 'Masuk ke Dashboard'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
