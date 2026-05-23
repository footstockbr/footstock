// ============================================================================
// FootStock — Root Middleware (Next.js 16) — NXAUTH TASK-3
// ----------------------------------------------------------------------------
// Tech debt #33 (2026-05-23): Supabase fallback removido. Apenas Auth.js path.
// FEATURE_AUTH_SUPABASE_FALLBACK virou dead config — pode ser removido do env
// no Railway dashboard sem impacto. Codigo passou a ser a fonte da verdade do
// sunset (NXAUTH-09 gate atendido).
// ============================================================================

import NextAuth from 'next-auth'
import { NextResponse } from 'next/server'

import { authConfig } from '@/auth.config'

const { auth: authjsMiddleware } = NextAuth(authConfig)

export default authjsMiddleware(async (request) => {
  return NextResponse.next({ request })
})

export const config = {
  matcher: [
    // Match all routes except static files, images, and favicon
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
