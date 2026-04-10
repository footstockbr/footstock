import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// ─── Configuração de rotas ─────────────────────────────────────────────────────

/** Rotas de API públicas (sem autenticação) */
const PUBLIC_API_PATHS = [
  '/api/v1/auth/register',
  '/api/v1/auth/login',
  '/api/v1/auth/dev-login',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
  '/api/v1/auth/session',
  '/api/v1/auth/webauthn/authenticate',
  '/api/v1/health',
  '/api/v1/payments/webhook',
]

/** Rotas de página protegidas — redireciona para / se não autenticado */
const PROTECTED_PAGE_ROUTES = [
  '/mercado',
  '/ativo',
  '/portfolio',
  '/noticias',
  '/ligas',
  '/comunidade',
  '/assessor',
  '/glossario',
  '/conta',
  '/planos',
  '/inbox',
  '/dividendos',
  '/admin',
  '/perfil',
  '/onboarding',
]

/** Rotas de página de auth — redireciona para /mercado se já autenticado */
const AUTH_PAGE_ROUTES = ['/', '/login', '/cadastro', '/recuperar-senha']

// ─── Proxy (Next.js 16 Routing Middleware) ─────────────────────────────────────

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  const response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // ─── API routes ──────────────────────────────────────────────────────────
  // O middleware NÃO bloqueia rotas de API — apenas tenta refreshar o token
  // e injetar x-user-id se possível. A validação real fica nos route handlers.
  //
  // Motivo: múltiplos requests simultâneos (portfolio + history + orders) chegam
  // com o mesmo refresh token expirado. Se o middleware chamar getUser() em cada
  // um, todos tentam rotacionar o refresh token ao mesmo tempo → race condition →
  // 2 de 3 tomam 401. A solução é deixar os route handlers fazerem auth serial.
  if (pathname.startsWith('/api/v1')) {
    if (PUBLIC_API_PATHS.some((p) => pathname.startsWith(p))) {
      return response
    }

    // Injetar x-user-id para rotas admin/* usando fs-admin-role cookie
    if (pathname.startsWith('/api/v1/admin')) {
      const adminRole = request.cookies.get('fs-admin-role')?.value
      if (adminRole) {
        const requestHeaders = new Headers(request.headers)
        requestHeaders.set('x-user-id', 'dev-user')
        requestHeaders.set('x-user-email', 'dev@foot-stock.test')
        requestHeaders.set('x-admin-role', adminRole)
        return NextResponse.next({ request: { headers: requestHeaders } })
      }
    }

    // Tenta injetar x-user-id sem bloquear; se falhar, passa adiante.
    // Route handlers são responsáveis por retornar 401 se não autenticado.
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const requestHeaders = new Headers(request.headers)
        requestHeaders.set('x-user-id', user.id)
        requestHeaders.set('x-user-email', user.email ?? '')
        return NextResponse.next({ request: { headers: requestHeaders } })
      }
    } catch { /* getUser falhou — passa adiante, route handler valida */ }

    return NextResponse.next({ request: { headers: request.headers } })
  }

  // ─── Page routes ──────────────────────────────────────────────────────────
  if (PROTECTED_PAGE_ROUTES.some((r) => pathname.startsWith(r))) {
    const isDev = process.env.NODE_ENV === 'development'
    const adminRole = request.cookies.get('fs-admin-role')?.value
    const adminRoles = ['SUPER_ADMIN', 'ADMINISTRADOR', 'MONITOR', 'EDITOR', 'MODERADOR']

    // Em dev, permitir /admin com fs-admin-role cookie
    if (isDev && pathname.startsWith('/admin')) {
      if (adminRole) {
        return response
      }
      // Fallback: permitir dev bypass sem cookie
      return response
    }

    // Prod ou não-dev: validar com Supabase
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user && !adminRole) {
      return NextResponse.redirect(new URL('/', request.url))
    }

    // Admin/club users on non-admin routes → redirect to their panel
    if (!pathname.startsWith('/admin') && !pathname.startsWith('/club')) {
      if (adminRole && adminRoles.includes(adminRole)) {
        return NextResponse.redirect(new URL('/admin', request.url))
      }
      if (adminRole === 'CLUB_PARTNER') {
        return NextResponse.redirect(new URL('/club', request.url))
      }
    }

    return response
  }

  if (AUTH_PAGE_ROUTES.some((r) => pathname === r)) {
    const adminRole = request.cookies.get('fs-admin-role')?.value
    const adminRoles = ['SUPER_ADMIN', 'ADMINISTRADOR', 'MONITOR', 'EDITOR', 'MODERADOR']

    // Cookie de admin presente → redirecionar sem precisar de sessão Supabase
    if (adminRole && adminRoles.includes(adminRole)) {
      return NextResponse.redirect(new URL('/admin', request.url))
    }
    if (adminRole === 'CLUB_PARTNER') {
      return NextResponse.redirect(new URL('/club', request.url))
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      return NextResponse.redirect(new URL('/mercado', request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    // API routes
    '/api/v1/:path*',
    // Page routes — excluir statics e internals do Next.js
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
}
