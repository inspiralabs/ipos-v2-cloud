'use client';

import { useState } from 'react';
import { QrCode, Trash2 } from 'lucide-react';
import { apiFetch } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { cn } from '@/lib/utils';
import { QrCodeModal } from './QrCodeModal';
import { STATUS_LABEL, ZONE_LABEL, type TableRow, type TableStatus } from './types';

const STATUSES: TableStatus[] = ['available', 'occupied', 'reserved', 'cleaning'];

export function TableDetailModal({
  table,
  onClose,
  onChanged,
  onDeleted,
}: {
  table: TableRow;
  onClose: () => void;
  onChanged: (row: TableRow) => void;
  onDeleted: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showQr, setShowQr] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  async function changeStatus(status: TableStatus) {
    if (status === table.status) return;
    setSaving(true);
    setError('');
    try {
      const row = await apiFetch(`/api/v1/tables/${table.id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      onChanged(row);
    } catch (e: any) {
      setError(e.message || 'Gagal ubah status meja.');
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true);
    setError('');
    try {
      await apiFetch(`/api/v1/tables/${table.id}`, { method: 'DELETE' });
      onDeleted();
    } catch (e: any) {
      setError(e.message || 'Gagal hapus meja.');
      setSaving(false);
    }
  }

  if (showQr) return <QrCodeModal table={table} onClose={() => setShowQr(false)} />;

  return (
    <Modal title={`Meja ${table.label}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
          <span>{ZONE_LABEL[table.zone]}</span>
          <span>·</span>
          <span>{table.seats} kursi</span>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-[var(--ink)]">Ubah Status</p>
          <div className="grid grid-cols-2 gap-2">
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                disabled={saving}
                onClick={() => changeStatus(s)}
                className={cn(
                  'h-11 rounded-xl text-sm font-medium transition-colors disabled:opacity-60',
                  s === table.status
                    ? 'bg-[var(--nav-active)] text-[var(--nav-active-ink)]'
                    : 'border border-[var(--border)] text-[var(--ink)] hover:bg-[var(--surface-2)]'
                )}
              >
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <Button variant="outline" className="w-full" onClick={() => setShowQr(true)}>
          <QrCode className="h-4 w-4" /> Cetak QR
        </Button>

        {confirmDelete ? (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-3">
            <p className="mb-2 text-sm text-[var(--ink)]">Hapus meja {table.label}? Tindakan ini tidak bisa dibatalkan.</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1" onClick={() => setConfirmDelete(false)}>
                Batal
              </Button>
              <Button size="sm" className="flex-1 bg-red-600 text-white hover:bg-red-700" disabled={saving} onClick={remove}>
                Hapus
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-medium text-red-500 hover:bg-red-500/10"
          >
            <Trash2 className="h-4 w-4" /> Hapus Meja
          </button>
        )}
      </div>
    </Modal>
  );
}
