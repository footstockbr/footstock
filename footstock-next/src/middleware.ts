// ============================================================================
// FootStock — Root Middleware (Next.js 16) — NXAUTH TASK-3
// ----------------------------------------------------------------------------
// Decide entre dois caminhos por presenca de cookie:
//
//  - Auth.js path (cookie `(__Secure-)authjs.session-token` presente):
//    NextAuth(authConfig).auth wrap mantem a sessao viva (token rotation
//    quando aplicavel) sem tocar Supabase. Tree-shake do bundle Edge fica
//    limpo (NAO arrasta bcryptjs nem o adapter Prisma).
//
//  - Supabase legacy path (sem cookie Auth.js E FEATURE_AUTH_SUPABASE_FALLBACK=true):
//    refresh da sessao Supabase via getUser() — comportamento pre-migracao.
//
//  - Sem cookie e sem fallback: NextResponse.next() puro.
//
// IMPORT RULES (Edge-safe):
//  - importar APENAS `auth.config.ts` (sentinela providers=[]), NUNCA `auth.ts`
//    (que arrasta Prisma + bcryptjs + adapter via Credentials).
//  - process.env lido direto (env.ts e server-only, nao roda em Edge).
// ============================================================================

import { createServerClient } from '@supabase/ssr'
import NextAuth from 'next-auth'
import { NextResponse, type NextRequest } from 'next/server'

import { authConfig } from '@/auth.config'

const { auth: authjsMiddleware } = NextAuth(authConfig)

function hasAuthjsSessionCookie(request: NextRequest): boolean {
  return Boolean(
    request.cookies.get('__Secure-authjs.session-token') ||
      request.cookies.get('authjs.session-token'),
  )
}

async function runSupabaseFallback(request: NextRequest): Promise<NextResponse> {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // getUser() valida + dispara refresh quando access_token expirou.
  await supabase.auth.getUser()
  return supabaseResponse
}

export default authjsMiddleware(async (request) => {
  if (hasAuthjsSessionCookie(request)) {
    // Auth.js path: o wrap NextAuth(authConfig).auth ja avaliou `authorized`
    // antes deste handler rodar. Simplesmente seguir adiante.
    return NextResponse.next({ request })
  }

  if (process.env.FEATURE_AUTH_SUPABASE_FALLBACK === 'true') {
    return runSupabaseFallback(request)
  }

  return NextResponse.next({ request })
})

export const config = {
  matcher: [
    // Match all routes except static files, images, and favicon
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
