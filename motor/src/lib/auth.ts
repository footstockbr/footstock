import jwt from 'jsonwebtoken'

export type PlanType = 'JOGADOR' | 'CRAQUE' | 'LENDA'

export interface JwtPayload {
  sub: string
  email?: string
  planType: PlanType
  exp: number
  iat: number
}

export class JwtVerifyError extends Error {
  constructor(
    public code: 'no_token' | 'expired' | 'invalid_sig' | 'invalid_shape',
    message: string
  ) {
    super(message)
  }
}

export function verifyJwt(token: string | null | undefined): JwtPayload {
  if (!token) throw new JwtVerifyError('no_token', 'Missing token')
  const secret = process.env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET not configured')

  let decoded: any
  try {
    decoded = jwt.verify(token, secret, { algorithms: ['HS256'] })
  } catch (e: any) {
    if (e.name === 'TokenExpiredError')
      throw new JwtVerifyError('expired', 'Token expired')
    throw new JwtVerifyError('invalid_sig', 'Invalid signature')
  }

  if (
    !decoded.sub ||
    !decoded.planType ||
    !['JOGADOR', 'CRAQUE', 'LENDA'].includes(decoded.planType)
  ) {
    throw new JwtVerifyError('invalid_shape', 'Missing required claims')
  }

  return decoded as JwtPayload
}

export function extractTokenFromRequest(req: {
  headers?: Record<string, string | string[] | undefined>
  url?: string
}): string | null {
  const auth = req.headers?.authorization || req.headers?.Authorization
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) return auth.slice(7)
  if (req.url) {
    try {
      const u = new URL(req.url, 'http://localhost')
      return u.searchParams.get('token')
    } catch {}
  }
  return null
}
