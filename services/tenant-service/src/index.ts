import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import { createDb, createR2Client } from '@ipos-cloud/shared';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info' } });

app.register(cors, { origin: process.env.CORS_ORIGIN?.split(',') || true, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] });
app.register(jwt, {
  secret: { public: process.env.JWT_PUBLIC_KEY!.replace(/\\n/g, '\n') },
});
app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 } });

const db = createDb(process.env.DATABASE_URL!);
app.decorate('db', db);
app.decorate('r2', createR2Client());

app.get('/health', async () => ({ status: 'ok', service: 'tenant-service', version: '0.1.0' }));

import { tenantsAdminRoutes } from './routes/admin/tenants.js';
import { featureOverridesAdminRoutes } from './routes/admin/feature-overrides.js';
import { offlineAdminRoutes } from './routes/admin/offline.js';
import { leadsAdminRoutes } from './routes/admin/leads.js';
import { billingAdminRoutes } from './routes/admin/billing.js';
import { auditAdminRoutes } from './routes/admin/audit.js';
import { systemAdminRoutes } from './routes/admin/system.js';
import { adminsAdminRoutes } from './routes/admin/admins.js';
import { publicLeadsRoutes } from './routes/public/leads.js';
import { publicOfflineRoutes } from './routes/public/offline.js';
import { tenantMeRoutes } from './routes/tenant/me.js';
import { tenantUsersRoutes } from './routes/tenant/users.js';
import { tenantCustomersRoutes } from './routes/tenant/customers.js';
import { tenantBranchesRoutes, tenantTransfersRoutes } from './routes/tenant/branches.js';
import { tenantAttendanceRoutes } from './routes/tenant/attendance.js';
import { tenantLoyaltyRoutes } from './routes/tenant/loyalty.js';

app.register(tenantsAdminRoutes, { prefix: '/api/v1/admin/tenants' });
app.register(featureOverridesAdminRoutes, { prefix: '/api/v1/admin/tenants' });
app.register(offlineAdminRoutes, { prefix: '/api/v1/admin/offline' });
app.register(leadsAdminRoutes, { prefix: '/api/v1/admin/leads' });
app.register(billingAdminRoutes, { prefix: '/api/v1/admin/billing' });
app.register(auditAdminRoutes, { prefix: '/api/v1/admin/audit-logs' });
app.register(systemAdminRoutes, { prefix: '/api/v1/admin/system' });
app.register(adminsAdminRoutes, { prefix: '/api/v1/admin/admins' });
app.register(publicLeadsRoutes, { prefix: '/api/v1/public/leads' });
// Kontrak path HARUS /api/clients/* — sama persis dengan yang dipanggil
// ipos-offline/src/lib/sync.ts (warisan dari ipos-v1-backend yang digantikan).
app.register(publicOfflineRoutes, { prefix: '/api/clients' });
app.register(tenantMeRoutes, { prefix: '/api/v1/tenants' });
app.register(tenantUsersRoutes, { prefix: '/api/v1/tenants/users' });
app.register(tenantCustomersRoutes, { prefix: '/api/v1/tenants/customers' });
app.register(tenantBranchesRoutes, { prefix: '/api/v1/tenants/branches' });
app.register(tenantTransfersRoutes, { prefix: '/api/v1/tenants/transfers' });
app.register(tenantAttendanceRoutes, { prefix: '/api/v1/tenants/attendance' });
app.register(tenantLoyaltyRoutes, { prefix: '/api/v1/tenants/loyalty' });

app.setErrorHandler((error: Error & { statusCode?: number; code?: string }, _request, reply) => {
  app.log.error(error);
  reply.code(error.statusCode ?? 500).send({ error: error.message, code: error.code || 'INTERNAL_ERROR' });
});

const port = parseInt(process.env.PORT || '3002');
app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) { app.log.error(err); process.exit(1); }
});
