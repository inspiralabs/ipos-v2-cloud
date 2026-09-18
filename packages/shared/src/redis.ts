import Redis from 'ioredis';

/**
 * Sama seperti Pool di db.ts: event 'error' tanpa listener = proses mati.
 * kitchen-service, table-service, dan websocket-gateway semuanya bergantung
 * pada ini, jadi Redis yang di-restart tidak boleh menjatuhkan mereka.
 */
export function createRedis(url: string, onError?: (err: Error) => void) {
  const redis = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 3 });
  redis.on('error', onError ?? ((err) => console.error('[redis]', err.message)));
  return redis;
}

export type RedisClient = ReturnType<typeof createRedis>;
