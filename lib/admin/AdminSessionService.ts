// ============================================================================
// Foot Stock — AdminSessionService
// Verifica role admin, controla timeout 30min via Redis, revogação de sessão.
// Rastreabilidade: INT-087, TASK-1/ST003
// ============================================================================

import { createClient } from '@supabase/supabase-js'
import { redisPublisher } from '@/lib/redis'
import { prisma } from '@/lib/prisma'
import type { AdminRole } from '@/lib/enums'
import type { AdminSessionData } from '@/lib/types/admin'

const TIMEOUT_TTL = 1800 // 30 minutos em segundos

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

class AdminSessionService {
  private activityKey(userId: string) {
    return `admin:activity:${userId}`
  }

  /**
   * Verifica JWT via Supabase e confere admin_role no banco.
   * adminRole SEMPRE lido do banco — nunca do JWT (claims não confiáveis).
   */
  async verifyAdminSession(token: string): Promise<AdminSessionData> {
    try {
      const {
        data: { user: supabaseUser },
        error,
      } = await supabase.auth.getUser(token)

      if (error || !supabaseUser) {
        return { valid: false, adminRole: null, userId: null }
      }

      const dbUser = await prisma.user.findUnique({
        where: { id: supabaseUser.id },
        select: { id: true, adminRole: true },
      })

      if (!dbUser || !dbUser.adminRole) {
        return { valid: false, adminRole: null, userId: null }
      }

      return {
        valid: true,
        adminRole: dbUser.adminRole as AdminRole,
        userId: dbUser.id,
      }
    } catch {
      return { valid: false, adminRole: null, userId: null }
    }
  }

  /**
   * Renova o TTL de inatividade do admin no Redis.
   * Chamado a cada interação do usuário no painel.
   */
  async storeActivityTimestamp(userId: string): Promise<void> {
    try {
      await redisPublisher.setex(this.activityKey(userId), TIMEOUT_TTL, Date.now().toString())
    } catch (err) {
      console.error('[AdminSession] Erro ao atualizar atividade Redis:', err)
    }
  }

  /**
   * Verifica se a sessão está ativa (chave Redis existe).
   * Fail-safe: se Redis indisponível, assume timeout expirado (segurança acima de disponibilidade).
   */
  async checkTimeout(userId: string): Promise<boolean> {
    try {
      const exists = await redisPublisher.exists(this.activityKey(userId))
      return exists === 0 // true = timeout expirado
    } catch {
      // Redis offline → assumir expirado (fail-safe de segurança)
      console.warn('[AdminSession] Redis offline — assumindo timeout expirado (fail-safe)')
      return true
    }
  }

  /**
   * Revoga sessão: deleta chave Redis e invalida sessão Supabase.
   */
  async revokeAdminSession(userId: string): Promise<void> {
    try {
      await redisPublisher.del(this.activityKey(userId))
      await supabase.auth.admin.deleteUser(userId)
    } catch (err) {
      console.error('[AdminSession] Erro ao revogar sessão:', err)
    }
  }
}

export const adminSessionService = new AdminSessionService()
