import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

// ---------------------------------------------------------------------------
// Rotas protegidas (requerem autenticacao)
// ---------------------------------------------------------------------------
const PROTECTED_ROUTES = [
  '/dashboard',
  '/mercado',
  '/carteira',
  '/portfolio',
  '/perfil',
  '/planos',
  '/noticias',
  '/ligas',
  '/notificacoes',
  '/admin',
]

// ---------------------------------------------------------------------------
// Rotas de autenticacao (redirecionar para dashboard se logado)
// ---------------------------------------------------------------------------
const AUTH_ROUTES = ['/', '/registro', '/esqueci-senha', '/redefinir-senha']

// ---------------------------------------------------------------------------
// Rotas de API com rate limit (apenas adicionar header)
// ---------------------------------------------------------------------------
const RATE_LIMITED_API_ROUTES = [
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
]

// ---------------------------------------------------------------------------
// Rotas do Club Portal (requerem role CLUB_PARTNER — verificacao preliminar)
// A verificacao definitiva de adminRole via banco ocorre em withClubAuth() no layout.
// ---------------------------------------------------------------------------
const CLUB_PROTECTED_ROUTES = ['/club']
const CLUB_LOGIN_PATH = '/club/login'

/** Deriva clubId a partir do email: fla@footstock.com → "FLA" */
function deriveClubIdFromEmail(email?: string): string | null {
  if (!email) return null
  const match = email.match(/^([^@]+)@footstock\.com$/)
  return match?.[1] ? match[1].toUpperCase() : null
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // /admin/login deve ser acessível sem autenticação (evita redirect loop no AdminLayout).
  // Early return injeta x-pathname para que o Server Component saiba onde está.
  if (pathname === '/admin/login') {
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-pathname', pathname)
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  const devAuthEmail = request.cookies.get('fs_dev_auth')?.value
  const devAuthIsAdmin = request.cookies.get('fs_dev_admin')?.value === '1'
  const devClubId = request.cookies.get('fs_dev_club_id')?.value
  const devClubName = request.cookies.get('fs_dev_club_name')?.value
  const hasDevAuth = process.env.NODE_ENV !== 'production' && Boolean(devAuthEmail)

  // ---------- Rate limited API routes ----------
  if (RATE_LIMITED_API_ROUTES.some((route) => pathname.startsWith(route))) {
    const requestId = crypto.randomUUID()
    const response = NextResponse.next()
    response.headers.set('X-Request-ID', requestId)
    return response
  }

  // ---------- DEV local fallback via cookie ----------
  if (hasDevAuth) {
    const isProtectedRoute = PROTECTED_ROUTES.some((route) =>
      pathname.startsWith(route)
    )
    const isAuthRoute = AUTH_ROUTES.some((route) => pathname === route)
    const isAffiliateDevRoute =
      pathname.startsWith('/affiliate') || pathname.startsWith('/api/v1/affiliate')
    const isAffiliateDevPublic = pathname === '/affiliate/sem-permissao'
    const isClubDevRoute = pathname.startsWith('/club') || pathname.startsWith('/api/v1/club')
    const isClubDevLogin = pathname === CLUB_LOGIN_PATH

    if (isProtectedRoute) return NextResponse.next()
    if (isAffiliateDevRoute && !isAffiliateDevPublic) return NextResponse.next()

    // Club portal bypass: injetar headers de clube quando fs_dev_club_id presente
    if (isClubDevRoute && !isClubDevLogin && devClubId) {
      const requestHeaders = new Headers(request.headers)
      requestHeaders.set('x-club-id', devClubId)
      requestHeaders.set('x-club-name', devClubName ?? devClubId)
      requestHeaders.set('x-club-user-id', devAuthEmail ?? '')
      return NextResponse.next({ request: { headers: requestHeaders } })
    }

    if (isAuthRoute) {
      const redirectUrl = new URL(
        devClubId ? '/club' : devAuthIsAdmin ? '/admin' : '/dashboard',
        request.url
      )
      return NextResponse.redirect(redirectUrl)
    }
  }

  // ---------- Criar Supabase client com cookies ----------
  let supabaseResponse = NextResponse.next({
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
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value)
          })
          supabaseResponse = NextResponse.next({
            request: { headers: request.headers },
          })
          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // Importante: chamar getUser() para refreshar o token se necessario
  // Fail-safe: se Supabase estiver offline, redirecionar para / (login)
  let user = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch {
    const isProtectedRoute = PROTECTED_ROUTES.some((route) =>
      pathname.startsWith(route)
    )
    if (isProtectedRoute) {
      return NextResponse.redirect(new URL('/', request.url))
    }
    return supabaseResponse
  }

  // ---------- Club Portal routes ----------
  const isClubRoute = CLUB_PROTECTED_ROUTES.some((route) =>
    pathname.startsWith(route)
  )
  const isClubApiRoute = pathname.startsWith('/api/v1/club')

  if ((isClubRoute || isClubApiRoute) && pathname !== CLUB_LOGIN_PATH) {
    if (!user) {
      return NextResponse.redirect(new URL(CLUB_LOGIN_PATH, request.url))
    }

    // GAP-005: Verificar expiração de sessão (30min inatividade — US-025 [EDGE], US-032)
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.expires_at) {
      const expiresMs = session.expires_at * 1000
      if (Date.now() > expiresMs) {
        return NextResponse.redirect(new URL(`${CLUB_LOGIN_PATH}?error=session_expired`, request.url))
      }
    }

    // Verificacao preliminar via user_metadata (verificacao definitiva no layout via DB)
    const metaRole = user.user_metadata?.adminRole as string | undefined
    if (metaRole && metaRole !== 'CLUB_PARTNER') {
      return NextResponse.redirect(new URL(`${CLUB_LOGIN_PATH}?error=unauthorized`, request.url))
    }

    // Injetar x-club-id / x-club-name para uso em API routes
    const metaClubId = (user.user_metadata?.clubId as string | undefined)?.toUpperCase()
    const emailClubId = deriveClubIdFromEmail(user.email)
    const clubId = metaClubId ?? emailClubId

    if (clubId) {
      const clubName = (user.user_metadata?.clubName as string | undefined) ?? clubId
      const requestHeaders = new Headers(request.headers)
      requestHeaders.set('x-club-id', clubId)
      requestHeaders.set('x-club-name', clubName)
      requestHeaders.set('x-club-user-id', user.id)
      const newResponse = NextResponse.next({ request: { headers: requestHeaders } })
      // Preservar cookies do supabaseResponse
      supabaseResponse.cookies.getAll().forEach(({ name, value }) => {
        newResponse.cookies.set(name, value)
      })
      return newResponse
    }

    // clubId não resolvível — negar acesso
    return NextResponse.redirect(new URL(`${CLUB_LOGIN_PATH}?error=unauthorized`, request.url))
  }

  // ---------- Affiliate routes ----------
  const isAffiliateRoute = pathname.startsWith('/affiliate') || pathname.startsWith('/api/v1/affiliate')
  const isAffiliatePublic = pathname === '/affiliate/sem-permissao'

  if (isAffiliateRoute && !isAffiliatePublic) {
    if (!user) {
      return NextResponse.redirect(new URL('/affiliate/sem-permissao', request.url))
    }

    // GAP-006: Verificar affiliate_code ativo no DB e injetar header
    try {
      const affiliateCheckUrl = new URL('/api/v1/internal/affiliate-check', request.url)
      affiliateCheckUrl.searchParams.set('email', user.email ?? '')
      // Consulta via service role diretamente no banco (evita loop de middleware)
      const serviceSupabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { cookies: { getAll: () => [], setAll: () => {} } }
      )
      const { data: codes } = await serviceSupabase
        .from('affiliate_codes')
        .select('code')
        .eq('email', user.email ?? '')
        .eq('active', true)
        .limit(1)

      if (!codes || codes.length === 0) {
        return NextResponse.redirect(new URL('/affiliate/sem-permissao', request.url))
      }

      const requestHeaders = new Headers(request.headers)
      requestHeaders.set('x-affiliate-code', codes[0]!.code)
      const newResponse = NextResponse.next({ request: { headers: requestHeaders } })
      supabaseResponse.cookies.getAll().forEach(({ name, value }) => {
        newResponse.cookies.set(name, value)
      })
      return newResponse
    } catch {
      // Fallback: deixar o handler verificar (manter comportamento anterior)
    }
  }

  // ---------- Rotas protegidas ----------
  const isProtectedRoute = PROTECTED_ROUTES.some((route) =>
    pathname.startsWith(route)
  )

  if (isProtectedRoute && !user) {
    const redirectUrl = new URL('/', request.url)
    return NextResponse.redirect(redirectUrl)
  }

  // ---------- Rotas de autenticacao ----------
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname === route)

  if (isAuthRoute && user) {
    const redirectUrl = new URL('/dashboard', request.url)
    return NextResponse.redirect(redirectUrl)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public/).*)'],
}
