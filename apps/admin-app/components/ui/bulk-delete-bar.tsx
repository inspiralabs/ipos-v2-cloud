'use client';

import { useState } from 'react';
import { Button } from './button';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from './alert-dialog';
import { Label } from './label';
import { Input } from './input';

/**
 * Action bar "N terpilih" + modal pilihan Hapus Sementara / Hapus Permanen.
 * `hardConfirmText` opsional — kalau diisi (mis. "HAPUS PERMANEN"), hard-delete minta
 * user mengetik ulang teks itu dulu (dipakai tenants, blast radius besar/cascade).
 * Tanpa itu, hard-delete cukup satu klik konfirmasi (licenses, leads — blast radius kecil).
 */
export function BulkDeleteBar({
  count, isSuperAdmin, hardConfirmText, onSoftDelete, onHardDelete, onClear,
}: {
  count: number;
  isSuperAdmin: boolean;
  hardConfirmText?: string;
  onSoftDelete: () => void;
  onHardDelete: () => void;
  onClear: () => void;
}) {
  const [hardOpen, setHardOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const needsTyped = !!hardConfirmText;
  const canConfirmHard = !needsTyped || typed === hardConfirmText;

  if (count === 0) return null;

  return (
    <>
      <div className="mb-4 flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5">
        <p className="text-sm font-medium text-[var(--ink)]">{count} terpilih</p>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onClear}>Batal</Button>
          <Button size="sm" variant="destructive" onClick={onSoftDelete}>Hapus Sementara</Button>
          {isSuperAdmin && (
            <Button size="sm" variant="destructive" onClick={() => { setTyped(''); setHardOpen(true); }}>Hapus Permanen</Button>
          )}
        </div>
      </div>

      <AlertDialog open={hardOpen} onOpenChange={setHardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Permanen {count} Item?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini permanen dan tidak bisa dibatalkan.
              {needsTyped && <> Ketik <span className="font-mono font-semibold text-[var(--ink)]">{hardConfirmText}</span> untuk konfirmasi.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {needsTyped && (
            <>
              <Label htmlFor="bulk-hard-confirm">Konfirmasi</Label>
              <Input id="bulk-hard-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={hardConfirmText} autoFocus />
            </>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction disabled={!canConfirmHard} onClick={() => { onHardDelete(); setHardOpen(false); }}>Hapus Permanen</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
