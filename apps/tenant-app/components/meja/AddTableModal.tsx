'use client';

import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import { shapeClass, ZONE_LABEL, type TableShape, type TableZone } from './types';

const ZONES: TableZone[] = ['indoor', 'outdoor', 'vip'];
const SHAPES: { value: TableShape; label: string }[] = [
  { value: 'persegi', label: 'Persegi' },
  { value: 'bundar', label: 'Bundar' },
  { value: 'oval', label: 'Oval' },
];

export function AddTableModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [label, setLabel] = useState('');
  const [zone, setZone] = useState<TableZone>('indoor');
  const [seats, setSeats] = useState(2);
  const [shape, setShape] = useState<TableShape>('persegi');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!label.trim()) {
      setError('Nama/nomor meja wajib diisi.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiFetch('/api/v1/tables', {
        method: 'POST',
        body: JSON.stringify({
          label: label.trim(),
          seats,
          zone,
          shape,
          // Posisi default acak ringan supaya tidak numpuk di pojok yang sama.
          position_x: 8 + Math.round(Math.random() * 15),
          position_y: 8 + Math.round(Math.random() * 15),
        }),
      });
      onSaved();
    } catch (e: any) {
      setError(e.message || 'Gagal menambah meja.');
      setSaving(false);
    }
  }

  return (
    <Modal title="Tambah Meja" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Nama/Nomor Meja">
          <Input autoFocus placeholder="mis. A1, VIP-2" value={label} onChange={(e) => setLabel(e.target.value)} />
        </Field>

        <Field label="Zona">
          <div className="flex gap-2">
            {ZONES.map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => setZone(z)}
                className={cn(
                  'h-10 flex-1 rounded-full text-sm font-medium transition-colors',
                  zone === z
                    ? 'bg-[var(--nav-active)] text-[var(--nav-active-ink)]'
                    : 'border border-[var(--border)] text-[var(--ink)] hover:bg-[var(--surface-2)]'
                )}
              >
                {ZONE_LABEL[z]}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Kapasitas Kursi">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSeats((s) => Math.max(1, s - 1))}
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--border)] active:scale-95"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-10 text-center text-lg font-semibold tabular-nums text-[var(--ink)]">{seats}</span>
            <button
              type="button"
              onClick={() => setSeats((s) => Math.min(20, s + 1))}
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--border)] active:scale-95"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </Field>

        <Field label="Bentuk Meja">
          <div className="flex gap-3">
            {SHAPES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setShape(s.value)}
                className="flex flex-col items-center gap-1.5"
              >
                <span
                  className={cn(
                    'border-2 transition-colors',
                    shapeClass(s.value),
                    'h-10 w-10',
                    shape === s.value
                      ? 'border-[var(--primary)] bg-[var(--primary)]/10'
                      : 'border-[var(--border)] bg-[var(--surface-2)]'
                  )}
                />
                <span className="text-xs text-[var(--muted)]">{s.label}</span>
              </button>
            ))}
          </div>
        </Field>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <Button size="lg" className="w-full" disabled={saving} onClick={submit}>
          {saving ? 'Menyimpan...' : 'Simpan Meja'}
        </Button>
      </div>
    </Modal>
  );
}
