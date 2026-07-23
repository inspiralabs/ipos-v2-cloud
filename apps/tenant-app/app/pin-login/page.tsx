'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Delete } from 'lucide-react';
import { setToken } from '@/lib/auth';
import { Avatar } from '@/components/Avatar';
import { Skeleton } from '@/components/ui/skeleton';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

type PinStaff = { id: string; name: string; role: string };

const ROLE_LABEL: Record<string, string> = {
  cashier: 'Kasir',
  outlet_manager: 'Manajer Cabang',
  kitchen_staff: 'Dapur',
  waiter: 'Waiter',
  manager: 'Manajer',
};

export default function PinLoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tenantId = searchParams.get('tenant');

  const [staff, setStaff] = useState<PinStaff[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState<PinStaff | null>(null);
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!tenantId) return;
    fetch(`${API_URL}/api/v1/auth/pin-login/staff?tenant_id=${encodeURIComponent(tenantId)}`)
      .then((res) => {
        if (!res.ok) throw new Error('Gagal memuat daftar staf');
        return res.json();
      })
      .then((data) => setStaff(data.data))
      .catch((e) => setLoadError(e.message));
  }, [tenantId]);

  async function submitPin(nextPin: string) {
    if (!selected || !tenantId) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/pin-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId, user_id: selected.id, pin: nextPin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'PIN salah');
      setToken(data.access_token);
      router.push('/');
    } catch (e: any) {
      setError(e.message || 'PIN salah');
      setPin('');
    } finally {
      setSubmitting(false);
    }
  }

  function pressDigit(d: string) {
    if (submitting) return;
    setError('');
    setPin((prev) => {
      if (prev.length >= 4) return prev;
      const next = prev + d;
      if (next.length === 4) submitPin(next);
      return next;
    });
  }

  function backspace() {
    if (submitting) return;
    setError('');
    setPin((prev) => prev.slice(0, -1));
  }

  if (!tenantId) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[var(--bg)] px-6 text-center">
        <h1 className="text-xl font-bold text-[var(--ink)]">Tenant tidak diketahui</h1>
        <p className="max-w-sm text-sm text-[var(--muted)]">
          Halaman ini butuh tautan resmi dari aplikasi (misalnya tombol &ldquo;Ganti Kasir&rdquo;). Silakan kembali ke halaman login.
        </p>
        <Link href="/login" className="text-sm font-semibold text-[var(--primary)] hover:underline">
          ‹ Kembali ke Login
        </Link>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[var(--bg)] px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-[34px] w-[34px] items-center justify-center rounded-[10px] bg-[var(--primary)] font-serif text-sm font-bold text-white">
            IP
          </div>
          <h1 className="text-lg font-bold text-[var(--ink)]">
            {selected ? `Halo, ${selected.name}` : 'Ganti Kasir'}
          </h1>
          <p className="text-sm text-[var(--muted)]">
            {selected ? 'Masukkan PIN 4 digit kamu' : 'Pilih nama untuk masuk cepat'}
          </p>
        </div>

        {!selected ? (
          <>
            {loadError && <p className="mb-3 text-center text-sm text-red-500">{loadError}</p>}
            {!staff ? (
              <Skeleton className="h-48 w-full" />
            ) : staff.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--muted)]">Belum ada staf dengan PIN aktif.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {staff.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { setSelected(s); setPin(''); setError(''); }}
                    className="flex min-h-[110px] flex-col items-center justify-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-center active:scale-95"
                  >
                    <Avatar name={s.name} size="md" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--ink)]">{s.name}</p>
                      <p className="truncate text-xs text-[var(--muted)]">{ROLE_LABEL[s.role] ?? s.role}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
            <div className="mt-6 text-center">
              <Link href="/login" className="text-sm font-medium text-[var(--primary)] hover:underline">
                Login dengan email &amp; password
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="mb-6 flex justify-center gap-3">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={`h-4 w-4 rounded-full border-2 border-[var(--primary)] ${i < pin.length ? 'bg-[var(--primary)]' : 'bg-transparent'}`}
                />
              ))}
            </div>

            {error && <p className="mb-4 text-center text-sm font-medium text-red-500">{error}</p>}

            <div className="grid grid-cols-3 gap-3">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <button
                  key={d}
                  type="button"
                  disabled={submitting}
                  onClick={() => pressDigit(d)}
                  className="flex h-16 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-2xl font-semibold text-[var(--ink)] active:scale-95 disabled:opacity-50"
                >
                  {d}
                </button>
              ))}
              <button
                type="button"
                onClick={() => { setSelected(null); setPin(''); setError(''); }}
                className="flex h-16 items-center justify-center rounded-2xl text-sm font-semibold text-[var(--muted)] active:scale-95"
              >
                ‹ Bukan saya
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => pressDigit('0')}
                className="flex h-16 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] text-2xl font-semibold text-[var(--ink)] active:scale-95 disabled:opacity-50"
              >
                0
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={backspace}
                aria-label="Hapus"
                className="flex h-16 items-center justify-center rounded-2xl text-[var(--ink)] active:scale-95 disabled:opacity-50"
              >
                <Delete className="h-6 w-6" />
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
