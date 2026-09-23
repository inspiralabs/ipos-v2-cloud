import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { buildErrorHandler } from './error-handler.js';

function fakeReply() {
  const sent: { code?: number; body?: any } = {};
  return { sent, code(c: number) { sent.code = c; return this; }, send(b: any) { sent.body = b; return this; } };
}
const silentLog = { error: () => {} };

test('ZodError jadi 400, bukan 500', () => {
  const handler = buildErrorHandler(silentLog);
  let err: unknown;
  try { z.object({ email: z.string().email() }).parse({ email: 'bukan-email' }); } catch (e) { err = e; }
  const reply = fakeReply();
  handler(err as any, {} as any, reply as any);
  assert.equal(reply.sent.code, 400);
  assert.equal(reply.sent.body.code, 'VALIDATION_ERROR');
});

test('ZodError menyebut field yang salah, tanpa dump isu mentah', () => {
  const handler = buildErrorHandler(silentLog);
  let err: unknown;
  try { z.object({ email: z.string().email() }).parse({ email: 'x' }); } catch (e) { err = e; }
  const reply = fakeReply();
  handler(err as any, {} as any, reply as any);
  assert.match(reply.sent.body.error, /email/);
  assert.equal(reply.sent.body.issues, undefined, 'jangan kirim array issues Zod ke klien');
});

test('error tanpa statusCode jadi 500 dengan pesan generik', () => {
  const handler = buildErrorHandler(silentLog);
  const pgErr = Object.assign(new Error('duplicate key value violates unique constraint "users_email_unique"'), {
    code: '23505',
  });
  const reply = fakeReply();
  handler(pgErr as any, {} as any, reply as any);
  assert.equal(reply.sent.code, 500);
  assert.equal(reply.sent.body.code, 'INTERNAL_ERROR');
  assert.doesNotMatch(reply.sent.body.error, /users_email_unique|duplicate key/,
    'nama constraint Postgres tidak boleh bocor ke klien');
});

test('error dengan statusCode 4xx tetap meneruskan pesannya', () => {
  const handler = buildErrorHandler(silentLog);
  const err = Object.assign(new Error('Terlalu banyak percobaan'), { statusCode: 429, code: 'RATE_LIMITED' });
  const reply = fakeReply();
  handler(err as any, {} as any, reply as any);
  assert.equal(reply.sent.code, 429);
  assert.equal(reply.sent.body.error, 'Terlalu banyak percobaan');
  assert.equal(reply.sent.body.code, 'RATE_LIMITED');
});

test('error 5xx dengan statusCode tetap disembunyikan', () => {
  const handler = buildErrorHandler(silentLog);
  const err = Object.assign(new Error('ECONNREFUSED 10.0.0.5:5432'), { statusCode: 503 });
  const reply = fakeReply();
  handler(err as any, {} as any, reply as any);
  assert.equal(reply.sent.code, 503);
  assert.doesNotMatch(reply.sent.body.error, /10\.0\.0\.5/, 'alamat internal tidak boleh bocor');
});

test('error tetap di-log lengkap walau respons disamarkan', () => {
  const logged: unknown[] = [];
  const handler = buildErrorHandler({ error: (o) => logged.push(o) });
  handler(new Error('rahasia internal') as any, {} as any, fakeReply() as any);
  assert.equal(logged.length, 1, 'operator tetap butuh detailnya di log');
});
