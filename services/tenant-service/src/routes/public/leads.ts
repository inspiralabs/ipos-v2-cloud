import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { leads, lead_notes } from '@ipos-cloud/drizzle-schema';

const createLeadBody = z.object({
  name: z.string().min(1),
  business_name: z.string().min(1),
  phone: z.string().min(1),
  // email opsional di form — klien yang tidak isi mengirim string kosong, bukan field yang hilang,
  // jadi literal('') harus diterima juga di sini, .optional() saja cuma menerima undefined.
  email: z.union([z.literal(''), z.string().email()]).optional(),
  business_type: z.string().optional(),
  business_type_other: z.string().optional(), // diisi kalau business_type = 'lainnya'
  product_interest: z.string().optional(),
  notes: z.string().optional(), // catatan awal klien — wajib diisi di form saat product_interest = 'unknown'
  source: z.string().optional(),
  website: z.string().optional(), // honeypot — harus kosong, diisi bot
});

export async function publicLeadsRoutes(app: FastifyInstance) {
  app.post('/', async (request, reply) => {
    const body = createLeadBody.parse(request.body);

    // ponytail: honeypot only, tambah @fastify/rate-limit kalau mulai kena spam beneran.
    if (body.website) {
      return reply.code(201).send({ ok: true });
    }

    const db = (app as any).db;
    const [created] = await db.insert(leads).values({
      name: body.name,
      business_name: body.business_name,
      phone: body.phone,
      email: body.email || undefined,
      business_type: body.business_type,
      business_type_other: body.business_type_other,
      product_interest: body.product_interest,
      source: body.source || 'landing_demo',
      // ipos-offline dapat lisensi trial otomatis (14 hari) begitu daftar, jadi lead-nya
      // langsung 'trial' — bukan 'baru' yang berarti masih perlu dihubungi dulu.
      status: body.product_interest === 'offline' ? 'trial' : undefined,
    }).returning();

    if (body.notes) {
      await db.insert(lead_notes).values({ lead_id: created.id, note: body.notes, author: 'client' });
    }

    return reply.code(201).send({ ok: true, id: created.id });
  });
}
