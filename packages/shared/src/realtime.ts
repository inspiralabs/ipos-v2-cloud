import type { RedisClient } from './redis.js';

// Satu channel Redis per tenant — websocket-gateway subscribe ke pattern 'tenant:*:events'
// dan cuma forward ke socket yang tenant_id-nya cocok.
export const tenantEventsChannel = (tenantId: string) => `tenant:${tenantId}:events`;

export type RealtimeEvent =
  | { type: 'order.created'; order_id: string; table_number: string | null }
  | { type: 'kitchen_ticket.updated'; order_id: string; status: string }
  | { type: 'table.updated'; table_id: string; status: string };

export function publishTenantEvent(redis: RedisClient, tenantId: string, event: RealtimeEvent) {
  return redis.publish(tenantEventsChannel(tenantId), JSON.stringify(event));
}
