'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { useTenant } from '@/components/layout/TenantContext';
import { PlanGate } from '@/components/PlanGate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Outlet = { id: string; name: string };
type Ingredient = { id: string; name: string; unit: string };
type TransferItem = { id: string; ingredient_id: string; qty: number; unit: string };
type Transfer = {
  id: string; from_outlet_id: string; to_outlet_id: string; status: 'pending' | 'approved' | 'rejected';
  reason: string | null; created_at: string; items: TransferItem[];
};

const CAN_APPROVE_ROLES = ['owner', 'admin_staff', 'super_admin'];
const STATUS_VARIANT: Record<Transfer['status'], 'neutral' | 'success' | 'destructive'> = {
  pending: 'neutral', approved: 'success', rejected: 'destructive',
};
const STATUS_LABEL: Record<Transfer['status'], string> = { pending: 'Menunggu', approved: 'Disetujui', rejected: 'Ditolak' };

function TransferList() {
  const { tenant } = useTenant();
  const [transfers, setTransfers] = useState<Transfer[] | null>(null);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const canApprove = CAN_APPROVE_ROLES.includes(tenant.user.role);

  function reload() {
    apiFetch('/api/v1/tenants/transfers').then(setTransfers).catch(() => setTransfers([]));
  }

  useEffect(() => {
    reload();
    apiFetch('/api/v1/tenants/branches').then(setOutlets).catch(() => {});
    apiFetch('/api/v1/inventory/ingredients').then(setIngredients).catch(() => {});
  }, []);

  const outletName = (id: string) => outlets.find((o) => o.id === id)?.name ?? '—';
  const ingredientName = (id: string) => ingredients.find((i) => i.id === id)?.name ?? id;

  async function decide(id: string, decision: 'approved' | 'rejected') {
    setError('');
    try {
      await apiFetch(`/api/v1/tenants/transfers/${id}/decide`, { method: 'POST', body: JSON.stringify({ decision }) });
      reload();
    } catch (e: any) {
      setError(e.message || 'Gagal memproses transfer.');
    }
  }

  if (!transfers) return <Skeleton className="h-96 w-full" />;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-bold text-[var(--ink)]">Transfer Antar-Cabang</h1>
        <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Ajukan Transfer</Button>
      </div>

      {error && <p className="mb-3 text-sm text-red-500">{error}</p>}

      {transfers.length === 0 ? (
        <EmptyState>Belum ada transfer antar-cabang.</EmptyState>
      ) : (
        <div className="space-y-3">
          {transfers.map((t) => (
            <div key={t.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-[var(--ink)]">{outletName(t.from_outlet_id)} → {outletName(t.to_outlet_id)}</p>
                <Badge variant={STATUS_VARIANT[t.status]}>{STATUS_LABEL[t.status]}</Badge>
              </div>
              <ul className="mb-2 space-y-0.5 text-xs text-[var(--muted)]">
                {t.items.map((i) => <li key={i.id}>{ingredientName(i.ingredient_id)} · {i.qty} {i.unit}</li>)}
              </ul>
              {t.reason && <p className="mb-2 text-xs italic text-[var(--muted)]">&quot;{t.reason}&quot;</p>}
              {t.status === 'pending' && (
                canApprove ? (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => decide(t.id, 'rejected')}>Tolak</Button>
                    <Button size="sm" className="flex-1" onClick={() => decide(t.id, 'approved')}>Approve</Button>
                  </div>
                ) : (
                  <p className="text-xs text-[var(--muted)]">Menunggu approval Owner/Admin.</p>
                )
              )}
            </div>
          ))}
        </div>
      )}

      {adding && (
        <RequestTransferModal
          outlets={outlets}
          ingredients={ingredients}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); reload(); }}
        />
      )}
    </div>
  );
}

function RequestTransferModal({ outlets, ingredients, onClose, onSaved }: {
  outlets: Outlet[]; ingredients: Ingredient[]; onClose: () => void; onSaved: () => void;
}) {
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [reason, setReason] = useState('');
  const [rows, setRows] = useState<{ ingredient_id: string; qty: string; unit: string }[]>([{ ingredient_id: '', qty: '', unit: '' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function updateRow(i: number, patch: Partial<{ ingredient_id: string; qty: string; unit: string }>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function pickIngredient(i: number, ingredientId: string) {
    const ing = ingredients.find((x) => x.id === ingredientId);
    updateRow(i, { ingredient_id: ingredientId, unit: ing?.unit ?? '' });
  }

  async function submit() {
    setError('');
    if (!fromId || !toId) { setError('Pilih outlet asal dan tujuan.'); return; }
    if (fromId === toId) { setError('Outlet asal dan tujuan tidak boleh sama.'); return; }
    const items = rows.filter((r) => r.ingredient_id && r.qty).map((r) => ({ ingredient_id: r.ingredient_id, qty: parseInt(r.qty, 10), unit: r.unit }));
    if (!items.length) { setError('Tambahkan minimal 1 barang.'); return; }

    setSaving(true);
    try {
      await apiFetch('/api/v1/tenants/transfers', {
        method: 'POST',
        body: JSON.stringify({ from_outlet_id: fromId, to_outlet_id: toId, reason: reason || null, items }),
      });
      onSaved();
    } catch (e: any) {
      setError(e.message || 'Gagal mengajukan transfer.');
      setSaving(false);
    }
  }

  return (
    <Modal title="Ajukan Transfer" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dari Outlet">
            <Select value={fromId} onValueChange={setFromId}>
              <SelectTrigger><SelectValue placeholder="Pilih outlet" /></SelectTrigger>
              <SelectContent>{outlets.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Ke Outlet">
            <Select value={toId} onValueChange={setToId}>
              <SelectTrigger><SelectValue placeholder="Pilih outlet" /></SelectTrigger>
              <SelectContent>{outlets.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-[var(--ink)]">Barang</p>
          <div className="space-y-2">
            {rows.map((row, i) => (
              <div key={i} className="grid grid-cols-[1fr_80px_70px] gap-2">
                <Select value={row.ingredient_id} onValueChange={(v) => pickIngredient(i, v)}>
                  <SelectTrigger><SelectValue placeholder="Bahan" /></SelectTrigger>
                  <SelectContent>{ingredients.map((ing) => <SelectItem key={ing.id} value={ing.id}>{ing.name}</SelectItem>)}</SelectContent>
                </Select>
                <Input inputMode="numeric" placeholder="Jumlah" value={row.qty} onChange={(e) => updateRow(i, { qty: e.target.value.replace(/\D/g, '') })} />
                <Input placeholder="Satuan" value={row.unit} onChange={(e) => updateRow(i, { unit: e.target.value })} />
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setRows((prev) => [...prev, { ingredient_id: '', qty: '', unit: '' }])} className="mt-2 text-sm font-medium text-[var(--primary)]">
            + Tambah Barang
          </button>
        </div>

        <Field label="Alasan" hint="Opsional">
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 text-sm text-[var(--ink)] outline-none focus:border-[var(--primary)]" />
        </Field>

        {error && <p className="text-sm text-red-500">{error}</p>}
        <Button size="lg" className="w-full" disabled={saving} onClick={submit}>{saving ? 'Mengirim...' : 'Ajukan Transfer'}</Button>
      </div>
    </Modal>
  );
}

export default function TransferPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PlanGate featureKey="inter_branch_transfer" featureLabel="Transfer Antar-Cabang">
        <TransferList />
      </PlanGate>
    </div>
  );
}
