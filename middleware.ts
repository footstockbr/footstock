import { NextRequest, NextResponse } from 'next/server'

const PROTECTED_ROUTES = ['/dashboard', '/mercado', '/carteira', '/perfil']

const RATE_LIMITED_API_ROUTES = [
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/forgot-password',
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (RATE_LIMITED_API_ROUTES.some(route => pathname.startsWith(route))) {
    const requestId = crypto.randomUUID()
    const response = NextResponse.next()
    response.headers.set('X-Request-ID', requestId)
    return response
  }

  if (PROTECTED_ROUTES.some(route => pathname.startsWith(route))) {
    const supabaseToken = request.cookies.get('sb-access-token')
    if (!supabaseToken) {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public/).*)'],
}
