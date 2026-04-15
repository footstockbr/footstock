/**
 * Seed: Orders, Positions, Transactions, PriceHistory.
 * Cobre TODOS os enums: OrderType, OrderSide, OrderStatus, PositionSide, PositionStatus,
 * FinancialType, SessionType.
 * Idempotente (upsert por id fixo).
 */
import { prisma } from '@/lib/prisma'

const now = new Date()
const d = (offsetDays: number) => new Date(now.getTime() + offsetDays * 86_400_000)
const h = (offsetHours: number) => new Date(now.getTime() + offsetHours * 3_600_000)

export async function seedOrders() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[seed:orders] Seeds não executam em produção.')
  }

  // Buscar usuários e assets âncora
  const [craque, lenda, jogador] = await Promise.all([
    prisma.user.findUnique({ where: { email: 'craque@foot-stock.test' } }),
    prisma.user.findUnique({ where: { email: 'lenda@foot-stock.test' } }),
    prisma.user.findUnique({ where: { email: 'jogador@foot-stock.test' } }),
  ])

  if (!craque || !lenda || !jogador) {
    throw new Error('[seed:orders] Usuários âncora não encontrados.')
  }

  // Pegar assets existentes
  const assets = await prisma.asset.findMany({ take: 6, orderBy: { ticker: 'asc' } })
  if (assets.length < 3) throw new Error('[seed:orders] Poucos assets — execute seedAssets primeiro.')

  const [a1, a2, a3, a4, a5] = assets

  // =========================================================================
  // ORDERS — cobertura de todos os tipos e status
  // =========================================================================

  const orderSeeds = [
    // MARKET BUY FILLED
    {
      id: 'ord-001', userId: jogador.id, assetId: a1!.id, type: 'MARKET' as const,
      side: 'BUY' as const, status: 'FILLED' as const, quantity: 10,
      price: null, executedPrice: a1!.currentPrice, fee: 0.05,
      executedAt: d(-5),
    },
    // MARKET SELL FILLED
    {
      id: 'ord-002', userId: jogador.id, assetId: a1!.id, type: 'MARKET' as const,
      side: 'SELL' as const, status: 'FILLED' as const, quantity: 5,
      price: null, executedPrice: a1!.currentPrice, fee: 0.05,
      executedAt: d(-3),
    },
    // LIMIT BUY OPEN
    {
      id: 'ord-003', userId: craque.id, assetId: a2!.id, type: 'LIMIT' as const,
      side: 'BUY' as const, status: 'OPEN' as const, quantity: 20,
      price: Number(a2!.currentPrice) * 0.95, executedPrice: null, fee: 0,
      executedAt: null,
    },
    // LIMIT SELL CANCELLED
    {
      id: 'ord-004', userId: craque.id, assetId: a2!.id, type: 'LIMIT' as const,
      side: 'SELL' as const, status: 'CANCELLED' as const, quantity: 15,
      price: Number(a2!.currentPrice) * 1.1, executedPrice: null, fee: 0,
      executedAt: null,
    },
    // STOP_LOSS SELL OPEN
    {
      id: 'ord-005', userId: lenda.id, assetId: a3!.id, type: 'STOP_LOSS' as const,
      side: 'SELL' as const, status: 'OPEN' as const, quantity: 30,
      price: Number(a3!.currentPrice) * 0.85, executedPrice: null, fee: 0,
      executedAt: null,
    },
    // TAKE_PROFIT SELL EXPIRED
    {
      id: 'ord-006', userId: lenda.id, assetId: a3!.id, type: 'TAKE_PROFIT' as const,
      side: 'SELL' as const, status: 'EXPIRED' as const, quantity: 10,
      price: Number(a3!.currentPrice) * 1.2, executedPrice: null, fee: 0,
      expiresAt: d(-1), executedAt: null,
    },
    // OCO pair — simula order com groupId
    {
      id: 'ord-007', userId: lenda.id, assetId: a4!.id, type: 'OCO' as const,
      side: 'SELL' as const, status: 'OPEN' as const, quantity: 25,
      price: Number(a4!.currentPrice) * 1.15, executedPrice: null, fee: 0,
      groupId: 'oco-group-lenda-001', executedAt: null,
    },
    {
      id: 'ord-008', userId: lenda.id, assetId: a4!.id, type: 'OCO' as const,
      side: 'SELL' as const, status: 'OPEN' as const, quantity: 25,
      price: Number(a4!.currentPrice) * 0.88, executedPrice: null, fee: 0,
      groupId: 'oco-group-lenda-001', executedAt: null,
    },
    // SCHEDULED BUY OPEN (alavancagem 2x — Lenda)
    {
      id: 'ord-009', userId: lenda.id, assetId: a5!.id, type: 'SCHEDULED' as const,
      side: 'BUY' as const, status: 'OPEN' as const, quantity: 50,
      price: Number(a5!.currentPrice), executedPrice: null, fee: 0,
      scheduledAt: d(2), leverageMultiplier: 2, executedAt: null,
    },
    // MARKET BUY PARTIAL
    {
      id: 'ord-010', userId: craque.id, assetId: a5!.id, type: 'MARKET' as const,
      side: 'BUY' as const, status: 'PARTIAL' as const, quantity: 40,
      price: null, executedPrice: Number(a5!.currentPrice), fee: 0.02,
      executedAt: d(-1),
    },
  ]

  for (const o of orderSeeds) {
    await prisma.order.upsert({
      where: { id: o.id },
      create: {
        id: o.id,
        userId: o.userId,
        assetId: o.assetId,
        type: o.type,
        side: o.side,
        status: o.status,
        quantity: o.quantity,
        price: o.price ?? null,
        executedPrice: o.executedPrice ?? null,
        fee: o.fee,
        expiresAt: (o as { expiresAt?: Date }).expiresAt ?? null,
        scheduledAt: (o as { scheduledAt?: Date }).scheduledAt ?? null,
        groupId: (o as { groupId?: string }).groupId ?? null,
        leverageMultiplier: (o as { leverageMultiplier?: number }).leverageMultiplier ?? 1,
        executedAt: o.executedAt ?? null,
      },
      update: {},
    })
  }

  console.log('[seed:orders] ✓ 10 orders (MARKET, LIMIT, STOP_LOSS, TAKE_PROFIT, OCO, SCHEDULED × BUY/SELL × todos os status)')

  // =========================================================================
  // POSITIONS — LONG/SHORT × OPEN/CLOSED
  // =========================================================================

  const positionSeeds = [
    // LONG OPEN — Jogador comprado em a1
    {
      id: 'pos-001', userId: jogador.id, assetId: a1!.id,
      quantity: 5, avgPrice: Number(a1!.currentPrice), totalInvested: 5 * Number(a1!.currentPrice),
      side: 'LONG' as const, status: 'OPEN' as const,
      marginBlocked: 0, leverageMultiplier: 1, leverageAmount: 0,
      dailyInterestRate: 0, interestAccrued: 0, openedAt: d(-5),
    },
    // LONG CLOSED — Craque liquidou posição
    {
      id: 'pos-002', userId: craque.id, assetId: a2!.id,
      quantity: 0, avgPrice: Number(a2!.currentPrice) * 0.9, totalInvested: 0,
      side: 'LONG' as const, status: 'CLOSED' as const,
      marginBlocked: 0, leverageMultiplier: 1, leverageAmount: 0,
      dailyInterestRate: 0, interestAccrued: 0, openedAt: d(-20),
    },
    // SHORT OPEN — Lenda vendendo a descoberto (ativo a3)
    {
      id: 'pos-003', userId: lenda.id, assetId: a3!.id,
      quantity: 30, avgPrice: Number(a3!.currentPrice) * 1.05, totalInvested: 30 * Number(a3!.currentPrice),
      side: 'SHORT' as const, status: 'OPEN' as const,
      marginBlocked: 30 * Number(a3!.currentPrice) * 0.3, // 30% de margem
      leverageMultiplier: 1, leverageAmount: 0,
      dailyInterestRate: 0.001, interestAccrued: 3.5, openedAt: d(-3),
    },
    // LONG OPEN com alavancagem 2x — Lenda
    {
      id: 'pos-004', userId: lenda.id, assetId: a5!.id,
      quantity: 50, avgPrice: Number(a5!.currentPrice), totalInvested: 50 * Number(a5!.currentPrice),
      side: 'LONG' as const, status: 'OPEN' as const,
      marginBlocked: 25 * Number(a5!.currentPrice), // 50% como garantia
      leverageMultiplier: 2, leverageAmount: 25 * Number(a5!.currentPrice),
      dailyInterestRate: 0.0015, interestAccrued: 1.2, openedAt: d(-2),
    },
    // SHORT CLOSED — Craque encerrou short
    {
      id: 'pos-005', userId: craque.id, assetId: a4!.id,
      quantity: 0, avgPrice: Number(a4!.currentPrice), totalInvested: 0,
      side: 'SHORT' as const, status: 'CLOSED' as const,
      marginBlocked: 0, leverageMultiplier: 1, leverageAmount: 0,
      dailyInterestRate: 0.001, interestAccrued: 0, openedAt: d(-10),
    },
  ]

  for (const p of positionSeeds) {
    await prisma.position.upsert({
      where: { id: p.id },
      create: {
        id: p.id,
        userId: p.userId,
        assetId: p.assetId,
        quantity: p.quantity,
        avgPrice: p.avgPrice,
        totalInvested: p.totalInvested,
        side: p.side,
        status: p.status,
        marginBlocked: p.marginBlocked,
        leverageMultiplier: p.leverageMultiplier,
        leverageAmount: p.leverageAmount,
        dailyInterestRate: p.dailyInterestRate,
        interestAccrued: p.interestAccrued,
        openedAt: p.openedAt,
      },
      update: {},
    })
  }

  console.log('[seed:orders] ✓ 5 posições (LONG/SHORT × OPEN/CLOSED, com alavancagem e margem)')

  // =========================================================================
  // TRANSACTIONS — FinancialType cobertura
  // =========================================================================

  const txSeeds = [
    // TRADE BUY (referencia ord-001)
    {
      id: 'tx-001', userId: jogador.id, assetId: a1!.id, orderId: 'ord-001',
      type: 'MARKET' as const, financialType: 'TRADE' as const, side: 'BUY' as const,
      quantity: 10, price: Number(a1!.currentPrice), fee: 0.05,
      totalAmount: 10 * Number(a1!.currentPrice),
      fsAmount: -(10 * Number(a1!.currentPrice)),
      balanceBefore: 2000, balanceAfter: 2000 - 10 * Number(a1!.currentPrice),
    },
    // TRADE SELL (referencia ord-002)
    {
      id: 'tx-002', userId: jogador.id, assetId: a1!.id, orderId: 'ord-002',
      type: 'MARKET' as const, financialType: 'TRADE' as const, side: 'SELL' as const,
      quantity: 5, price: Number(a1!.currentPrice), fee: 0.05,
      totalAmount: 5 * Number(a1!.currentPrice),
      fsAmount: 5 * Number(a1!.currentPrice),
      balanceBefore: 2000 - 10 * Number(a1!.currentPrice),
      balanceAfter: 2000 - 5 * Number(a1!.currentPrice),
    },
    // BONUS — bônus de boas-vindas
    {
      id: 'tx-003', userId: craque.id, assetId: a1!.id, orderId: null,
      type: 'MARKET' as const, financialType: 'BONUS' as const, side: 'BUY' as const,
      quantity: 0, price: 1, fee: 0, totalAmount: 500, fsAmount: 500,
      balanceBefore: 5000, balanceAfter: 5500,
    },
    // DEPOSIT — aporte inicial
    {
      id: 'tx-004', userId: lenda.id, assetId: a1!.id, orderId: null,
      type: 'MARKET' as const, financialType: 'DEPOSIT' as const, side: 'BUY' as const,
      quantity: 0, price: 1, fee: 0, totalAmount: 25000, fsAmount: 25000,
      balanceBefore: 0, balanceAfter: 25000,
    },
    // WITHDRAWAL — saque simulado
    {
      id: 'tx-005', userId: lenda.id, assetId: a1!.id, orderId: null,
      type: 'MARKET' as const, financialType: 'WITHDRAWAL' as const, side: 'SELL' as const,
      quantity: 0, price: 1, fee: 0, totalAmount: 1000, fsAmount: -1000,
      balanceBefore: 25000, balanceAfter: 24000,
    },
    // SHORT_INTEREST — juros de posição short
    {
      id: 'tx-006', userId: lenda.id, assetId: a3!.id, orderId: null,
      type: 'MARKET' as const, financialType: 'SHORT_INTEREST' as const, side: 'SELL' as const,
      quantity: 30, price: Number(a3!.currentPrice), fee: 0, totalAmount: 3.5, fsAmount: -3.5,
      balanceBefore: 24000, balanceAfter: 23996.5,
    },
    // MARGIN_BLOCKED — bloqueio de margem para short
    {
      id: 'tx-007', userId: lenda.id, assetId: a3!.id, orderId: null,
      type: 'MARKET' as const, financialType: 'MARGIN_BLOCKED' as const, side: 'SELL' as const,
      quantity: 30, price: Number(a3!.currentPrice), fee: 0,
      totalAmount: 30 * Number(a3!.currentPrice) * 0.3,
      fsAmount: -(30 * Number(a3!.currentPrice) * 0.3),
      balanceBefore: 25000, balanceAfter: 25000 - 30 * Number(a3!.currentPrice) * 0.3,
    },
    // SHORT_CLOSE — encerramento de short
    {
      id: 'tx-008', userId: craque.id, assetId: a4!.id, orderId: null,
      type: 'MARKET' as const, financialType: 'SHORT_CLOSE' as const, side: 'BUY' as const,
      quantity: 20, price: Number(a4!.currentPrice) * 0.92, fee: 0.05,
      totalAmount: 20 * Number(a4!.currentPrice) * 0.92,
      fsAmount: 20 * (Number(a4!.currentPrice) - Number(a4!.currentPrice) * 0.92),
      balanceBefore: 5000, balanceAfter: 5200,
    },
    // LEVERAGE_INTEREST — juros de alavancagem
    {
      id: 'tx-009', userId: lenda.id, assetId: a5!.id, orderId: null,
      type: 'MARKET' as const, financialType: 'LEVERAGE_INTEREST' as const, side: 'SELL' as const,
      quantity: 50, price: Number(a5!.currentPrice), fee: 0, totalAmount: 1.2, fsAmount: -1.2,
      balanceBefore: 23996.5, balanceAfter: 23995.3,
    },
  ]

  for (const tx of txSeeds) {
    await prisma.transaction.upsert({
      where: { id: tx.id },
      create: {
        id: tx.id,
        userId: tx.userId,
        assetId: tx.assetId,
        orderId: tx.orderId,
        type: tx.type,
        financialType: tx.financialType,
        side: tx.side,
        quantity: tx.quantity,
        price: tx.price,
        fee: tx.fee,
        totalAmount: tx.totalAmount,
        fsAmount: tx.fsAmount,
        balanceBefore: tx.balanceBefore,
        balanceAfter: tx.balanceAfter,
      },
      update: {},
    })
  }

  console.log('[seed:orders] ✓ 9 transações (TRADE, BONUS, DEPOSIT, WITHDRAWAL, SHORT_INTEREST, MARGIN_BLOCKED, SHORT_CLOSE, LEVERAGE_INTEREST)')

  // =========================================================================
  // PRICE HISTORY — SessionType cobertura
  // =========================================================================

  const sessions = ['PRE_OPENING', 'TRADING', 'CLOSING_CALL', 'AFTER_MARKET', 'CLOSED'] as const
  const asset = a1!

  for (let dayOffset = -7; dayOffset <= 0; dayOffset++) {
    for (const sessionType of sessions) {
      const base = Number(asset.currentPrice)
      const variation = (Math.random() - 0.5) * 0.04 // ±2%
      const open = base * (1 + variation)
      const high = open * 1.01
      const low = open * 0.99
      const close = (open + high + low) / 3

      const sessionHour = sessionType === 'PRE_OPENING' ? 8
        : sessionType === 'TRADING' ? 10
        : sessionType === 'CLOSING_CALL' ? 21
        : sessionType === 'AFTER_MARKET' ? 22
        : 2

      await prisma.priceHistory.upsert({
        where: { id: `ph-${asset.id}-${dayOffset}-${sessionType}` },
        create: {
          id: `ph-${asset.id}-${dayOffset}-${sessionType}`,
          assetId: asset.id,
          timestamp: new Date(d(dayOffset).setHours(sessionHour, 0, 0, 0)),
          open, high, low, close,
          volume: BigInt(Math.floor(Math.random() * 50000) + 1000),
          sessionType,
        },
        update: {},
      })
    }
  }

  console.log('[seed:orders] ✓ PriceHistory: 7 dias × 5 sessões (PRE_OPENING, TRADING, CLOSING_CALL, AFTER_MARKET, CLOSED)')
}
