import { NextRequest } from 'next/server'
import { createHash } from 'crypto'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import * as Sentry from '@sentry/nextjs'
import { message, errors } from '@/lib/api'
import { getAuthRateLimit } from '@/lib/ratelimit'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

const RESET_IDENTIFIER_PREFIX = 'password-reset:'

const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8, 'A senha deve ter pelo menos 8 caracteres'),
})

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

export async function POST(request: NextRequest) {
  try {
    // ─── Rate limiting por IP ─────────────────────────────────────────────────
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? '127.0.0.1'

    try {
      const { success } = await getAuthRateLimit().limit(`reset:${ip}`)
      if (!success) {
        return errors.rateLimit('Muitas tentativas. Aguarde alguns minutos.')
      }
    } catch {
      // Rate limiter indisponível — continuar sem bloquear
    }

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return errors.validation('Requisição inválida.')
    }

    const parsed = ResetPasswordSchema.safeParse(body)
    if (!parsed.success) {
      return errors.validation('Token ausente ou senha inválida (mínimo 8 caracteres).')
    }

    const { token, newPassword } = parsed.data
    const tokenHash = hashToken(token)

    // ─── Localiza token de reset (hash) e valida identifier + expiração ───────
    const record = await prisma.verificationToken.findUnique({
      where: { token: tokenHash },
    })

    const isResetToken = record?.identifier.startsWith(RESET_IDENTIFIER_PREFIX)
    if (!record || !isResetToken) {
      return errors.validation('Link inválido ou já utilizado.')
    }

    if (record.expires.getTime() < Date.now()) {
      // Token expirado — remove e rejeita
      await prisma.verificationToken.deleteMany({ where: { token: tokenHash } })
      return errors.validation('Link expirado. Solicite um novo link de recuperação.')
    }

    const email = record.identifier.slice(RESET_IDENTIFIER_PREFIX.length)
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, status: true },
    })

    if (!user || (user.status as string) !== 'ACTIVE') {
      await prisma.verificationToken.deleteMany({ where: { token: tokenHash } })
      return errors.validation('Link inválido ou já utilizado.')
    }

    // ─── Grava nova senha (bcrypt 12 rounds, mesmo custo do change-password) ──
    const newHash = await bcrypt.hash(newPassword, 12)

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newHash, updatedAt: new Date() },
      }),
      // Single-use: invalida TODOS os tokens de reset deste email
      prisma.verificationToken.deleteMany({
        where: { identifier: record.identifier },
      }),
    ])

    return message('Senha redefinida com sucesso. Você já pode entrar com a nova senha.')
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'reset-password' } })
    return errors.server()
  }
}
