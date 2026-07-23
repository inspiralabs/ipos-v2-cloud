'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Ingredient = { id: string; name: string; unit: string; stock_qty: number; low_stock_threshold: number };

export function WasteModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [ingredients, setIngredients] = useState<Ingredient[] | null>(null);
  const [ingredientId, setIngredientId] = useState('');
  const [qty, setQty] = useState('');
  const [estimatedValue, setEstimatedValue] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch('/api/v1/inventory/ingredients').then(setIngredients).catch(() => setIngredients([]));
  }, []);

  const selected = ingredients?.find((i) => i.id === ingredientId);
  const canSubmit = ingredientId && Number(qty) > 0 && Number(estimatedValue) >= 0;

  async function submit() {
    setSaving(true);
    setError('');
    try {
      await apiFetch('/api/v1/reports/waste', {
        method: 'POST',
        body: JSON.stringify({
          ingredient_id: ingredientId,
          qty: Number(qty),
          estimated_value: Number(estimatedValue),
          ...(reason ? { reason } : {}),
        }),
      });
      onSaved();
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  }

  return (
    <Modal title="Catat Waste" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Field label="Bahan">
          {ingredients === null ? (
            <div className="h-11 animate-pulse rounded-xl bg-[var(--surface-2)]" />
          ) : ingredients.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Belum ada data bahan baku. Tambahkan di halaman Bahan Baku dulu.</p>
          ) : (
            <Select value={ingredientId} onValueChange={setIngredientId}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih bahan..." />
              </SelectTrigger>
              <SelectContent>
                {ingredients.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.name} ({i.unit})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>

        <Field label={`Jumlah${selected ? ` (${selected.unit})` : ''}`}>
          <Input
            inputMode="decimal"
            placeholder="0"
            value={qty}
            onChange={(e) => setQty(e.target.value.replace(/[^0-9.]/g, ''))}
          />
        </Field>

        <Field label="Estimasi Nilai Rugi (Rp)">
          <Input
            inputMode="numeric"
            placeholder="0"
            value={estimatedValue}
            onChange={(e) => setEstimatedValue(e.target.value.replace(/\D/g, ''))}
          />
        </Field>

        <Field label="Alasan (opsional)">
          <Input
            placeholder="misal: kadaluarsa, rusak, tumpah"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <Button size="lg" className="w-full" disabled={!canSubmit || saving} onClick={submit}>
          {saving ? 'Menyimpan...' : 'Simpan Waste'}
        </Button>
      </div>
    </Modal>
  );
}
