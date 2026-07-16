// ponytail: extracted dari index.ts supaya bisa diverifikasi lewat date-range.test.ts tanpa boot Fastify.
export function parseRange(from: string, to: string) {
  const fromDate = new Date(from + 'T00:00:00Z');
  const toDate = new Date(to + 'T23:59:59Z');
  const spanMs = toDate.getTime() - fromDate.getTime();
  const prevTo = new Date(fromDate.getTime() - 1000); // 1 second before current range starts
  const prevFrom = new Date(prevTo.getTime() - spanMs);
  return { fromDate, toDate, prevFrom, prevTo };
}
