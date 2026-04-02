/**
 * Seed: Compliance — Consents com cobertura completa de ConsentPurpose,
 * incluindo granted=true e granted=false, revogados e pendentes.
 * Cobre edge cases LGPD: consentimento pendente de verificação de idade,
 * consentimento revogado, ausência de consentimento de marketing.
 * Idempotente (upsert por userId_purpose).
 */
import { prisma } from '@/lib/prisma'

const now = new Date()
const d = (offsetDays: number) => new Date(now.getTime() + offsetDays * 86_400_000)

export async function seedCompliance() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[seed:compliance] Seeds não executam em produção.')
  }

  const [craque, lenda, jogador, agePending, semTour] = await Promise.all([
    prisma.user.findUnique({ where: { email: 'craque@foot-stock.test' } }),
    prisma.user.findUnique({ where: { email: 'lenda@foot-stock.test' } }),
    prisma.user.findUnique({ where: { email: 'jogador@foot-stock.test' } }),
    prisma.user.findUnique({ where: { email: 'age-pending@foot-stock.test' } }),
    prisma.user.findUnique({ where: { email: 'sem-tour@foot-stock.test' } }),
  ])

  const purposes = ['ESSENTIAL', 'ANALYTICS', 'MARKETING', 'DATA_TERCEIROS', 'AGE_VERIFICATION'] as const

  // Craque — todos os consentimentos aceitos
  if (craque) {
    for (const purpose of purposes) {
      await prisma.consent.upsert({
        where: { userId_purpose: { userId: craque.id, purpose } },
        create: {
          userId: craque.id,
          purpose,
          granted: true,
          grantedAt: d(-30),
          ipAddress: '189.28.100.10',
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)',
        },
        update: {},
      })
    }
    console.log('[seed:compliance] ✓ Craque: todos os 5 consentimentos aceitos')
  }

  // Lenda — aceitos exceto MARKETING (revogado) e DATA_TERCEIROS (nunca concedido)
  if (lenda) {
    const lendaConsents: Array<{ purpose: typeof purposes[number]; granted: boolean; revokedAt: Date | null }> = [
      { purpose: 'ESSENTIAL', granted: true, revokedAt: null },
      { purpose: 'ANALYTICS', granted: true, revokedAt: null },
      { purpose: 'MARKETING', granted: false, revokedAt: d(-10) }, // revogado após aceitação inicial
      { purpose: 'DATA_TERCEIROS', granted: false, revokedAt: null }, // nunca aceito
      { purpose: 'AGE_VERIFICATION', granted: true, revokedAt: null },
    ]

    for (const c of lendaConsents) {
      await prisma.consent.upsert({
        where: { userId_purpose: { userId: lenda.id, purpose: c.purpose } },
        create: {
          userId: lenda.id,
          purpose: c.purpose,
          granted: c.granted,
          grantedAt: c.granted ? d(-60) : null,
          revokedAt: c.revokedAt,
          ipAddress: '200.151.10.5',
          userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)',
        },
        update: {},
      })
    }
    console.log('[seed:compliance] ✓ Lenda: ESSENTIAL+ANALYTICS+AGE aceitos, MARKETING revogado, DATA_TERCEIROS recusado')
  }

  // Jogador — apenas ESSENTIAL aceito (mínimo obrigatório)
  if (jogador) {
    for (const purpose of purposes) {
      await prisma.consent.upsert({
        where: { userId_purpose: { userId: jogador.id, purpose } },
        create: {
          userId: jogador.id,
          purpose,
          granted: purpose === 'ESSENTIAL', // só ESSENTIAL obrigatório
          grantedAt: purpose === 'ESSENTIAL' ? d(-15) : null,
          ipAddress: '45.174.50.20',
          userAgent: 'Mozilla/5.0 (Linux; Android 13)',
        },
        update: {},
      })
    }
    console.log('[seed:compliance] ✓ Jogador: apenas ESSENTIAL aceito (edge case usuário mínimo)')
  }

  // Usuário com age_verification_pending — consentimento ESSENTIAL registrado
  // mas AGE_VERIFICATION pendente (FlagCheck indisponível no cadastro — US-001 DEGRADED)
  if (agePending) {
    await prisma.consent.upsert({
      where: { userId_purpose: { userId: agePending.id, purpose: 'ESSENTIAL' } },
      create: {
        userId: agePending.id,
        purpose: 'ESSENTIAL',
        granted: true,
        grantedAt: d(-1),
        ipAddress: '189.28.200.50',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
      },
      update: {},
    })

    await prisma.consent.upsert({
      where: { userId_purpose: { userId: agePending.id, purpose: 'AGE_VERIFICATION' } },
      create: {
        userId: agePending.id,
        purpose: 'AGE_VERIFICATION',
        granted: false, // pendente — FlagCheck não concluiu
        grantedAt: null,
        ipAddress: '189.28.200.50',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0)',
      },
      update: {},
    })
    console.log('[seed:compliance] ✓ AgePending: ESSENTIAL aceito, AGE_VERIFICATION pendente (US-001 DEGRADED)')
  }

  // Usuário sem-tour — ESSENTIAL aceito, nenhum outro (saiu no meio do wizard)
  if (semTour) {
    await prisma.consent.upsert({
      where: { userId_purpose: { userId: semTour.id, purpose: 'ESSENTIAL' } },
      create: {
        userId: semTour.id,
        purpose: 'ESSENTIAL',
        granted: true,
        grantedAt: d(-5),
        ipAddress: '177.100.200.30',
        userAgent: 'Mozilla/5.0 (iPad; CPU OS 16)',
      },
      update: {},
    })
    console.log('[seed:compliance] ✓ SemTour: apenas ESSENTIAL (saiu no wizard antes de finalizar)')
  }
}
