import { NextRequest } from 'next/server'
import { z } from 'zod'
import type { WebAuthnCredential } from '@simplewebauthn/server'
import { encode } from '@auth/core/jwt'
import { createAuthenticationOptions, verifyAuthentication } from '@/lib/auth/webauthn'
import { prisma } from '@/lib/prisma'
import { ok, errors, error as apiError } from '@/lib/api'
import { getWebAuthnRateLimit } from '@/lib/ratelimit'

const AUTHJS_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60
const AUTHJS_SALT_PROD = '__Secure-authjs.session-token'
const AUTHJS_SALT_DEV = 'authjs.session-token'

const AuthInitSchema = z.object({
  step: z.literal('init'),
  email: z.string().email(),
})

const AuthVerifySchema = z.object({
  step: z.literal('verify'),
  email: z.string().email(),
  response: z.unknown(),
})

/**
 * POST /api/v1/auth/webauthn/authenticate
 *
 * Dois passos:
 * - "init"   → gera authentication options com credenciais do usuário
 * - "verify" → verifica assinatura e retorna sessão Auth.js (JWE cookie)
 *
 * Rota pública (sem autenticação prévia necessária).
 *
 * TODO: challenge storage em Redis (depende de module-7 Redis setup).
 * Atualmente usa Map em memória — não funciona em múltiplos pods.
 */

// TODO: substituir por Redis com TTL 5 min (module-7)
const challengeStore = new Map<string, string>()

export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'

    // ─── Rate limiting ─────────────────────────────────────────────────────
    try {
      const { success } = await getWebAuthnRateLimit().limit(ip)
      if (!success) {
        return errors.rateLimit('Muitas tentativas. Aguarde um momento.')
      }
    } catch {
      // Redis indisponível — continuar
    }

    const body = await request.json()

    // ─── Init ──────────────────────────────────────────────────────────────
    const initParsed = AuthInitSchema.safeParse(body)
    if (initParsed.success) {
      const { email } = initParsed.data

      // TODO: buscar credentialIds do banco (tabela webauthn_credentials — module-6)
      // const credentials = await prisma.webauthnCredential.findMany({
      //   where: { user: { email } },
      //   select: { credentialId: true },
      // })
      // const credentialIds = credentials.map(c => c.credentialId)
      const credentialIds: string[] = [] // placeholder

      const options = await createAuthenticationOptions(credentialIds)

      // TODO: await redis.set(`webauthn:auth:${email}`, options.challenge, 'EX', 300)
      challengeStore.set(`auth:${email}`, options.challenge)

      return ok(options)
    }

    // ─── Verify ────────────────────────────────────────────────────────────
    const verifyParsed = AuthVerifySchema.safeParse(body)
    if (verifyParsed.success) {
      const { email } = verifyParsed.data
      const expectedChallenge = challengeStore.get(`auth:${email}`)

      if (!expectedChallenge) {
        return errors.validation('Challenge expirado. Reinicie a autenticação biométrica.')
      }

      // TODO: buscar credencial do banco e montar WebAuthnCredential real (module-6)
      // const dbCredential = await prisma.webauthnCredential.findFirst({
      //   where: { user: { email } },
      // })
      // const credential: WebAuthnCredential = {
      //   id: dbCredential.credentialId, // Base64URLString
      //   publicKey: dbCredential.publicKey,
      //   counter: dbCredential.counter,
      //   transports: dbCredential.transports?.split(',') as AuthenticatorTransportFuture[],
      // }
      const credential: WebAuthnCredential = {
        id: '',
        publicKey: new Uint8Array(0),
        counter: 0,
      }

      const verification = await verifyAuthentication(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        verifyParsed.data.response as any,
        expectedChallenge,
        credential
      )

      if (!verification.verified) {
        return apiError('AUTH-008', 'Autenticação biométrica falhou. Tente novamente.', 401)
      }

      challengeStore.delete(`auth:${email}`)

      // Criar sessão Auth.js (JWE) para o usuário autenticado via WebAuthn.
      // adminRole/planType/etc lidos do banco — nunca confiar em claims externos.
      const dbUser = await prisma.user.findUnique({ where: { email } })
      if (!dbUser) {
        return errors.unauthorized()
      }

      const secret = process.env.AUTH_SECRET
      if (!secret) {
        return errors.server()
      }
      const salt = process.env.NODE_ENV === 'production' ? AUTHJS_SALT_PROD : AUTHJS_SALT_DEV

      const access_token = await encode({
        token: {
          id: dbUser.id,
          sub: dbUser.id,
          email: dbUser.email,
          adminRole: dbUser.adminRole,
          planType: dbUser.planType,
          userType: dbUser.userType,
          favoriteClub: dbUser.favoriteClub,
        },
        secret,
        salt,
        maxAge: AUTHJS_SESSION_MAX_AGE_SECONDS,
      })

      const res = ok({
        session: {
          access_token,
          message: 'WebAuthn autenticado.',
        },
      })
      res.cookies.set({
        name: salt,
        value: access_token,
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        maxAge: AUTHJS_SESSION_MAX_AGE_SECONDS,
      })
      return res
    }

    return errors.validation('Parâmetro step inválido. Use "init" ou "verify".')
  } catch (e) {
    console.error('[webauthn/authenticate]', e)
    return errors.server()
  }
}
