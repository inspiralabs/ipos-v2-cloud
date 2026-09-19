export const MAX_PIN_ATTEMPTS = 5;
export const PIN_LOCKOUT_SECONDS = 900; // 15 menit

export type RedisLike = {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<unknown>;
};

// Dikunci per user_id, BUKAN per IP: beberapa kasir berbagi satu perangkat & satu IP,
// jadi kunci per-IP akan mengunci seluruh toko begitu satu orang salah ketik.
const key = (userId: string) => `pin:fail:${userId}`;

/** Naikkan penghitung gagal dan pastikan TTL selalu terpasang. Mengembalikan jumlah gagal terkini. */
export async function registerFailedPin(redis: RedisLike, userId: string): Promise<number> {
  const k = key(userId);
  const count = await redis.incr(k);
  // EXPIRE di-set tiap kali (bukan cuma saat count === 1): lockout memanjang selama
  // penyerang terus mencoba, dan kasir yang berhenti mencoba pulih otomatis.
  await redis.expire(k, PIN_LOCKOUT_SECONDS);
  return count;
}

export async function isPinLocked(redis: RedisLike, userId: string): Promise<boolean> {
  const raw = await redis.get(key(userId));
  return raw !== null && Number(raw) >= MAX_PIN_ATTEMPTS;
}

export async function clearPinAttempts(redis: RedisLike, userId: string): Promise<void> {
  await redis.del(key(userId));
}
