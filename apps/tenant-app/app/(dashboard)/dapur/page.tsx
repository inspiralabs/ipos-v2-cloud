'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/auth';
import { PlanGate } from '@/components/PlanGate';
import { useRealtimeEvents } from '@/hooks/useRealtimeEvents';

type TicketStatus = 'pending' | 'cooking' | 'ready' | 'served';
type Station = 'dapur' | 'bar';

type TicketItem = {
  product_name: string;
  variant_summary: string | null;
  qty: number;
  notes: string | null;
};

type Ticket = {
  id: string;
  tenant_id: string;
  order_id: string;
  status: TicketStatus;
  station: Station;
  notes: string | null;
  created_at: string;
  started_at: string | null;
  ready_at: string | null;
  served_at: string | null;
  table_number: string | null;
  items: TicketItem[];
};

const COLUMNS: { status: TicketStatus; title: string }[] = [
  { status: 'pending', title: 'Baru' },
  { status: 'cooking', title: 'Diproses' },
  { status: 'ready', title: 'Siap Diambil' },
];

const BUMP_LABEL: Record<TicketStatus, string> = {
  pending: 'Mulai Masak',
  cooking: 'Tandai Siap',
  ready: 'Sudah Diantar',
  served: 'Sudah Diantar',
};

const NEXT_STATUS: Record<TicketStatus, TicketStatus> = {
  pending: 'cooking',
  cooking: 'ready',
  ready: 'served',
  served: 'served',
};

function ElapsedChip({ createdAt }: { createdAt: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const elapsedMs = Math.max(0, now - new Date(createdAt).getTime());
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const label = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  const tone =
    minutes >= 10
      ? 'bg-red-500/20 text-red-300'
      : minutes >= 5
        ? 'bg-amber-500/20 text-amber-300'
        : 'bg-white/10 text-white/70';

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${tone}`}>
      {label}
    </span>
  );
}

function TicketCard({ ticket, onBump }: { ticket: Ticket; onBump: (id: string, status: TicketStatus) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const channelLabel = ticket.table_number || 'Take Away';

  async function handleBump() {
    setBusy(true);
    try {
      await onBump(ticket.id, NEXT_STATUS[ticket.status]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-base font-bold text-white">{channelLabel}</span>
        <ElapsedChip createdAt={ticket.created_at} />
      </div>

      <ul className="mb-4 space-y-2">
        {ticket.items.map((item, idx) => (
          <li key={idx} className="text-sm">
            <div className="flex items-baseline gap-2 text-white">
              <span className="font-semibold tabular-nums">{item.qty}x</span>
              <span>{item.product_name}</span>
            </div>
            {item.variant_summary && (
              <p className="ml-6 text-xs italic text-white/60">{item.variant_summary}</p>
            )}
            {item.notes && (
              <p className="ml-6 text-xs italic text-amber-300/90">&quot;{item.notes}&quot;</p>
            )}
          </li>
        ))}
      </ul>

      {ticket.notes && (
        <p className="mb-4 text-xs italic text-white/60">&quot;{ticket.notes}&quot;</p>
      )}

      <button
        type="button"
        disabled={busy}
        onClick={handleBump}
        className="flex h-11 w-full items-center justify-center rounded-xl bg-[var(--accent)] text-sm font-bold text-[var(--accent-ink)] active:scale-95 disabled:opacity-50"
      >
        {busy ? 'Memproses...' : BUMP_LABEL[ticket.status]}
      </button>
    </div>
  );
}

function KitchenBoard() {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [activeStation, setActiveStation] = useState<Station | null>(null);

  function reload() {
    apiFetch('/api/v1/kitchen/tickets').then(setTickets).catch(() => setTickets([]));
  }

  useEffect(() => { reload(); }, []);

  useRealtimeEvents((event) => {
    if (event.type === 'kitchen_ticket.updated') reload();
  });

  const stations = useMemo(() => {
    if (!tickets) return [];
    return Array.from(new Set(tickets.map((t) => t.station)));
  }, [tickets]);

  const showStationTabs = stations.length > 1;

  const visibleTickets = useMemo(() => {
    if (!tickets) return [];
    if (!showStationTabs || !activeStation) return tickets;
    return tickets.filter((t) => t.station === activeStation);
  }, [tickets, showStationTabs, activeStation]);

  async function bump(id: string, status: TicketStatus) {
    await apiFetch(`/api/v1/kitchen/tickets/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
    reload();
  }

  if (!tickets) {
    return <p className="py-16 text-center text-white/60">Memuat tiket dapur...</p>;
  }

  return (
    <>
      {showStationTabs && (
        <div className="mb-4 flex gap-2">
          <button
            onClick={() => setActiveStation(null)}
            className={`h-9 rounded-full px-4 text-sm font-medium ${activeStation === null ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'border border-white/20 text-white/80'}`}
          >
            Semua
          </button>
          {stations.map((s) => (
            <button
              key={s}
              onClick={() => setActiveStation(s)}
              className={`h-9 rounded-full px-4 text-sm font-medium capitalize ${activeStation === s ? 'bg-[var(--accent)] text-[var(--accent-ink)]' : 'border border-white/20 text-white/80'}`}
            >
              {s === 'dapur' ? 'Dapur' : 'Bar'}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const colTickets = visibleTickets.filter((t) => t.status === col.status);
          return (
            <div key={col.status} className="rounded-2xl bg-white/[0.03] p-3">
              <h2 className="mb-3 flex items-center justify-between px-1 text-sm font-bold uppercase tracking-wide text-white/70">
                {col.title}
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs tabular-nums">{colTickets.length}</span>
              </h2>
              <div className="space-y-3">
                {colTickets.map((t) => (
                  <TicketCard key={t.id} ticket={t} onBump={bump} />
                ))}
                {colTickets.length === 0 && (
                  <p className="py-6 text-center text-xs text-white/40">Tidak ada tiket</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export default function DapurPage() {
  return (
    <div className="-m-4 min-h-screen bg-[#1a1310] p-4 sm:-m-6 sm:p-6">
      <h1 className="mb-4 text-xl font-bold text-white">Kitchen Display System</h1>
      <PlanGate featureKey="kitchen_display" featureLabel="Kitchen Display System">
        <KitchenBoard />
      </PlanGate>
    </div>
  );
}
