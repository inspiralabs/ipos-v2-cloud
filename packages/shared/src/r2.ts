import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Cloudflare R2 — S3-compatible, jadi cukup S3Client dengan endpoint R2, tidak perlu SDK khusus.
// Env wajib: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL
// (R2_PUBLIC_URL = https://assets.inspirapos.biz.id, custom domain bucket, tanpa trailing slash).
export function createR2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
};

export function extensionForMimeType(mimeType: string): string | null {
  return ALLOWED_TYPES[mimeType] ?? null;
}

/** Upload lalu return URL publik lewat custom domain — key overwrite (ganti foto = upload ulang ke key sama). */
export async function uploadToR2(client: S3Client, key: string, body: Buffer, contentType: string) {
  await client.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: key,
    Body: body,
    ContentType: contentType,
  }));
  return `${process.env.R2_PUBLIC_URL}/${key}`;
}
