'use client';

import { motion } from 'framer-motion';
import { Minus, Plus, Trash2 } from 'lucide-react';

export function QtyStepper({
  qty,
  onIncrement,
  onDecrement,
  onRemove,
}: {
  qty: number;
  onIncrement: () => void;
  onDecrement: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        aria-label="Kurangi"
        onClick={onDecrement}
        className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--ink)] hover:bg-[var(--surface-2)] active:scale-95"
      >
        <Minus className="h-4 w-4" />
      </button>
      <motion.span
        key={qty}
        initial={{ scale: 1 }}
        animate={{ scale: [1, 1.15, 1] }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="w-6 text-center text-sm font-semibold text-[var(--ink)]"
      >
        {qty}
      </motion.span>
      <button
        type="button"
        aria-label="Tambah"
        onClick={onIncrement}
        className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--ink)] hover:bg-[var(--surface-2)] active:scale-95"
      >
        <Plus className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="Hapus item"
        onClick={onRemove}
        className="flex h-11 w-11 items-center justify-center rounded-lg text-red-500 hover:bg-red-500/10 active:scale-95"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
