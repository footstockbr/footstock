import type { NextConfig } from 'next'
import { withSentryConfig } from '@sentry/nextjs'
import withBundleAnalyzer from '@next/bundle-analyzer'

const analyzeBundle = withBundleAnalyzer({
  enabled: process.env.ANALYZE === 'true',
})

const isDev = process.env.NODE_ENV === 'development'

// CSP wildcards no meio de hostname são inválidos (ex: o*.ingest.sentry.io).
// Use o DSN real do Sentry para obter o host exato (ex: o123456.ingest.sentry.io).
const sentryIngestHost = process.env.SENTRY_INGEST_HOST ?? 'https://ingest.sentry.io'

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      // 'unsafe-eval' necessário em dev para Next.js Fast Refresh (webpack HMR).
      // Em produção é removido para manter B6.
      `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''} https://js.sentry-cdn.com`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https:",
      "font-src 'self' https://fonts.gstatic.com",
      `connect-src 'self' https://*.supabase.co ${sentryIngestHost} wss://*.supabase.co`,
      // Sentry Replay cria Web Workers a partir de blob URLs para compressão de sessão.
      // Sem worker-src o browser usa script-src como fallback, que bloqueia blob:.
      "worker-src blob:",
      "frame-ancestors 'none'",
    ].join('; '),
  },
]

const nextConfig: NextConfig = {
  poweredByHeader: false,

  async headers() {
    const allowedOrigins = process.env.ALLOWED_ORIGINS ?? 'https://footstock.com.br'
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      // CORS explícito para API routes (A13)
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: allowedOrigins },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PATCH,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type,Authorization' },
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
        ],
      },
    ]
  },

  async rewrites() {
    return []
  },

  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'flagcdn.com' },
    ],
    formats: ['image/avif', 'image/webp'],
  },

  logging: {
    fetches: { fullUrl: process.env.NODE_ENV === 'development' },
  },
}

export default withSentryConfig(analyzeBundle(nextConfig), {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  // widenClientFileUpload removido em v10 (comportamento padrão)
  // hideSourceMaps removido em v10 — usar sourcemaps.disable
  // sourcemaps habilitados em produção (TASK-P2-05) — requer SENTRY_AUTH_TOKEN no build
  sourcemaps: { disable: isDev },
  disableLogger: true,
  // Tunelamento para evitar ad-blockers
  tunnelRoute: '/monitoring',
})
