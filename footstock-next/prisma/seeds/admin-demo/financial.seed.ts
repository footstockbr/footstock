/**
 * Seed: Dados financeiros de demonstração — assinaturas e pagamentos
 * Module: module-23-admin-usuarios-financeiro / TASK-5
 *
 * MRR canônico de demonstração: R$ 79,70
 * (2x Craque R$19,90 + 1x Lenda R$39,90 = R$79,70)
 */

import type { PrismaClient } from '@prisma/client'

// MRR canônico para demonstração (invariante TASK-0/ST001)
const DEMO_MRR = 79.70

export async function seedAdminDemoFinancial(prisma: PrismaClient): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[seed] Não executar seed de demo em produção!')
  }

  console.log('[seed] Iniciando seed financeiro...')
  console.log(`[seed] MRR canônico de demo: R$ ${DEMO_MRR}`)

  // Buscar usuários de demonstração
  const craque1 = await prisma.user.findUnique({ where: { email: 'craque@foot-stock.dev' } })
  const lenda1 = await prisma.user.findUnique({ where: { email: 'lenda@foot-stock.dev' } })

  if (!craque1 || !lenda1) {
    console.log('[seed] ⚠ Usuários craque/lenda não encontrados — execute users.seed primeiro')
    return
  }

  const now = new Date()
  const subscriptionData = [
    { userId: craque1.id, planType: 'CRAQUE' as const, amount: 19.9 },
    { userId: lenda1.id, planType: 'LENDA' as const, amount: 39.9 },
  ]

  for (const sub of subscriptionData) {
    const existing = await prisma.subscription.findFirst({ where: { userId: sub.userId } })
    if (!existing) {
      const subscription = await prisma.subscription.create({
        data: {
          userId: sub.userId,
          planType: sub.planType,
          gateway: 'MERCADO_PAGO',
          period: 'MONTHLY',
          amount: sub.amount,
          status: 'ACTIVE',
          startsAt: new Date(now.getFullYear(), now.getMonth(), 1),
          expiresAt: new Date(now.getFullYear(), now.getMonth() + 1, 1),
        },
      })

      // Criar pagamento aprovado para esta assinatura
      await prisma.payment.create({
        data: {
          userId: sub.userId,
          subscriptionId: subscription.id,
          gateway: 'MERCADO_PAGO',
          gatewayTransactionId: `DEMO-${sub.userId.slice(0, 8)}-${Date.now()}`,
          amount: sub.amount,
          status: 'PAID',
          processedAt: now,
        },
      })

      // Criar histórico de 30 dias de pagamentos para o gráfico de MRR
      for (let i = 29; i >= 1; i--) {
        const date = new Date(now)
        date.setDate(date.getDate() - i)
        await prisma.payment.create({
          data: {
            userId: sub.userId,
            subscriptionId: subscription.id,
            gateway: 'MERCADO_PAGO',
            gatewayTransactionId: `DEMO-HIST-${sub.userId.slice(0, 8)}-${i}-${Date.now()}`,
            amount: sub.amount,
            status: 'PAID',
            processedAt: date,
            createdAt: date,
          },
        })
      }

      console.log(`[seed]   ✓ Assinatura ${sub.planType} + 30 pagamentos para ${sub.userId.slice(0, 8)}...`)
    } else {
      console.log(`[seed]   ↩ Assinatura já existe para ${sub.userId.slice(0, 8)}...`)
    }
  }

  const actualMrr = subscriptionData.reduce((acc, s) => acc + s.amount, 0)
  console.log(`[seed] MRR gerado: R$ ${actualMrr.toFixed(2)} (canônico: R$ ${DEMO_MRR})`)
  console.log('[seed] Seed financeiro concluído')
}
