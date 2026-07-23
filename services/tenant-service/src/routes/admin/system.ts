import type { FastifyInstance } from 'fastify';
import { adminGuard } from '../../middleware/admin-guard.js';

const SERVICES = [
  { name: 'auth-service', url: process.env.AUTH_SERVICE_URL || 'http://auth-service:3001' },
  { name: 'pos-service', url: 'http://pos-service:3003' },
  { name: 'catalog-service', url: 'http://catalog-service:3004' },
  { name: 'inventory-service', url: 'http://inventory-service:3005' },
  { name: 'kitchen-service', url: 'http://kitchen-service:3006' },
  { name: 'table-service', url: 'http://table-service:3007' },
  { name: 'report-service', url: 'http://report-service:3008' },
  { name: 'notification-service', url: 'http://notification-service:3009' },
  { name: 'websocket-gateway', url: 'http://websocket-gateway:3011' },
];

export async function systemAdminRoutes(app: FastifyInstance) {
  app.get('/health', { preHandler: adminGuard }, async () => {
    const checks = await Promise.allSettled(
      SERVICES.map(async (s) => {
        const res = await fetch(`${s.url}/health`, { signal: AbortSignal.timeout(3000) });
        return { name: s.name, status: res.ok ? 'ok' : 'error' };
      })
    );
    return checks.map((r, i) =>
      r.status === 'fulfilled' ? r.value : { name: SERVICES[i].name, status: 'error' }
    );
  });
}
