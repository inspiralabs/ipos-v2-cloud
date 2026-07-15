'use client';

import { motion } from 'framer-motion';
import { KeyRound, UserX, UserCheck, Trash2 } from 'lucide-react';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/ui/badge';

type Cashier = { id: string; name: string; email: string; role: string; is_active: boolean };

export function StaffCard({
  cashier,
  onResetPassword,
  onToggleActive,
  onDelete,
}: {
  cashier: Cashier;
  onResetPassword: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  return (
    <motion.div layout className="group relative flex flex-col items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-center shadow-sm">
      <Avatar name={cashier.name} size="lg" />
      <div>
        <p className="truncate text-sm font-semibold text-[var(--ink)]">{cashier.name}</p>
        <p className="truncate text-xs text-[var(--muted)]">{cashier.email}</p>
      </div>
      {!cashier.is_active && <Badge variant="neutral">Nonaktif</Badge>}
      <div className="flex w-full items-center justify-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
        <button
          type="button"
          aria-label="Reset password"
          onClick={onResetPassword}
          className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--ink)] hover:bg-[var(--surface-2)] active:scale-95"
        >
          <KeyRound className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label={cashier.is_active ? 'Nonaktifkan' : 'Aktifkan'}
          onClick={onToggleActive}
          className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--ink)] hover:bg-[var(--surface-2)] active:scale-95"
        >
          {cashier.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
        </button>
        <button
          type="button"
          aria-label="Hapus kasir"
          onClick={onDelete}
          className="flex h-11 w-11 items-center justify-center rounded-full text-red-500 hover:bg-red-500/10 active:scale-95"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
}
