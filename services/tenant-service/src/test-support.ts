import crypto from 'node:crypto';
import { generateKeyPairSync } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';

// Keypair ephemeral — test tidak boleh bergantung pada .env atau kunci produksi.
// tenant-service produksi cuma register public key (cuma perlu VERIFY token dari
// auth-service); test butuh private key juga supaya bisa MENANDATANGANI token palsu.
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
export const TEST_KEYS = { private: privateKey, public: publicKey };

type Write = { op: 'insert' | 'update' | 'delete'; table: string; values?: any };

/**
 * Stub Drizzle: rantai select/insert/update/delete yang dipakai route tenant-service.
 * `tables` dikunci dengan nama tabel Postgres (mis. 'tenants', 'users'). insert()/update()
 * mensintesis `id` acak kalau `values` tidak menyertakannya (DB asli mengisi lewat
 * defaultRandom()) supaya alur "insert baris A, lalu tautkan ke baris B" (Task 5) bisa
 * diuji tanpa database hidup. `.transaction(fn)` cuma memanggil fn dengan db yang sama —
 * tidak ada rollback sungguhan, cukup untuk menguji ALUR kode, bukan atomisitas Postgres.
 */
export function fakeDb(tables: Record<string, unknown[]>) {
  const writes: Write[] = [];
  const nameOf = (t: any) => String(t?.[Symbol.for('drizzle:Name')] ?? '');
  const project = (row: any, cols?: Record<string, unknown>) =>
    cols ? Object.fromEntries(Object.keys(cols).map((k) => [k, row[k]])) : row;

  const db: any = {
    _writes: writes,
    select: (_cols?: unknown) => ({
      from: (t: any) => {
        const rows = tables[nameOf(t)] ?? [];
        const chain = {
          where: () => chain,
          orderBy: () => chain,
          limit: () => Promise.resolve(rows),
          then: (r: any, j: any) => Promise.resolve(rows).then(r, j),
        };
        return chain;
      },
    }),
    insert: (t: any) => ({
      values: (v: any) => {
        const row = { id: v?.id ?? crypto.randomUUID(), ...v };
        writes.push({ op: 'insert', table: nameOf(t), values: row });
        return {
          returning: (cols?: Record<string, unknown>) => Promise.resolve([project(row, cols)]),
          then: (r: any, j: any) => Promise.resolve([row]).then(r, j),
        };
      },
    }),
    update: (t: any) => ({
      set: (v: any) => {
        writes.push({ op: 'update', table: nameOf(t), values: v });
        const chain = {
          where: () => chain,
          returning: (cols?: Record<string, unknown>) => Promise.resolve([project(v, cols)]),
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
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  };
  return db;
}

export async function buildTestApp(opts: {
  db: unknown;
  routes: Array<[(app: FastifyInstance) => Promise<void>, string]>;
}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  await app.register(jwt, {
    secret: { private: TEST_KEYS.private, public: TEST_KEYS.public },
    sign: { algorithm: 'RS256' },
  });
  app.decorate('db', opts.db);
  for (const [route, prefix] of opts.routes) await app.register(route, { prefix });
  await app.ready();
  return app;
}
