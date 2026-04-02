'use client'

// ============================================================================
// Foot Stock — WebVitalsReporter
// Coleta Core Web Vitals (CLS, LCP, INP, FCP, TTFB) e reporta via
// sendBeacon + Sentry. Renderiza null — inclua no RootLayout.
// RESOLVED: T001 – Web Vitals não configurados
// ============================================================================

import { useReportWebVitals } from 'next/web-vitals'
import * as Sentry from '@sentry/nextjs'

export function WebVitalsReporter() {
  useReportWebVitals(metric => {
    // Sentry: captura como breadcrumb de performance
    Sentry.addBreadcrumb({
      category: 'web-vitals',
      message: `${metric.name}: ${Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value)}`,
      level: metric.rating === 'poor' ? 'warning' : 'info',
      data: {
        id: metric.id,
        name: metric.name,
        value: metric.value,
        rating: metric.rating,
        delta: metric.delta,
      },
    })

    // sendBeacon para endpoint próprio de métricas (fire-and-forget)
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon(
        '/api/v1/vitals',
        JSON.stringify({
          name: metric.name,
          value: metric.value,
          rating: metric.rating,
          id: metric.id,
          delta: metric.delta,
        })
      )
    }
  })

  return null
}
