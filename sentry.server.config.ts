// ============================================================================
// Foot Stock — Sentry Server Configuration (Node.js / API Routes)
// Rastreabilidade: INT-110, module-27/TASK-1
// ============================================================================

import * as Sentry from '@sentry/nextjs'

// Graceful degradation: não inicializar sem DSN configurado
if (!process.env.SENTRY_DSN) {
  console.warn('[sentry:server] SENTRY_DSN não configurado — Sentry desabilitado')
} else {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    // Taxa de traces reduzida em produção para economizar cota
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 1.0,
    // profilesSampleRate removido em v10 — requer @sentry/profiling-node separado
    // Para reativar: npm install @sentry/profiling-node + nodeProfilingIntegration()
    debug: false,
    integrations: [
      // Rastrear queries Prisma lentas
      Sentry.prismaIntegration(),
    ],
    // PII scrubbing obrigatório — nunca enviar email, cookies ou tokens
    beforeSend(event) {
      if (event.user) {
        delete event.user.email
        delete event.user.ip_address
      }
      if (event.request) {
        delete event.request.cookies
        if (event.request.headers) {
          delete event.request.headers['authorization']
          delete event.request.headers['cookie']
        }
      }
      return event
    },
  })
}
