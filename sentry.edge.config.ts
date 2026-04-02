// ============================================================================
// Foot Stock — Sentry Edge Configuration (Edge Functions / Middleware)
// Rastreabilidade: INT-110, module-27/TASK-1
// ============================================================================

import * as Sentry from '@sentry/nextjs'

// Graceful degradation: não inicializar sem DSN configurado
if (!process.env.SENTRY_DSN) {
  console.warn('[sentry:edge] SENTRY_DSN não configurado — Sentry desabilitado')
} else {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    // Taxa mínima para Edge (evitar overhead em funções críticas de roteamento)
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.01 : 1.0,
    debug: false,
    // Sem prismaIntegration e sem replay — não disponíveis em Edge runtime
  })
}
