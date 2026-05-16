import { NextRequest } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { supabaseAdmin } from '@/lib/supabase'
import { ok, errors } from '@/lib/api'
import { clearDualCookies } from '@/lib/auth'

type LogoutPath = 'authjs' | 'supabase_fallback' | 'noop'

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
    let path: LogoutPath = 'noop'

    const authHeader = request.headers.get('Authorization')
    const token = authHeader?.replace('Bearer ', '')?.trim()

    if (token) {
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
      if (!error && user) {
        await supabaseAdmin.auth.admin.signOut(user.id)
        path = 'supabase_fallback'
      }
    }

    await clearDualCookies()
    if (path === 'noop') path = 'authjs'

    emitLogoutBreadcrumb(path)
    return ok({ message: 'Logout realizado.' })
  } catch {
    return errors.server()
  }
}
