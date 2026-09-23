import { ZodError } from 'zod';
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

type Logger = { error: (obj: unknown) => void };

/**
 * Aturannya: klien hanya boleh melihat pesan yang MEMANG ditulis untuk dilihat klien.
 * - ZodError -> 400 + nama field yang salah (tanpa array issues mentah)
 * - 4xx yang kita lempar sendiri -> pesannya diteruskan
 * - sisanya (termasuk error Postgres) -> pesan generik; detailnya hanya ke log
 */
export function buildErrorHandler(log: Logger) {
  return function errorHandler(
    error: FastifyError & { statusCode?: number; code?: string },
    _request: FastifyRequest,
    reply: FastifyReply
  ) {
    log.error(error);

    if (error instanceof ZodError) {
      const fields = [...new Set(error.issues.map((i) => i.path.join('.')).filter(Boolean))];
      return reply.code(400).send({
        error: fields.length
          ? `Data tidak valid pada: ${fields.join(', ')}`
          : 'Data yang dikirim tidak valid.',
        code: 'VALIDATION_ERROR',
      });
    }

    const status = error.statusCode ?? 500;
    if (status >= 400 && status < 500) {
      return reply.code(status).send({ error: error.message, code: error.code || 'BAD_REQUEST' });
    }

    return reply.code(status).send({
      error: 'Terjadi kesalahan di server. Coba lagi beberapa saat lagi.',
      code: 'INTERNAL_ERROR',
    });
  };
}
