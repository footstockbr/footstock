import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.05 : 1.0,

  beforeSend(event) {
    // Strip PII from exception messages
    if (event.exception?.values) {
      event.exception.values = event.exception.values.map(ex => {
        if (ex.value) {
          ex.value = ex.value.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF_REDACTED]')
          ex.value = ex.value.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]')
          ex.value = ex.value.replace(/eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, '[JWT_REDACTED]')
        }
        return ex
      })
    }

    // Strip PII from request body
    if (event.request?.data) {
      const data = event.request.data as Record<string, unknown>
      const piiFields = ['cpf', 'cpfHash', 'cpf_hash', 'email', 'password', 'token', 'accessToken', 'refreshToken', 'phone', 'name']
      for (const field of piiFields) {
        if (field in data) {
          data[field] = '[REDACTED]'
        }
      }
    }

    // Strip PII from request headers
    if (event.request?.headers) {
      delete event.request.headers['authorization']
      delete event.request.headers['cookie']
    }

    // Strip user email/IP
    if (event.user) {
      delete event.user.email
      delete event.user.ip_address
    }

    return event
  },
})
