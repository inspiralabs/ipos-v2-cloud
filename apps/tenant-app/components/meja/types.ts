// Tipe baris meja dari table-service — dipakai bareng oleh modul Meja (/meja) dan POS Resto (/pos-resto).
export type TableZone = 'indoor' | 'outdoor' | 'vip';
export type TableStatus = 'available' | 'occupied' | 'reserved' | 'cleaning';
export type TableShape = 'persegi' | 'bundar' | 'oval';

export type TableRow = {
  id: string;
  tenant_id: string;
  outlet_id: string | null;
  label: string;
  seats: number;
  status: TableStatus;
  zone: TableZone;
  shape: TableShape;
  position_x: number;
  position_y: number;
  qr_token: string;
  created_at: string;
  updated_at: string;
};

export const ZONE_LABEL: Record<TableZone, string> = {
  indoor: 'Indoor',
  outdoor: 'Outdoor',
  vip: 'VIP',
};

export const STATUS_LABEL: Record<TableStatus, string> = {
  available: 'Kosong',
  occupied: 'Terisi',
  reserved: 'Reservasi',
  cleaning: 'Perlu Bersih',
};

/** Warna tile berdasarkan status — dipakai canvas & grid mobile. */
export const STATUS_TILE_CLASS: Record<TableStatus, string> = {
  available: 'border-[var(--border)] bg-[var(--surface)] text-[var(--ink)]',
  occupied: 'border-red-500/40 bg-red-500/10 text-red-600',
  reserved: 'border-amber-500/40 bg-amber-500/10 text-amber-700',
  cleaning: 'border-[var(--muted)]/40 bg-[var(--muted)]/10 text-[var(--muted)]',
};

export const STATUS_DOT_CLASS: Record<TableStatus, string> = {
  available: 'bg-[var(--surface)] border border-[var(--border)]',
  occupied: 'bg-red-500',
  reserved: 'bg-amber-500',
  cleaning: 'bg-[var(--muted)]',
};

export function shapeClass(shape: TableShape) {
  if (shape === 'bundar') return 'rounded-full h-16 w-16';
  if (shape === 'oval') return 'rounded-full h-14 w-20';
  return 'rounded-lg h-16 w-16';
}
