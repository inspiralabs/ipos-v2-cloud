import { AlertTriangle } from 'lucide-react';

/** Inline, bukan modal — PRD §3.5: "POS tetap tampil tapi transaksi baru diblokir." */
export function SandboxLimitBanner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl bg-amber-100 px-3 py-2 text-sm text-amber-900">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  );
}
