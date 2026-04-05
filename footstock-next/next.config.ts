import type { NextConfig } from "next";
import { withSentryConfig } from '@sentry/nextjs';

const baseOrigin = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
// Suportar tanto domínio principal quanto www.
const wwwOrigin = baseOrigin.includes('localhost')
  ? baseOrigin
  : baseOrigin.replace('https://', 'https://www.')
const allowedOrigins = [baseOrigin, wwwOrigin]

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: allowedOrigins.join(', '),
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization, x-user-id, x-club-name, x-admin-id',
          },
          {
            key: 'Access-Control-Allow-Credentials',
            value: 'true',
          },
        ],
      },
    ]
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
  automaticVercelMonitors: true,
});
