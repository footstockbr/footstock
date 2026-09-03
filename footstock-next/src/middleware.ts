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

// 2026-09-03: injeta rota e metodo como headers de request para que
// `getAuthUser()` (src/lib/auth.ts) consiga aplicar a politica de conta
// bloqueada sem que as 126 rotas que a chamam precisem passar o contexto na mao.
// `headers()` do App Router so devolve headers de REQUEST, entao isto e a unica
// via barata de levar pathname/method para dentro de um helper sem argumento.
// Sao headers INTERNOS: sobrescritos incondicionalmente aqui, para que um
// cliente nao possa forjar `/api/v1/payments` e comprar liberacao de escrita.
export const FS_PATH_HEADER = 'x-fs-path'
export const FS_METHOD_HEADER = 'x-fs-method'

export default authjsMiddleware(async (request) => {
  const headers = new Headers(request.headers)
  headers.set(FS_PATH_HEADER, request.nextUrl.pathname)
  headers.set(FS_METHOD_HEADER, request.method)
  return NextResponse.next({ request: { headers } })
})

export const config = {
  matcher: [
    // Match all routes except static files, images, and favicon
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
