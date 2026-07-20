'use client';

import { motion } from 'framer-motion';
import { Pencil, Trash2, EyeOff, Eye, UtensilsCrossed } from 'lucide-react';
import type { Menu } from '@/lib/types';
import { formatRupiah } from '@/lib/format';
import { CategoryIcon } from './CategoryIcon';

export function MenuCard({
  menu,
  groupCount,
  categoryName,
  onToggleSoldOut,
  onEdit,
  onDelete,
}: {
  menu: Menu;
  groupCount: number;
  categoryName?: string;
  onToggleSoldOut: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <motion.div
      layout
      className={`group relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-sm ${menu.is_sold_out ? 'opacity-55' : ''}`}
    >
      <div className="relative flex h-28 items-center justify-center bg-[var(--surface-2)]">
        {menu.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={menu.image_url} alt={menu.name} className="h-full w-full object-cover" />
        ) : (
          <UtensilsCrossed className="h-8 w-8 text-[var(--muted)]" />
        )}
        <div className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-[var(--surface)]/90 text-[var(--ink)] shadow-sm">
          <CategoryIcon categoryName={categoryName} className="h-3.5 w-3.5" />
        </div>
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/40 opacity-100 transition-opacity md:bg-black/50 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
          <button
            type="button"
            aria-label="Ubah menu"
            title="Ubah menu"
            onClick={onEdit}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--ink)] active:scale-95"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label={menu.is_sold_out ? 'Tandai tersedia' : 'Tandai habis'}
            title={menu.is_sold_out ? 'Tandai tersedia' : 'Tandai habis'}
            onClick={onToggleSoldOut}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--ink)] active:scale-95"
          >
            {menu.is_sold_out ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
          <button
            type="button"
            aria-label="Hapus menu"
            title="Hapus menu"
            onClick={onDelete}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface)] text-red-500 active:scale-95"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="p-3">
        <p className="truncate text-sm font-semibold text-[var(--ink)]">{menu.name}</p>
        <div className="mt-1 flex items-center gap-1.5">
          {menu.is_sold_out ? (
            <span className="text-xs font-semibold text-[var(--muted)]">HABIS</span>
          ) : menu.discount_price != null ? (
            <>
              <span className="text-xs text-[var(--muted)] line-through tabular-nums">{formatRupiah(menu.price)}</span>
              <span className="text-sm font-bold text-[var(--primary)] tabular-nums">{formatRupiah(menu.discount_price)}</span>
            </>
          ) : (
            <span className="text-sm font-bold text-[var(--ink)] tabular-nums">{formatRupiah(menu.price)}</span>
          )}
        </div>
        {groupCount > 0 && <p className="mt-1 text-xs text-[var(--muted)]">{groupCount} variasi</p>}
      </div>
    </motion.div>
  );
}
