import type { NextConfig } from 'next';

// ponytail: dev lokal tanpa Docker/Nginx — proxy langsung ke auth-service/tenant-service.
// Di produksi, set NEXT_PUBLIC_API_URL ke domain nginx gateway (mis. api.inspirapos.biz.id)
// supaya apiFetch() manggil situ langsung dan rewrites ini tidak kepakai.
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
const TENANT_SERVICE_URL = process.env.TENANT_SERVICE_URL || 'http://localhost:3002';

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      { source: '/api/v1/auth/:path*', destination: `${AUTH_SERVICE_URL}/api/v1/auth/:path*` },
      { source: '/api/v1/admin/:path*', destination: `${TENANT_SERVICE_URL}/api/v1/admin/:path*` },
      { source: '/api/v1/tenants/:path*', destination: `${TENANT_SERVICE_URL}/api/v1/tenants/:path*` },
    ];
  },
};

export default nextConfig;
