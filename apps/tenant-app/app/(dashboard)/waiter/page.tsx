'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/auth';
import { PlanGate } from '@/components/PlanGate';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Modal } from '@/components/ui/modal';
import { Skeleton } from '@/components/ui/skeleton';
import { useRealtimeEvents } from '@/hooks/useRealtimeEvents';

type TicketStatus = 'pending' | 'cooking' | 'ready' | 'served';

type TicketItem = {
  product_name: string;
  variant_summary: string | null;
  qty: number;
  notes: string | null;
};

type Ticket = {
  id: string;
  order_id: string;
  status: TicketStatus;
  station: 'dapur' | 'bar';
  notes: string | null;
  created_at: string;
  table_number: string | null;
  items: TicketItem[];
};

type Table = {
  id: string;
  label: string;
  status: string;
  seats: number;
  zone: string | null;
};

type OrderStatus = 'diproses' | 'siap' | 'selesai' | 'menunggu' | null;

function orderStatusFor(table: Table, tickets: Ticket[]): OrderStatus {
  const matches = tickets.filter((t) => t.table_number === table.label);
  if (matches.length === 0) {
    return table.status === 'occupied' ? 'menunggu' : null;
  }
  if (matches.some((t) => t.status === 'pending' || t.status === 'cooking')) return 'diproses';
  if (matches.some((t) => t.status === 'ready')) return 'siap';
  if (matches.every((t) => t.status === 'served')) return 'selesai';
  return 'menunggu';
}

function OrderStatusBadge({ status }: { status: OrderStatus }) {
  if (!status) return null;
  const map: Record<Exclude<OrderStatus, null>, { label: string; variant: 'neutral' | 'warning' | 'success' | 'accent' }> = {
    menunggu: { label: 'Menunggu', variant: 'neutral' },
    diproses: { label: 'Diproses', variant: 'warning' },
    siap: { label: 'Siap Diantar', variant: 'accent' },
    selesai: { label: 'Selesai', variant: 'success' },
  };
  const { label, variant } = map[status];
  return <Badge variant={variant}>{label}</Badge>;
}

function TableGrid() {
  const [tables, setTables] = useState<Table[] | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<Table | null>(null);

  function reload() {
    Promise.all([apiFetch('/api/v1/tables'), apiFetch('/api/v1/kitchen/tickets')])
      .then(([tableRows, ticketRows]) => {
        setTables(tableRows);
        setTickets(ticketRows);
      })
      .catch(() => setFailed(true));
  }

  useEffect(() => { reload(); }, []);

  useRealtimeEvents((event) => {
    if (event.type === 'kitchen_ticket.updated' || event.type === 'table.updated') reload();
  });

  if (failed) return <EmptyState>Gagal memuat data meja. Coba muat ulang halaman.</EmptyState>;
  if (!tables) return <Skeleton className="h-40 w-full" />;
  if (tables.length === 0) return <EmptyState>Belum ada meja. Tambahkan meja dari halaman Meja.</EmptyState>;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {tables.map((table) => {
          const status = orderStatusFor(table, tickets);
          return (
            <button
              key={table.id}
              onClick={() => setSelected(table)}
              className="flex min-h-[100px] flex-col items-start justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left active:scale-95"
            >
              <span className="text-lg font-bold text-[var(--ink)]">{table.label}</span>
              <div className="flex flex-wrap items-center gap-1.5">
                {status ? (
                  <OrderStatusBadge status={status} />
                ) : (
                  <Badge variant="neutral">Kosong</Badge>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {selected && (
        <TableDetailModal
          table={selected}
          tickets={tickets.filter((t) => t.table_number === selected.label)}
          onClose={() => setSelected(null)}
          onChanged={reload}
        />
      )}
    </>
  );
}

function TableDetailModal({
  table,
  tickets,
  onClose,
  onChanged,
}: {
  table: Table;
  tickets: Ticket[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const activeTickets = useMemo(() => tickets.filter((t) => t.status !== 'served'), [tickets]);

  async function markServed(id: string) {
    setBusyId(id);
    try {
      await apiFetch(`/api/v1/kitchen/tickets/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status: 'served' }),
      });
      onChanged();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Modal title={`Meja ${table.label}`} onClose={onClose}>
      {tickets.length === 0 ? (
        <EmptyState>Tidak ada order aktif untuk meja ini.</EmptyState>
      ) : (
        <div className="space-y-4">
          {tickets.map((ticket) => (
            <div key={ticket.id} className="rounded-xl border border-[var(--border)] p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                  {ticket.station === 'dapur' ? 'Dapur' : 'Bar'}
                </span>
                <Badge
                  variant={
                    ticket.status === 'ready' ? 'accent' : ticket.status === 'served' ? 'success' : 'warning'
                  }
                >
                  {ticket.status === 'pending'
                    ? 'Baru'
                    : ticket.status === 'cooking'
                      ? 'Diproses'
                      : ticket.status === 'ready'
                        ? 'Siap Diantar'
                        : 'Selesai'}
                </Badge>
              </div>

              <ul className="mb-3 space-y-1.5">
                {ticket.items.map((item, idx) => (
                  <li key={idx} className="text-sm">
                    <div className="flex items-baseline gap-2 text-[var(--ink)]">
                      <span className="font-semibold tabular-nums">{item.qty}x</span>
                      <span>{item.product_name}</span>
                    </div>
                    {item.variant_summary && (
                      <p className="ml-6 text-xs italic text-[var(--muted)]">{item.variant_summary}</p>
                    )}
                    {item.notes && (
                      <p className="ml-6 text-xs italic text-[var(--muted)]">&quot;{item.notes}&quot;</p>
                    )}
                  </li>
                ))}
              </ul>

              {ticket.status !== 'served' && (
                <Button
                  size="lg"
                  className="w-full"
                  disabled={busyId === ticket.id}
                  onClick={() => markServed(ticket.id)}
                >
                  {busyId === ticket.id ? 'Menyimpan...' : 'Tandai Sudah Diantar'}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
      {activeTickets.length === 0 && tickets.length > 0 && (
        <p className="mt-3 text-center text-sm text-[var(--muted)]">Semua order di meja ini sudah diantar.</p>
      )}
    </Modal>
  );
}

export default function WaiterPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 text-xl font-bold text-[var(--ink)]">Kartu QR Waiter</h1>
      <PlanGate featureKey="table_management" featureLabel="Kartu QR Waiter">
        <TableGrid />
      </PlanGate>
    </div>
  );
}
