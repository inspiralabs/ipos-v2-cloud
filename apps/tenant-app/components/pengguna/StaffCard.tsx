'use client';

import { motion } from 'framer-motion';
import { KeyRound, UserX, UserCheck, Trash2, Lock } from 'lucide-react';
import { Avatar } from '@/components/Avatar';
import { Badge } from '@/components/ui/badge';

type Cashier = {
  id: string;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  phone?: string | null;
  outlet_id?: string | null;
  has_pin?: boolean;
};

const ROLE_LABEL: Record<string, string> = {
  cashier: 'Kasir',
  outlet_manager: 'Manajer Cabang',
  kitchen_staff: 'Dapur',
  waiter: 'Waiter',
  manager: 'Manajer',
};

export function StaffCard({
  cashier,
  outletName,
  attendanceStatus,
  onResetPassword,
  onSetPin,
  onToggleActive,
  onDelete,
}: {
  cashier: Cashier;
  outletName?: string | null;
  attendanceStatus?: 'hadir' | 'telat' | 'belum';
  onResetPassword: () => void;
  onSetPin: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}) {
  return (
    <motion.div layout className="group relative flex flex-col items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-center shadow-sm">
      <Avatar name={cashier.name} size="lg" />
      <div className="w-full min-w-0">
        <p className="truncate text-sm font-semibold text-[var(--ink)]">{cashier.name}</p>
        <p className="truncate text-xs text-[var(--muted)]">{cashier.email}</p>
        {outletName && <p className="truncate text-xs text-[var(--muted)]">{outletName}</p>}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1">
        <Badge variant="neutral">{ROLE_LABEL[cashier.role] ?? cashier.role}</Badge>
        {!cashier.is_active && <Badge variant="neutral">Nonaktif</Badge>}
        {attendanceStatus === 'hadir' && <Badge variant="success">Hadir</Badge>}
        {attendanceStatus === 'telat' && <Badge variant="warning">Telat</Badge>}
        {attendanceStatus === 'belum' && <Badge variant="neutral">Belum Absen</Badge>}
      </div>
      <div className="flex w-full flex-wrap items-center justify-center gap-1">
        <button
          type="button"
          aria-label="Ubah PIN"
          title="Ubah PIN"
          onClick={onSetPin}
          className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--ink)] hover:bg-[var(--surface-2)] active:scale-95"
        >
          <Lock className="h-4 w-4" />
        </button>
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
