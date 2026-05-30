import { NextRequest } from 'next/server'
import { createHash, randomBytes } from 'crypto'
import { z } from 'zod'
import * as Sentry from '@sentry/nextjs'
import { message, errors } from '@/lib/api'
import { getForgotPasswordRateLimit } from '@/lib/ratelimit'
import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import { emailNotificationService } from '@/lib/services/EmailNotificationService'

export const runtime = 'nodejs'

const ForgotPasswordSchema = z.object({
  email: z.string().email(),
})

// Resposta genérica — nunca revelar se o email está ou não cadastrado (segurança)
const SAFE_RESPONSE = message('Se este email estiver cadastrado, você receberá as instruções em breve.')

// Prefixo de identifier na tabela verification_tokens para isolar tokens de
// reset de senha de qualquer outro uso (ex: magic-link de login).
const RESET_IDENTIFIER_PREFIX = 'password-reset:'
const TOKEN_TTL_MINUTES = 60

/** Hash do token para storage — o link no email carrega o token cru. */
function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

export async function POST(request: NextRequest) {
  try {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return SAFE_RESPONSE
    }

    const parsed = ForgotPasswordSchema.safeParse(body)
    if (!parsed.success) {
      // Email sintaticamente inválido é erro de validação, não enumeração:
      // rejeitar com 422 não revela se algum email está ou não cadastrado.
      return errors.validation('Informe um email válido.')
    }

    const { email } = parsed.data

    // ─── Rate limiting por email + IP ────────────────────────────────────────
    try {
      const { success } = await getForgotPasswordRateLimit().limit(`${ip}:${email}`)
      if (!success) {
        return errors.rateLimit('Limite de solicitações atingido. Aguarde alguns minutos.')
      }
    } catch {
      // Rate limiter indisponível — continuar sem bloquear
    }

    const appUrl = env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

    // ─── Reset por token + email transacional via Resend ─────────────────────
    // Toda a lógica abaixo é silenciosa do ponto de vista do response: ninguém
    // consegue distinguir email cadastrado de não cadastrado (mesma SAFE_RESPONSE).
    try {
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true, status: true, name: true },
      })

      // Só geramos token/enviamos email para conta existente e ativa. Para
      // qualquer outro caso saímos com a mesma resposta genérica.
      if (user && (user.status as string) === 'ACTIVE') {
        const rawToken = randomBytes(32).toString('hex')
        const tokenHash = hashToken(rawToken)
        const identifier = `${RESET_IDENTIFIER_PREFIX}${user.email}`
        const expires = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000)

        // Invalida tokens de reset anteriores deste email (single-use efetivo)
        await prisma.verificationToken.deleteMany({ where: { identifier } })
        await prisma.verificationToken.create({
          data: { identifier, token: tokenHash, expires },
        })

        const resetUrl = `${appUrl}/redefinir-senha?token=${rawToken}`
        const firstName = user.name?.split(' ')[0] ?? ''

        await emailNotificationService.sendForType('PASSWORD_RESET', user.email, {
          userName: firstName,
          title: 'Redefinição de senha',
          body:
            `${firstName ? `Olá, ${firstName}. ` : ''}Recebemos uma solicitação para redefinir a senha da sua conta FootStock. ` +
            `Clique no botão abaixo para criar uma nova senha. Este link expira em ${TOKEN_TTL_MINUTES} minutos. ` +
            `Se você não solicitou isso, ignore este email — sua senha continua a mesma.`,
          ctaLabel: 'Redefinir minha senha',
          ctaUrl: resetUrl,
        })
      }
    } catch (err) {
      // Falha interna não pode revelar status do email — continua silencioso.
      Sentry.captureException(err, {
        tags: { route: 'forgot-password', flow: 'token-reset' },
      })
    }

    return SAFE_RESPONSE
  } catch {
    // Nunca revelar erro interno — resposta genérica (segurança)
    return SAFE_RESPONSE
  }
}
