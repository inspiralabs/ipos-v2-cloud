'use client';

import { useEffect, useState } from 'react';
import { LogIn, LogOut, CheckCircle2, XCircle } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { Avatar } from '@/components/Avatar';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';

type StaffUser = { id: string; name: string; role: string; is_active: boolean };

const ROLE_LABEL: Record<string, string> = {
  cashier: 'Kasir',
  outlet_manager: 'Manajer Cabang',
  kitchen_staff: 'Dapur',
  waiter: 'Waiter',
  manager: 'Manajer',
};

export default function ClockInKioskPage() {
  const [staff, setStaff] = useState<StaffUser[] | null>(null);
  const [selected, setSelected] = useState<StaffUser | null>(null);
  const [submitting, setSubmitting] = useState<'in' | 'out' | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    apiFetch('/api/v1/tenants/users')
      .then((res) => setStaff((res.data as StaffUser[]).filter((u) => u.is_active)))
      .catch(() => setStaff([]));
  }, []);

  async function submit(action: 'in' | 'out') {
    if (!selected) return;
    setSubmitting(action);
    setFeedback(null);
    try {
      await apiFetch(`/api/v1/tenants/attendance/clock-${action}`, {
        method: 'POST',
        body: JSON.stringify({ user_id: selected.id }),
      });
      setFeedback({
        type: 'success',
        message: action === 'in' ? `${selected.name} berhasil absen masuk.` : `${selected.name} berhasil absen keluar.`,
      });
      setSelected(null);
    } catch (e: any) {
      const message =
        e.status === 409
          ? 'Sudah absen masuk hari ini.'
          : e.status === 404
          ? 'Belum absen masuk hari ini, tidak bisa absen keluar.'
          : e.message || 'Gagal mencatat absensi.';
      setFeedback({ type: 'error', message });
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-[var(--ink)]">Absen Masuk / Keluar</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Pilih nama kamu, lalu tekan tombol absen.</p>
      </div>

      {feedback && (
        <div
          className={`flex items-center gap-3 rounded-2xl p-4 text-base font-semibold ${
            feedback.type === 'success' ? 'bg-[#eaf5ee] text-[#2f7a4d]' : 'bg-[#fbe9e7] text-[#b23b2e]'
          }`}
        >
          {feedback.type === 'success' ? <CheckCircle2 className="h-6 w-6 shrink-0" /> : <XCircle className="h-6 w-6 shrink-0" />}
          {feedback.message}
        </div>
      )}

      {!staff ? (
        <Skeleton className="h-64 w-full" />
      ) : staff.length === 0 ? (
        <EmptyState>Belum ada staf aktif.</EmptyState>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {staff.map((u) => {
            const active = selected?.id === u.id;
            return (
              <button
                key={u.id}
                onClick={() => { setSelected(u); setFeedback(null); }}
                className={`flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-2xl border p-4 text-center transition-colors active:scale-95 ${
                  active ? 'border-[var(--primary)] bg-[var(--primary)]/10' : 'border-[var(--border)] bg-[var(--surface)]'
                }`}
              >
                <Avatar name={u.name} size="md" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--ink)]">{u.name}</p>
                  <p className="truncate text-xs text-[var(--muted)]">{ROLE_LABEL[u.role] ?? u.role}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <div className="sticky bottom-4 flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-lg sm:flex-row">
          <p className="flex-1 self-center text-center text-base font-semibold text-[var(--ink)] sm:text-left">
            {selected.name}
          </p>
          <div className="flex gap-3">
            <Button
              size="lg"
              className="flex-1"
              disabled={submitting !== null}
              onClick={() => submit('in')}
            >
              <LogIn className="h-5 w-5" /> {submitting === 'in' ? 'Memproses...' : 'Absen Masuk'}
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="flex-1"
              disabled={submitting !== null}
              onClick={() => submit('out')}
            >
              <LogOut className="h-5 w-5" /> {submitting === 'out' ? 'Memproses...' : 'Absen Keluar'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
