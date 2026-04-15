// T-023: Job de retry — verificação de maioridade via FlagCheck
// Busca usuários com ageVerificationPending=true e retenta a chamada.

import { prisma } from '@/lib/prisma'
import { retryFlagCheckVerification } from '@/lib/services/age-verification'
import { sendNotification } from '@/lib/services/NotificationService'
import { NOTIFICATION_TYPE } from '@/lib/enums'

export interface RetryAgeVerificationResult {
  total: number
  resolved: number
  stillPending: number
  minorsDetected: number
}

/**
 * Processa todos os usuários com verificação de maioridade pendente.
 * Tenta novamente a chamada FlagCheck para cada um.
 *
 * Limita a 50 usuários por execução para evitar sobrecarga.
 */
export async function retryAgeVerificationJob(): Promise<RetryAgeVerificationResult> {
  const pendingUsers = await prisma.user.findMany({
    where: { ageVerificationPending: true, status: 'ACTIVE' },
    select: { id: true, cpfHash: true },
    take: 50,
    orderBy: { createdAt: 'asc' },
  })

  const result: RetryAgeVerificationResult = {
    total: pendingUsers.length,
    resolved: 0,
    stillPending: 0,
    minorsDetected: 0,
  }

  for (const user of pendingUsers) {
    const verification = await retryFlagCheckVerification(user.id, user.cpfHash)

    if (verification.resolved) {
      result.resolved++
      if (verification.isAdult) {
        // Notificar usuário que verificação foi concluída
        sendNotification(
          user.id,
          NOTIFICATION_TYPE.AGE_VERIFICATION_COMPLETED,
          {
            title: 'Verificação concluída',
            body: 'Sua verificação de maioridade foi concluída com sucesso. Todas as funcionalidades estão liberadas.',
          }
        ).catch((err: unknown) => console.error('[retry-age] Falha ao notificar:', err))
      } else {
        result.minorsDetected++
      }
    } else {
      result.stillPending++
    }
  }

  console.info('[retry-age-verification]', result)
  return result
}
