import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  beforeSend(event) {
    // Strip PII from all events
    if (event.request?.data) {
      const data = event.request.data as Record<string, unknown>
      const piiFields = ['cpf', 'cpfHash', 'cpf_hash', 'email', 'password', 'token', 'accessToken', 'refreshToken', 'phone', 'name']
      for (const field of piiFields) {
        if (field in data) {
          data[field] = '[REDACTED]'
        }
      }
    }

    // Strip PII from breadcrumbs
    if (event.breadcrumbs) {
      event.breadcrumbs = event.breadcrumbs.map(breadcrumb => {
        if (breadcrumb.data) {
          const piiFields = ['cpf', 'email', 'password', 'token', 'phone']
          for (const field of piiFields) {
            if (field in breadcrumb.data) {
              breadcrumb.data[field] = '[REDACTED]'
            }
          }
        }
        return breadcrumb
      })
    }

    // Strip user email/IP from context
    if (event.user) {
      delete event.user.email
      delete event.user.ip_address
      // Keep user.id for debugging
    }

    return event
  },

  beforeBreadcrumb(breadcrumb) {
    // Remove fetch breadcrumbs that might contain tokens in URLs
    if (breadcrumb.category === 'fetch' && breadcrumb.data?.url) {
      const url = breadcrumb.data.url as string
      if (url.includes('token=') || url.includes('key=')) {
        breadcrumb.data.url = url.replace(/([?&])(token|key|secret|password)=[^&]*/gi, '$1$2=[REDACTED]')
      }
    }
    return breadcrumb
  },
})
