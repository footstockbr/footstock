import { NextRequest } from 'next/server'
import { z } from 'zod'
import type { WebAuthnCredential } from '@simplewebauthn/server'
import { createAuthenticationOptions, verifyAuthentication } from '@/lib/auth/webauthn'
import { supabaseAdmin } from '@/lib/supabase'
import { ok, errors, error as apiError } from '@/lib/api'
import { getWebAuthnRateLimit } from '@/lib/ratelimit'

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
 * - "verify" → verifica assinatura e retorna sessão Supabase
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

      // Criar sessão Supabase para o usuário autenticado via WebAuthn
      // Gerar magic link pelo email diretamente — falha internamente se email não existir
      const { data: linkData, error: linkError } =
        await supabaseAdmin.auth.admin.generateLink({
          type: 'magiclink',
          email,
        })

      if (linkError || !linkData.properties) {
        return errors.unauthorized()
      }

      return ok({
        session: {
          access_token: linkData.properties.hashed_token ?? '',
          message: 'WebAuthn autenticado. Troque o token por sessão completa.',
        },
      })
    }

    return errors.validation('Parâmetro step inválido. Use "init" ou "verify".')
  } catch (e) {
    console.error('[webauthn/authenticate]', e)
    return errors.server()
  }
}
