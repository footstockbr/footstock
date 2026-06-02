import { prisma } from '@/lib/prisma'
import { sha256 } from '@/lib/utils/crypto'
import { emailNotificationService } from '@/lib/services/EmailNotificationService'

export interface DeletionResult {
  success: boolean
  message: string
  anonymizedAt: string
}

/**
 * Anonimiza todos os dados PII do usuário conforme LGPD Art. 18.
 *
 * PRESERVADO (obrigação legal — 5 anos):
 * - Registros financeiros (transactions, orders, positions)
 * - Data de criação da conta
 * - Consentimentos (timestamp e tipo — sem identificação pessoal)
 *
 * ANONIMIZADO:
 * - email → null@deleted-{anonymousId}.invalid
 * - name → "Usuário Deletado"
 * - phone → NULL
 * - cpfHash → hash de string aleatória (não rastreável)
 * - birthDate → NULL
 * - favoriteClub → NULL
 * - adminRole → NULL
 */
export async function deleteAccount(
  userId: string,
  reason: string
): Promise<DeletionResult> {
  const anonymousId = sha256(`${userId}${Date.now()}${Math.random()}`).slice(0, 16)
  const anonymizedEmail = `null@deleted-${anonymousId}.invalid`
  const anonymizedCpfHash = sha256(`deleted-${anonymousId}-not-real`)

  // Enviar email ACCOUNT_DELETED ANTES da anonimização (email ainda válido aqui)
  try {
    const profile = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    })
    if (profile?.email) {
      await emailNotificationService.sendForType('ACCOUNT_DELETED', profile.email, {
        userName: profile.name ?? undefined,
        title: 'Sua conta foi excluída',
        body: 'Seus dados pessoais foram anonimizados conforme a LGPD. Registros financeiros foram preservados por obrigação legal (5 anos).',
      })
    }
  } catch (err) {
    console.error('[account-deletion] Erro ao enviar email ACCOUNT_DELETED:', err)
  }

  await prisma.$transaction(async (tx) => {
    // 1. Anonimizar dados pessoais
    await tx.user.update({
      where: { id: userId },
      data: {
        email: anonymizedEmail,
        name: 'Usuário Deletado',
        phone: null,
        cpfHash: anonymizedCpfHash,
        // birthDate é NOT NULL — placeholder. favoriteClub é nullable e tem FK
        // para assets.ticker (M059): anonimização zera para NULL (um placeholder
        // inválido tipo 'DEL' violaria a foreign key).
        birthDate: new Date('1900-01-01'), // Data claramente falsa (PII removido)
        favoriteClub: null,
        adminRole: null,
        tourCompleted: false,
        investorProfile: 'INICIANTE',
      },
    })

    // 2. Remover dados não-financeiros
    await tx.notification.deleteMany({ where: { userId } })

    // 3. Anonimizar conteúdo de posts de fórum (manter para moderação)
    await tx.forumPost.updateMany({
      where: { userId },
      data: { content: '[Conteúdo removido]' },
    })

    // 4. Remover membros de ligas
    await tx.leagueMember.deleteMany({ where: { userId } })

    // 5. Registrar solicitação de exclusão no log
    await tx.dataAccessLog.create({
      data: {
        userId,
        accessedBy: userId,
        dataType: 'ACCOUNT_DELETION',
        endpoint: 'account-deletion.deleteAccount',
        reason: `${reason} — anonymizedAt: ${new Date().toISOString()}`,
      },
    })
  })

  // Revogar sessões Auth.js fora da transação (não reverte anonimização se falhar)
  try {
    await prisma.session.deleteMany({ where: { userId } })
  } catch (err) {
    // Log mas não reverter — conta já inutilizável sem email/cpfHash válidos
    console.error('[account-deletion] Erro ao revogar sessões Auth.js:', err)
  }

  return {
    success: true,
    message: 'Conta excluída com sucesso. Dados pessoais foram anonimizados.',
    anonymizedAt: new Date().toISOString(),
  }
}
