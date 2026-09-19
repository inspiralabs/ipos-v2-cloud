import { generateKeyPairSync } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';

// Keypair ephemeral — test tidak boleh bergantung pada .env atau kunci produksi.
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
export const TEST_KEYS = { private: privateKey, public: publicKey };

type Write = { op: 'insert' | 'update' | 'delete'; table: string; values?: unknown };

/**
 * Stub Drizzle secukupnya untuk route auth: rantai select/insert/update/delete
 * yang dipakai login, refresh, logout, pin-login, forgot/reset-password.
 * `tables` dikunci dengan nama tabel Postgres (mis. 'users', 'sessions').
 */
export function fakeDb(tables: Record<string, unknown[]>) {
  const writes: Write[] = [];
  // Sudah diverifikasi terhadap drizzle-orm 0.36: Symbol.for('drizzle:Name') pada objek
  // tabel mengembalikan nama tabel Postgres ('users', 'sessions', ...). `t._.name` undefined.
  const nameOf = (t: any) => String(t?.[Symbol.for('drizzle:Name')] ?? '');

  const db: any = {
    _writes: writes,
    select: (_cols?: unknown) => ({
      from: (t: any) => {
        const rows = tables[nameOf(t)] ?? [];
        const chain = {
          where: () => chain,
          limit: () => Promise.resolve(rows),
          then: (r: any, j: any) => Promise.resolve(rows).then(r, j),
        };
        return chain;
      },
    }),
    insert: (t: any) => ({
      values: (v: unknown) => {
        writes.push({ op: 'insert', table: nameOf(t), values: v });
        return {
          returning: () => Promise.resolve([v]),
          then: (r: any, j: any) => Promise.resolve([v]).then(r, j),
        };
      },
    }),
    update: (t: any) => ({
      set: (v: unknown) => {
        writes.push({ op: 'update', table: nameOf(t), values: v });
        const chain = {
          where: () => chain,
          returning: () => Promise.resolve([v]),
          then: (r: any, j: any) => Promise.resolve([v]).then(r, j),
        };
        return chain;
      },
    }),
    delete: (t: any) => {
      writes.push({ op: 'delete', table: nameOf(t) });
      const chain = { where: () => Promise.resolve([]), then: (r: any, j: any) => Promise.resolve([]).then(r, j) };
      return chain;
    },
  };
  return db;
}

export async function buildTestApp(opts: {
  db: unknown;
  redis?: unknown;
  routes: Array<[(app: FastifyInstance) => Promise<void>, string]>;
}): Promise<FastifyInstance> {
  // trustProxy: true — sama seperti produksi, supaya test rate limit memakai IP klien sebenarnya.
  const app = Fastify({ logger: false, trustProxy: true });
  await app.register(cookie);
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });
  await app.register(jwt, {
    secret: { private: TEST_KEYS.private, public: TEST_KEYS.public },
    sign: { algorithm: 'RS256', expiresIn: '15m' },
  });
  app.decorate('db', opts.db);
  if (opts.redis) app.decorate('redis', opts.redis);
  for (const [route, prefix] of opts.routes) await app.register(route, { prefix });
  await app.ready();
  return app;
}
