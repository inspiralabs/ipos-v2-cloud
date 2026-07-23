import { useState } from 'react';

/** Checkbox "pilih" dipakai bareng action bar bulk-delete di licenses/tenants/leads. */
export function useSelection<T extends { id: string }>(items: T[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === items.length ? new Set() : new Set(items.map((i) => i.id))));
  }

  function clear() {
    setSelected(new Set());
  }

  return { selected, toggle, toggleAll, clear, allSelected: items.length > 0 && selected.size === items.length };
}
