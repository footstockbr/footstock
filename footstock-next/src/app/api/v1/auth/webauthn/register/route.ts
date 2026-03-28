import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createRegistrationOptions, verifyRegistration } from '@/lib/auth/webauthn'
import { getAuthUser } from '@/lib/auth'
import { ok, errors } from '@/lib/api'
import { getWebAuthnRateLimit } from '@/lib/ratelimit'

const RegisterInitSchema = z.object({ step: z.literal('init') })
const RegisterVerifySchema = z.object({
  step: z.literal('verify'),
  response: z.unknown(),
})

/**
 * POST /api/v1/auth/webauthn/register
 *
 * Dois passos (step field):
 * - "init"   → gera registration options e retorna challenge
 * - "verify" → verifica resposta do browser e salva credencial
 *
 * Requer autenticação (JWT via middleware).
 *
 * Nota: armazenamento do challenge em Redis é TODO (depende de module-7 Redis setup).
 * Atualmente usa variável em memória — não funciona em múltiplos pods.
 */

// TODO: substituir por Redis com TTL 5 min quando module-7 estiver disponível
const challengeStore = new Map<string, string>()

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthUser()
    if (!authUser) return errors.unauthorized()

    const { user } = authUser
    const userId = user.id

    // ─── Rate limiting ─────────────────────────────────────────────────────
    try {
      const { success } = await getWebAuthnRateLimit().limit(userId)
      if (!success) {
        return errors.rateLimit('Muitas tentativas de WebAuthn. Aguarde um momento.')
      }
    } catch {
      // Redis indisponível — continuar
    }

    const body = await request.json()

    // ─── Init ──────────────────────────────────────────────────────────────
    const initParsed = RegisterInitSchema.safeParse(body)
    if (initParsed.success) {
      const options = await createRegistrationOptions(userId, user.email)

      // Armazenar challenge temporariamente
      // TODO: await redis.set(`webauthn:reg:${userId}`, options.challenge, 'EX', 300)
      challengeStore.set(`reg:${userId}`, options.challenge)

      return ok(options)
    }

    // ─── Verify ────────────────────────────────────────────────────────────
    const verifyParsed = RegisterVerifySchema.safeParse(body)
    if (verifyParsed.success) {
      const expectedChallenge = challengeStore.get(`reg:${userId}`)

      if (!expectedChallenge) {
        return errors.validation('Challenge expirado. Reinicie o registro biométrico.')
      }

      const verification = await verifyRegistration(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        verifyParsed.data.response as any,
        expectedChallenge
      )

      if (verification.verified && verification.registrationInfo) {
        challengeStore.delete(`reg:${userId}`)

        // TODO: Salvar credencial no banco (tabela webauthn_credentials — module-6/TASK-3)
        // await prisma.webauthnCredential.create({ data: {
        //   userId,
        //   credentialId: Buffer.from(verification.registrationInfo.credential.id).toString('base64url'),
        //   publicKey: Buffer.from(verification.registrationInfo.credential.publicKey),
        //   counter: verification.registrationInfo.credential.counter,
        //   transports: verification.registrationInfo.credential.transports?.join(',') ?? '',
        // }})

        return ok({ verified: true, message: 'Biometria registrada com sucesso.' })
      }

      return errors.validation('Falha na verificação biométrica. Tente novamente.')
    }

    return errors.validation('Parâmetro step inválido. Use "init" ou "verify".')
  } catch (e) {
    console.error('[webauthn/register]', e)
    return errors.server()
  }
}
