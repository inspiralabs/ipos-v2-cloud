'use client';

import { Input } from '@/components/ui/input';

export function TableNumberField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="No Meja"
      className="h-11 w-24 text-center text-sm"
      aria-label="Nomor meja"
    />
  );
}
