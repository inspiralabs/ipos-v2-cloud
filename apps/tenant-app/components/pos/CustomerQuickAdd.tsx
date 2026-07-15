'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/auth';
import type { Customer } from '@/lib/types';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

export function CustomerQuickAdd({
  customer,
  onPick,
  onOpenFullPicker,
}: {
  customer: Customer | null;
  onPick: (c: Customer) => void;
  onOpenFullPicker: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function quickAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const row = await apiFetch('/api/v1/tenants/customers', {
        method: 'POST',
        body: JSON.stringify({ name, phone: phone || null }),
      });
      onPick(row);
      setOpen(false);
      setName('');
      setPhone('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-11">
          {customer ? customer.name : 'Pelanggan'}
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <form onSubmit={quickAdd} className="space-y-3">
          <Field label="Nama">
            <Input required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama pelanggan" />
          </Field>
          <Field label="No HP" hint="Opsional">
            <Input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <Button type="submit" disabled={saving || !name} className="w-full">
            {saving ? 'Menyimpan...' : 'Simpan'}
          </Button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onOpenFullPicker();
            }}
            className="w-full text-center text-xs text-[var(--muted)] underline underline-offset-2"
          >
            Cari pelanggan lain
          </button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
