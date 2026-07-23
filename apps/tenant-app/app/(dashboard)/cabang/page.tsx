'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { Plus } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { formatRupiah } from '@/lib/format';
import { useTenant } from '@/components/layout/TenantContext';
import { PlanGate } from '@/components/PlanGate';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Skeleton } from '@/components/ui/skeleton';

type Outlet = { id: string; name: string; address: string | null; phone: string | null; is_active: boolean };
type Transfer = { id: string; status: 'pending' | 'approved' | 'rejected' };
type TimeseriesPoint = { bucket: string; omzet: number };

function CabangDashboard() {
  const { tenant } = useTenant();
  const [outlets, setOutlets] = useState<Outlet[] | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [chart, setChart] = useState<TimeseriesPoint[]>([]);
  const [adding, setAdding] = useState(false);

  function reload() {
    apiFetch('/api/v1/tenants/branches').then((res) => setOutlets(res)).catch(() => setOutlets([]));
    apiFetch('/api/v1/tenants/transfers')
      .then((res: Transfer[]) => setPendingCount(res.filter((t) => t.status === 'pending').length))
      .catch(() => {});
    const to = new Date();
    const from = new Date(to.getTime() - 6 * 86400000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    apiFetch(`/api/v1/reports/timeseries?from=${fmt(from)}&to=${fmt(to)}&granularity=day`)
      .then(setChart)
      .catch(() => setChart([]));
  }

  useEffect(() => { reload(); }, []);

  if (!outlets) return <Skeleton className="h-96 w-full" />;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-[var(--muted)]">Role: {tenant.user.role}</p>
        <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Tambah Cabang</Button>
      </div>

      {pendingCount > 0 && (
        <Link href="/cabang/transfer" className="mb-4 block rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm font-medium text-amber-700">
          {pendingCount} transfer menunggu persetujuan →
        </Link>
      )}

      {outlets.length === 0 ? (
        <EmptyState>Belum ada cabang. Tambahkan cabang pertama.</EmptyState>
      ) : (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {outlets.map((o) => (
            <Link key={o.id} href={`/cabang/${o.id}`}>
              <Card className="transition-colors hover:bg-[var(--surface-2)]">
                <CardContent className="pt-4">
                  <p className="text-sm font-semibold text-[var(--ink)]">{o.name}</p>
                  <p className="text-xs text-[var(--muted)]">{o.address || 'Alamat belum diisi'}</p>
                  <p className="mt-2 text-xs font-medium text-[var(--primary)]">Lihat detail →</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <Card className="mb-6">
        <CardHeader><CardTitle>Omzet 7 Hari (Seluruh Cabang)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chart}>
              <XAxis dataKey="bucket" stroke="var(--muted)" fontSize={10} tickFormatter={(v) => v.slice(5)} />
              <YAxis hide />
              <Tooltip formatter={(value: number) => formatRupiah(value)} />
              <Bar dataKey="omzet" fill="var(--primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {outlets.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Daftar Cabang</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {outlets.map((o) => (
              <div key={o.id} className="flex items-center justify-between border-b border-[var(--border)] py-2 last:border-0">
                <div>
                  <p className="text-sm font-medium text-[var(--ink)]">{o.name}</p>
                  <p className="text-xs text-[var(--muted)]">{o.phone || '—'}</p>
                </div>
                <span className={`text-xs font-medium ${o.is_active ? 'text-emerald-600' : 'text-[var(--muted)]'}`}>{o.is_active ? 'Aktif' : 'Nonaktif'}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {adding && <AddOutletModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); }} />}
    </div>
  );
}

function AddOutletModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!name.trim()) { setError('Nama cabang wajib diisi.'); return; }
    setSaving(true);
    try {
      await apiFetch('/api/v1/tenants/branches', { method: 'POST', body: JSON.stringify({ name, address: address || null, phone: phone || null }) });
      onSaved();
    } catch (e: any) {
      setError(e.message || 'Gagal menambah cabang.');
      setSaving(false);
    }
  }

  return (
    <Modal title="Tambah Cabang" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Nama Cabang"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Alamat" hint="Opsional"><Input value={address} onChange={(e) => setAddress(e.target.value)} /></Field>
        <Field label="No. HP Penanggung Jawab" hint="Opsional"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <Button size="lg" className="w-full" disabled={saving} onClick={submit}>{saving ? 'Menyimpan...' : 'Simpan Cabang'}</Button>
      </div>
    </Modal>
  );
}

export default function CabangPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-xl font-bold text-[var(--ink)]">Multi-Cabang</h1>
      <PlanGate featureKey="multi_outlet" featureLabel="Multi-Cabang">
        <CabangDashboard />
      </PlanGate>
    </div>
  );
}
