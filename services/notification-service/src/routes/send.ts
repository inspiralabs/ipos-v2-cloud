import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { notification_templates } from '@ipos-cloud/drizzle-schema';
import { sendEmail, renderTemplate } from '../email.js';

// Dipanggil service lain (tenant-service dsb), bukan dari browser — diamankan dengan
// shared secret INTERNAL_API_KEY (lihat requireInternalAuth di index.ts), bukan JWT user.
// ponytail: service ini tidak pernah diakses langsung dari internet (tidak ada route nginx
// publik ke /api/v1/notify), jadi shared-secret header cukup — full service-to-service JWT
// baru perlu kalau nanti ada exposure publik atau butuh audit identitas pemanggil per-request.
const FALLBACK_SUBJECT: Record<string, string> = {
  'tenant.invitation': 'Akun Inspira POS kamu sudah siap',
  'password.reset': 'Reset password Inspira POS kamu',
  'notif.test': 'Notifikasi test Inspira POS',
};
const FALLBACK_BODY: Record<string, string> = {
  'tenant.invitation': `
    <p>Halo {{name}},</p>
    <p>Akun toko <strong>{{tenant_name}}</strong> di Inspira POS sudah dibuat.</p>
    <p>Email: {{email}}<br/>Password sementara: <strong>{{password}}</strong></p>
    <p>Segera login dan ganti password kamu.</p>
  `,
  'password.reset': `
    <p>Halo {{name}},</p>
    <p>Kami menerima permintaan reset password untuk akun Inspira POS kamu.</p>
    <p><a href="{{reset_url}}">Klik di sini untuk atur password baru</a> (berlaku 1 jam).</p>
    <p>Kalau kamu tidak meminta ini, abaikan saja email ini — password kamu tetap aman.</p>
  `,
  'notif.test': `
    <p>Halo {{name}},</p>
    <p>Ini email test dari Inspira POS. Kalau kamu menerima email ini, notifikasi email toko kamu berfungsi normal.</p>
  `,
};

export async function sendRoutes(app: FastifyInstance) {
  app.post('/send', async (request: any, reply) => {
    const body = z.object({
      template_key: z.string(),
      to: z.string().email(),
      vars: z.record(z.string()).default({}),
    }).parse(request.body);

    const db = (app as any).db;
    const [template] = await db.select().from(notification_templates)
      .where(eq(notification_templates.key, body.template_key)).limit(1);

    if (template && !template.is_active) {
      return reply.code(422).send({ error: 'Template nonaktif', code: 'TEMPLATE_INACTIVE' });
    }

    const subject = template?.subject ?? FALLBACK_SUBJECT[body.template_key];
    const bodyHtml = template?.body_email ?? FALLBACK_BODY[body.template_key];
    if (!subject || !bodyHtml) {
      return reply.code(404).send({ error: 'Template tidak ditemukan', code: 'TEMPLATE_NOT_FOUND' });
    }

    await sendEmail(body.to, renderTemplate(subject, body.vars), renderTemplate(bodyHtml, body.vars));
    return { ok: true };
  });
}
