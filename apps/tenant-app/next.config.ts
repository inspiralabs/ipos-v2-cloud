import type { NextConfig } from 'next';

// ponytail: dev lokal tanpa Docker/Nginx — proxy langsung ke tiap service.
// Sama pola dengan apps/admin-app/next.config.ts.
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
const TENANT_SERVICE_URL = process.env.TENANT_SERVICE_URL || 'http://localhost:3002';
const POS_SERVICE_URL = process.env.POS_SERVICE_URL || 'http://localhost:3003';
const CATALOG_SERVICE_URL = process.env.CATALOG_SERVICE_URL || 'http://localhost:3004';
const REPORT_SERVICE_URL = process.env.REPORT_SERVICE_URL || 'http://localhost:3008';

const nextConfig: NextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      { source: '/api/v1/auth/:path*', destination: `${AUTH_SERVICE_URL}/api/v1/auth/:path*` },
      { source: '/api/v1/tenants/:path*', destination: `${TENANT_SERVICE_URL}/api/v1/tenants/:path*` },
      { source: '/api/v1/pos/:path*', destination: `${POS_SERVICE_URL}/api/v1/pos/:path*` },
      { source: '/api/v1/catalog/:path*', destination: `${CATALOG_SERVICE_URL}/api/v1/catalog/:path*` },
      { source: '/api/v1/reports/:path*', destination: `${REPORT_SERVICE_URL}/api/v1/reports/:path*` },
    ];
  },
};

export default nextConfig;
