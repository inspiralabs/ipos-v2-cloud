'use client';

import { useEffect, useRef } from 'react';
import { getToken } from '@/lib/auth';

type RealtimeEvent =
  | { type: 'order.created'; order_id: string; table_number: string | null }
  | { type: 'kitchen_ticket.updated'; order_id: string; status: string }
  | { type: 'table.updated'; table_id: string; status: string };

// ponytail: exponential backoff sederhana, dicap di 30s — cukup untuk WS gateway lokal/single-region,
// upgrade ke jitter kalau nanti ada ribuan tenant reconnect bareng (thundering herd).
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 30000;

/** Konek ke websocket-gateway (KDS/floor map real-time), auto-reconnect kalau putus. */
export function useRealtimeEvents(onEvent: (event: RealtimeEvent) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const token = getToken();
    if (!token) return;

    let socket: WebSocket;
    let attempt = 0;
    let closedByEffect = false;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      const wsUrl = (process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost/ws') + `?token=${token}`;
      socket = new WebSocket(wsUrl);

      socket.onopen = () => { attempt = 0; };
      socket.onmessage = (e) => {
        try { onEventRef.current(JSON.parse(e.data)); } catch { /* pesan tidak valid, abaikan */ }
      };
      socket.onclose = () => {
        if (closedByEffect) return;
        const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
        attempt += 1;
        reconnectTimer = setTimeout(connect, delay);
      };
    }
    connect();

    return () => {
      closedByEffect = true;
      clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, []);
}
