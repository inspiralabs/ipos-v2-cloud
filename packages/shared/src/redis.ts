import Redis from 'ioredis';

export function createRedis(url: string) {
  return new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 3 });
}

export type RedisClient = ReturnType<typeof createRedis>;
