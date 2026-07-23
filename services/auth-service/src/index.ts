import 'dotenv/config';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { createDb } from '@ipos-cloud/shared';

const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info' } });

app.register(cors, { origin: process.env.CORS_ORIGIN || true, credentials: true });
app.register(cookie);
// Default global: cukup longgar. Endpoint forgot/reset-password punya limit lebih ketat sendiri (lihat route masing-masing).
app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
app.register(jwt, {
  secret: {
    private: process.env.JWT_PRIVATE_KEY!.replace(/\\n/g, '\n'),
    public: process.env.JWT_PUBLIC_KEY!.replace(/\\n/g, '\n'),
  },
  sign: { algorithm: 'RS256', expiresIn: '15m' },
});

const db = createDb(process.env.DATABASE_URL!);

// Attach db to request for routes
app.decorate('db', db);

app.get('/health', async () => ({ status: 'ok', service: 'auth-service', version: '0.1.0' }));

// Routes
import { loginRoute } from './routes/login.js';
import { refreshRoute } from './routes/refresh.js';
import { logoutRoute } from './routes/logout.js';
import { otpRoutes } from './routes/otp.js';
import { impersonateRoute } from './routes/impersonate.js';
import { forgotPasswordRoute } from './routes/forgot-password.js';
import { resetPasswordRoute } from './routes/reset-password.js';
import { pinLoginRoutes } from './routes/pin-login.js';

app.register(loginRoute, { prefix: '/api/v1/auth' });
app.register(pinLoginRoutes, { prefix: '/api/v1/auth' });
app.register(refreshRoute, { prefix: '/api/v1/auth' });
app.register(logoutRoute, { prefix: '/api/v1/auth' });
app.register(otpRoutes, { prefix: '/api/v1/auth' });
app.register(impersonateRoute, { prefix: '/api/v1/admin' });
app.register(forgotPasswordRoute, { prefix: '/api/v1/auth' });
app.register(resetPasswordRoute, { prefix: '/api/v1/auth' });

app.setErrorHandler((error: Error & { statusCode?: number; code?: string }, _request, reply) => {
  app.log.error(error);
  reply.code(error.statusCode ?? 500).send({ error: error.message, code: error.code || 'INTERNAL_ERROR' });
});

const port = parseInt(process.env.PORT || '3001');
app.listen({ port, host: '0.0.0.0' }, (err) => {
  if (err) { app.log.error(err); process.exit(1); }
});
