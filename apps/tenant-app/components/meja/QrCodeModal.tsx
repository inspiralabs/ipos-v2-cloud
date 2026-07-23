'use client';

import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { getToken } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import type { TableRow } from './types';

/** Cetak QR di tab baru berisi cuma gambar + trigger print dialog. */
function printQr(imgUrl: string, label: string) {
  const win = window.open('', '_blank');
  if (!win) return;
  win.document.write(`
    <!doctype html><html><head><title>QR Meja ${label}</title>
    <style>
      body { margin:0; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; font-family:sans-serif; }
      img { width: 280px; height: 280px; }
      p { font-size: 18px; font-weight: 700; margin-top: 12px; }
    </style>
    </head><body>
      <img src="${imgUrl}" alt="QR Meja ${label}" />
      <p>Meja ${label}</p>
      <script>window.onload = () => { window.print(); }</script>
    </body></html>
  `);
  win.document.close();
}

export function QrCodeModal({ table, onClose }: { table: TableRow; onClose: () => void }) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let revoke: string | null = null;
    const token = getToken();
    fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/v1/tables/${table.id}/qr-code`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => {
        if (!res.ok) throw new Error('Gagal memuat QR');
        return res.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        revoke = url;
        setImgUrl(url);
      })
      .catch(() => setError('Gagal memuat kode QR.'));
    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [table.id]);

  return (
    <Modal title={`QR Meja ${table.label}`} onClose={onClose}>
      <div className="flex flex-col items-center gap-4 py-2">
        {error && <p className="text-sm text-red-500">{error}</p>}
        {!error && !imgUrl && (
          <div className="flex h-56 w-56 items-center justify-center rounded-xl bg-[var(--surface-2)] text-sm text-[var(--muted)]">
            Memuat...
          </div>
        )}
        {imgUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imgUrl} alt={`QR Meja ${table.label}`} className="h-56 w-56 rounded-xl border border-[var(--border)]" />
        )}
        <Button
          className="w-full"
          disabled={!imgUrl}
          onClick={() => imgUrl && printQr(imgUrl, table.label)}
        >
          <Printer className="h-4 w-4" /> Cetak
        </Button>
      </div>
    </Modal>
  );
}
