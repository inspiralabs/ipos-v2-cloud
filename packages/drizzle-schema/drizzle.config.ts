import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';

config({ path: '../../.env' });

export default defineConfig({
  schema: './dist/index.js',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
  schemaFilter: ['inspirapos_v2'],
});
