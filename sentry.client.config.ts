// ============================================================================
// Foot Stock — Sentry Client Configuration (browser)
// Rastreabilidade: INT-110, module-27/TASK-1
// ============================================================================

import * as Sentry from '@sentry/nextjs'

// Graceful degradation: não inicializar sem DSN configurado
if (!process.env.NEXT_PUBLIC_SENTRY_DSN) {
  console.warn('[sentry:client] NEXT_PUBLIC_SENTRY_DSN não configurado — Sentry desabilitado')
} else {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    // Replay: 1% das sessões normais, 100% das sessões com erro
    replaysSessionSampleRate: 0.01,
    replaysOnErrorSampleRate: 1.0,
    debug: false,
    integrations: [
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],
    // Filtrar erros de extensões de browser (não poluir o dashboard)
    beforeSend(event) {
      if (
        event.exception?.values?.[0]?.stacktrace?.frames?.some(
          frame =>
            frame.filename &&
            typeof window !== 'undefined' &&
            !frame.filename.startsWith(window.location.origin) &&
            !frame.filename.startsWith('<')
        )
      ) {
        return null
      }
      return event
    },
  })
}
