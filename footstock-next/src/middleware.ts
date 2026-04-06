import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// ─── Configuração de rotas ─────────────────────────────────────────────────────

/** Rotas de API públicas (sem autenticação) */
const PUBLIC_API_PATHS = [
  '/api/v1/auth/register',
  '/api/v1/auth/login',
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

// ─── Middleware ────────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
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
  if (pathname.startsWith('/api/v1')) {
    // Rotas públicas passam direto
    if (PUBLIC_API_PATHS.some((p) => pathname.startsWith(p))) {
      return response
    }

    // Rotas protegidas — verificar autenticação
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error || !user) {
      return NextResponse.json(
        { error: { code: 'AUTH_001', message: 'Sessão expirada. Faça login novamente.' } },
        { status: 401 }
      )
    }

    // Injetar userId para uso nos route handlers
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-user-id', user.id)
    requestHeaders.set('x-user-email', user.email ?? '')

    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  // ─── Page routes ──────────────────────────────────────────────────────────
  if (PROTECTED_PAGE_ROUTES.some((r) => pathname.startsWith(r))) {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.redirect(new URL('/', request.url))
    }

    // Admin/club users on non-admin routes → redirect to their panel
    if (!pathname.startsWith('/admin') && !pathname.startsWith('/club')) {
      const adminRole = request.cookies.get('fs-admin-role')?.value
      const adminRoles = ['SUPER_ADMIN', 'ADMINISTRADOR', 'MONITOR', 'EDITOR', 'MODERADOR']
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
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      // Admin users go to /admin, club partners to /club, others to /mercado
      const adminRole = request.cookies.get('fs-admin-role')?.value
      const adminRoles = ['SUPER_ADMIN', 'ADMINISTRADOR', 'MONITOR', 'EDITOR', 'MODERADOR']
      if (adminRole && adminRoles.includes(adminRole)) {
        return NextResponse.redirect(new URL('/admin', request.url))
      }
      if (adminRole === 'CLUB_PARTNER') {
        return NextResponse.redirect(new URL('/club', request.url))
      }
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
