import { prisma } from '@/lib/prisma'

/**
 * Seeds de subscriptions de teste.
 * Cria assinaturas ativas para usuários com planos CRAQUE e LENDA.
 */
export async function seedSubscriptions() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[seed:subscriptions] Seeds não executam em produção.')
  }

  const usersWithPlans = [
    { email: 'superadmin@foot-stock.test', planType: 'LENDA' as const },
    { email: 'admin@foot-stock.test', planType: 'LENDA' as const },
    { email: 'craque@foot-stock.test', planType: 'CRAQUE' as const },
  ]

  const now = new Date()
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) // +30 dias

  for (const { email, planType } of usersWithPlans) {
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      console.warn(`[seed:subscriptions] Usuário ${email} não encontrado — skip`)
      continue
    }

    await prisma.subscription.upsert({
      where: { id: `sub-test-${user.id}` },
      create: {
        id: `sub-test-${user.id}`,
        userId: user.id,
        planType,
        status: 'ACTIVE',
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
      },
      update: {
        planType,
        status: 'ACTIVE',
        currentPeriodEnd: periodEnd,
      },
    })

    console.log(`[seed:subscriptions] ✓ ${email} (${planType} ativo até ${periodEnd.toISOString().slice(0, 10)})`)
  }
}
