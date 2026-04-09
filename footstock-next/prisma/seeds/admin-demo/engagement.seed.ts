/**
 * Seed: Dados de engajamento para demonstração
 * Module: module-23-admin-dashboard-motor
 *
 * Cria Orders, Transactions e Positions para popular o dashboard de Engajamento
 * com dados realistas de trading.
 *
 * GUARD: Não executar em produção
 */

import type { PrismaClient } from '@prisma/client'

export async function seedAdminDemoEngagement(prisma: PrismaClient): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[seed] Não executar seed de demo em produção!')
  }

  console.log('[seed] Iniciando seed de engajamento...')

  // Buscar usuários de demonstração
  const usuarios = await prisma.user.findMany({
    where: {
      email: {
        in: [
          'usuario@foot-stock.dev',
          'craque@foot-stock.dev',
          'lenda@foot-stock.dev',
        ],
      },
    },
  })

  if (usuarios.length === 0) {
    console.log('[seed] ⚠ Usuários de demo não encontrados — execute users.seed primeiro')
    return
  }

  // Buscar alguns ativos para trading
  const assets = await prisma.asset.findMany({ take: 5 })
  if (assets.length === 0) {
    console.log('[seed] ⚠ Ativos não encontrados — crie alguns ativos primeiro')
    return
  }

  const now = new Date()
  const sub30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  let ordersCreated = 0
  let transactionsCreated = 0

  // Para cada usuário, criar ordens e transações de trading
  for (const usuario of usuarios) {
    console.log(`[seed] Criando trading data para ${usuario.name}...`)

    // Criar 10-15 ordens FILLED (compras e vendas)
    const numOrders = Math.floor(Math.random() * 6) + 10 // 10-15 ordens

    for (let i = 0; i < numOrders; i++) {
      const asset = assets[Math.floor(Math.random() * assets.length)]
      const isBuy = Math.random() > 0.4 // 60% BUY, 40% SELL
      const quantity = Math.floor(Math.random() * 500) + 50 // 50-550 cotas
      const priceNum = Math.random() * 100 + 10 // R$10-110
      const price = Math.round(priceNum * 100) / 100

      // Data aleatória nos últimos 30 dias
      const daysAgo = Math.floor(Math.random() * 30)
      const orderDate = new Date(now)
      orderDate.setDate(orderDate.getDate() - daysAgo)

      const fee = Math.max(10, Math.round(price * quantity * 0.001 * 100) / 100)
      const totalAmount = Math.round(price * quantity * 100) / 100

      const order = await prisma.order.create({
        data: {
          userId: usuario.id,
          assetId: asset.id,
          type: 'MARKET',
          side: isBuy ? 'BUY' : 'SELL',
          status: 'FILLED',
          quantity,
          price,
          executedPrice: price,
          fee,
          executedAt: orderDate,
          createdAt: orderDate,
        },
      })

      // Criar transaction correspondente
      const fsAmount = isBuy ? -(totalAmount + fee) : totalAmount - fee

      await prisma.transaction.create({
        data: {
          userId: usuario.id,
          assetId: asset.id,
          orderId: order.id,
          type: 'MARKET',
          financialType: 'TRADE',
          side: isBuy ? 'BUY' : 'SELL',
          quantity,
          price,
          fee,
          totalAmount,
          fsAmount,
          createdAt: orderDate,
        },
      })

      ordersCreated++
      transactionsCreated++
    }

    // Criar 2-4 transações de BONUS/DIVIDENDOS (aleatoriamente)
    const numBonuses = Math.floor(Math.random() * 3) + 1

    for (let i = 0; i < numBonuses; i++) {
      const asset = assets[Math.floor(Math.random() * assets.length)]
      const bonusAmount = Math.round((Math.random() * 500 + 50) * 100) / 100

      const bonusDate = new Date(now)
      bonusDate.setDate(bonusDate.getDate() - Math.floor(Math.random() * 30))

      await prisma.transaction.create({
        data: {
          userId: usuario.id,
          assetId: asset.id,
          type: 'MARKET',
          financialType: 'BONUS',
          side: 'BUY', // Bônus é sempre crédito
          quantity: 0,
          price: 0,
          fee: 0,
          totalAmount: 0,
          fsAmount: bonusAmount,
          createdAt: bonusDate,
        },
      })

      transactionsCreated++
    }

    // Criar 1-2 transações de TAXAS (SHORT_INTEREST, LEVERAGE_INTEREST)
    const numTaxes = Math.floor(Math.random() * 2) + 1

    for (let i = 0; i < numTaxes; i++) {
      const asset = assets[Math.floor(Math.random() * assets.length)]
      const taxAmount = Math.round((Math.random() * 100 + 10) * 100) / 100

      const taxDate = new Date(now)
      taxDate.setDate(taxDate.getDate() - Math.floor(Math.random() * 30))

      await prisma.transaction.create({
        data: {
          userId: usuario.id,
          assetId: asset.id,
          type: 'MARKET',
          financialType: Math.random() > 0.5 ? 'SHORT_INTEREST' : 'LEVERAGE_INTEREST',
          side: 'SELL', // Taxa é sempre débito
          quantity: 0,
          price: 0,
          fee: 0,
          totalAmount: 0,
          fsAmount: -taxAmount,
          createdAt: taxDate,
        },
      })

      transactionsCreated++
    }
  }

  console.log(`[seed]   ✓ ${ordersCreated} ordens criadas`)
  console.log(`[seed]   ✓ ${transactionsCreated} transações criadas`)
  console.log('[seed] Seed de engajamento concluído')
}
