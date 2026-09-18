import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '@ipos-cloud/drizzle-schema';

/**
 * Pool WAJIB punya listener 'error'. Tanpa itu, error pada koneksi idle (Postgres
 * restart, NAT timeout) di-emit tanpa handler dan Node mematikan seluruh proses.
 * Default handler cukup nge-log ke stderr; service boleh mengoper logger-nya sendiri.
 */
export function createDb(connectionString: string, onError?: (err: Error) => void) {
  const pool = new Pool({ connectionString, max: 10 });
  pool.on('error', onError ?? ((err) => console.error('[db] idle client error:', err.message)));
  return drizzle(pool, { schema });
}

export type Db = ReturnType<typeof createDb>;
