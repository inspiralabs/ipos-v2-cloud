import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { offline_clients } from '@ipos-cloud/drizzle-schema';

// Kontrak HARUS sama persis dengan ipos-offline/src/lib/sync.ts (registerClient,
// checkLicenseStatus) — app kasir memanggil ini best-effort, tanpa auth, mirip
// ipos-v1-backend yang digantikan. Ganti kontrak di sini = ganti sync.ts juga.

const registerBody = z.object({
  storeName: z.string().min(1),
  phone: z.string().optional(),
  deviceId: z.string().min(1),
});

const TRIAL_DAYS = 14;

export async function publicOfflineRoutes(app: FastifyInstance) {
  // Daftarkan device baru — idempotent, deviceId yang sudah terdaftar tidak dibuat ulang.
  app.post('/register', async (request, reply) => {
    const body = registerBody.parse(request.body);
    const device_id_hash = body.deviceId.trim().toLowerCase();
    const db = (app as any).db;

    const [existing] = await db.select().from(offline_clients).where(eq(offline_clients.device_id_hash, device_id_hash)).limit(1);
    if (existing) return reply.code(200).send({ ok: true, status: existing.status });

    const trial_ends_at = new Date(Date.now() + TRIAL_DAYS * 86400000);
    await db.insert(offline_clients).values({
      device_id_hash,
      store_name: body.storeName,
      phone: body.phone || '',
      status: 'trial',
      trial_ends_at,
    });
    return reply.code(201).send({ ok: true, status: 'trial' });
  });

  // Cek status — app cuma peduli apakah server bilang 'EXPIRED' untuk paksa trial lokal berakhir.
  app.get('/license-status', async (request, reply) => {
    const { deviceId } = z.object({ deviceId: z.string().min(1) }).parse(request.query);
    const device_id_hash = deviceId.trim().toLowerCase();
    const db = (app as any).db;

    const [client] = await db.select().from(offline_clients).where(eq(offline_clients.device_id_hash, device_id_hash)).limit(1);
    if (!client) return reply.code(404).send({ error: 'Client not found', code: 'NOT_FOUND' });

    const trialExpired = client.status === 'trial' && client.trial_ends_at && new Date(client.trial_ends_at) < new Date();
    const licenseStatus = client.status === 'expired' || trialExpired ? 'EXPIRED' : client.status.toUpperCase();

    return { licenseStatus };
  });
}
