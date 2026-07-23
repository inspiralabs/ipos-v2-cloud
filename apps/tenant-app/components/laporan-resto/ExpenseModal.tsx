'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const CATEGORIES = [
  { value: 'gaji', label: 'Gaji' },
  { value: 'sewa', label: 'Sewa' },
  { value: 'listrik', label: 'Listrik' },
  { value: 'bahan_baku', label: 'Bahan Baku' },
  { value: 'lainnya', label: 'Lainnya' },
] as const;

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function ExpenseModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [category, setCategory] = useState<string>('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [spentAt, setSpentAt] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = category && Number(amount) > 0 && spentAt;

  async function submit() {
    setSaving(true);
    setError('');
    try {
      await apiFetch('/api/v1/reports/expenses', {
        method: 'POST',
        body: JSON.stringify({
          category,
          amount: Number(amount),
          spent_at: spentAt,
          ...(note ? { note } : {}),
        }),
      });
      onSaved();
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <Modal title="Catat Pengeluaran" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Field label="Kategori">
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger>
              <SelectValue placeholder="Pilih kategori..." />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Jumlah (Rp)">
          <Input
            inputMode="numeric"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))}
          />
        </Field>

        <Field label="Tanggal">
          <Input type="date" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} />
        </Field>

        <Field label="Catatan (opsional)">
          <Input placeholder="misal: gaji karyawan Juli" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <Button size="lg" className="w-full" disabled={!canSubmit || saving} onClick={submit}>
          {saving ? 'Menyimpan...' : 'Simpan Pengeluaran'}
        </Button>
      </div>
    </Modal>
  );
}
