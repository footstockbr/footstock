import { getRedisClient } from '@/lib/redis'
import { decodeAuthjsToken, readAuthjsSession } from '@/lib/auth/authjs-session'
import { prisma } from '@/lib/prisma'
import type { AdminRole } from '@/types'

const SESSION_TTL = 1800 // 30 minutos

class AdminSessionService {
  /**
   * Verifica sessão admin via Auth.js (Bearer token JWE ou cookie) + adminRole no DB.
   */
  async verifyAdminSession(
    sessionToken?: string
  ): Promise<{ valid: boolean; adminRole: AdminRole | null; userId: string | null }> {
    try {
      const payload = sessionToken
        ? await decodeAuthjsToken(sessionToken)
        : await readAuthjsSession()

      if (!payload?.id) return { valid: false, adminRole: null, userId: null }

      const dbUser = await prisma.user.findUnique({
        where: { id: payload.id },
        select: { adminRole: true },
      })

      if (!dbUser?.adminRole) return { valid: false, adminRole: null, userId: null }

      return { valid: true, adminRole: dbUser.adminRole as AdminRole, userId: payload.id }
    } catch {
      return { valid: false, adminRole: null, userId: null }
    }
  }

  /**
   * Renova timestamp de atividade no Redis (TTL 30min).
   */
  async storeActivityTimestamp(userId: string): Promise<void> {
    const redis = getRedisClient()
    if (!redis) return
    try {
      await redis.set(`admin:activity:${userId}`, String(Date.now()), 'EX', SESSION_TTL)
    } catch {
      // Redis offline — degradado mas não crítico aqui
    }
  }

  /**
   * Verifica se a sessão expirou por inatividade.
   * Fail-safe: se Redis offline → assume expirado (segurança > disponibilidade).
   */
  async checkTimeout(userId: string): Promise<boolean> {
    const redis = getRedisClient()
    if (!redis) return true // fail-safe
    try {
      const key = await redis.exists(`admin:activity:${userId}`)
      return key === 0 // 0 = chave não existe = timeout
    } catch {
      return true // fail-safe: Redis offline → timeout
    }
  }

  /**
   * Revoga sessão admin deletando chave Redis e as sessões Auth.js do banco.
   */
  async revokeAdminSession(userId: string): Promise<void> {
    const redis = getRedisClient()
    if (redis) {
      try {
        await redis.del(`admin:activity:${userId}`)
      } catch { /* ignora falha Redis */ }
    }
    try {
      await prisma.session.deleteMany({ where: { userId } })
    } catch { /* ignora falha de revogação de sessão */ }
  }
}

export const adminSessionService = new AdminSessionService()
