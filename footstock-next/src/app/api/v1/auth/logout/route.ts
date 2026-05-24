import { NextRequest } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { ok, errors } from '@/lib/api'
import { clearDualCookies } from '@/lib/auth'
import { decodeAuthjsToken, readAuthjsSession } from '@/lib/auth/authjs-session'
import { prisma } from '@/lib/prisma'

type LogoutPath = 'authjs' | 'noop'

function emitLogoutBreadcrumb(path: LogoutPath): void {
  Sentry.addBreadcrumb({
    category: 'auth',
    message: 'logout_path',
    level: 'info',
    data: { path },
  })
}

export async function POST(request: NextRequest) {
  try {
    // Resolve a identidade (Bearer token nativo OU cookie) para revogar as
    // Session rows do Auth.js no banco — necessario para session strategy
    // 'database', onde remover o cookie sozinho deixaria a row orfa ate o TTL.
    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')?.trim()

    const session = token
      ? await decodeAuthjsToken(token)
      : await readAuthjsSession()

    if (session?.id) {
      try {
        await prisma.session.deleteMany({ where: { userId: session.id } })
      } catch { /* falha de revogacao nao impede limpeza de cookie */ }
    }

    await clearDualCookies()

    emitLogoutBreadcrumb(session?.id ? 'authjs' : 'noop')
    return ok({ message: 'Logout realizado.' })
  } catch {
    return errors.server()
  }
}
