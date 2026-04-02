/**
 * Seed: Dividends — cobre todos os DividendStatus (CREDITED, PENDING, EXPIRADO)
 * e DividendType (ESPORTIVO, FINANCEIRO). Inclui edge case de dividendo com
 * trigger de VITORIA e TITULO (esportivo).
 * Idempotente (upsert por id fixo).
 */
import { prisma } from '@/lib/prisma'

const now = new Date()
const d = (offsetDays: number) => new Date(now.getTime() + offsetDays * 86_400_000)

export async function seedDividends() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[seed:dividends] Seeds não executam em produção.')
  }

  const [craque, lenda, jogador] = await Promise.all([
    prisma.user.findUnique({ where: { email: 'craque@foot-stock.test' } }),
    prisma.user.findUnique({ where: { email: 'lenda@foot-stock.test' } }),
    prisma.user.findUnique({ where: { email: 'jogador@foot-stock.test' } }),
  ])

  if (!craque || !lenda || !jogador) {
    throw new Error('[seed:dividends] Usuários âncora não encontrados.')
  }

  const dividendSeeds = [
    // FINANCEIRO CREDITED — já pago
    {
      id: 'div-001', userId: lenda.id, ticker: 'PAL3', clubName: 'Palmeiras',
      type: 'FINANCEIRO', amount: 45.00, yieldPercent: 1.8,
      status: 'CREDITED', processedMonth: '2026-03',
      scheduledFor: d(-5), triggerEvent: null,
    },
    // FINANCEIRO PENDING — aguardando processamento (dentro dos 7 dias)
    {
      id: 'div-002', userId: craque.id, ticker: 'FLA3', clubName: 'Flamengo',
      type: 'FINANCEIRO', amount: 12.50, yieldPercent: 0.9,
      status: 'PENDING', processedMonth: '2026-03',
      scheduledFor: d(3), triggerEvent: null,
    },
    // FINANCEIRO EXPIRADO — não creditado após 7 dias (edge case)
    {
      id: 'div-003', userId: jogador.id, ticker: 'GRE3', clubName: 'Grêmio',
      type: 'FINANCEIRO', amount: 5.00, yieldPercent: 0.5,
      status: 'EXPIRADO', processedMonth: '2026-02',
      scheduledFor: d(-10), triggerEvent: null,
    },
    // ESPORTIVO CREDITED — vitória no campeonato
    {
      id: 'div-004', userId: lenda.id, ticker: 'PAL3', clubName: 'Palmeiras',
      type: 'ESPORTIVO', amount: 25.00, yieldPercent: 1.0,
      status: 'CREDITED', processedMonth: '2026-03',
      scheduledFor: d(-2), triggerEvent: 'VITORIA',
    },
    // ESPORTIVO CREDITED — título nacional (TITULO)
    {
      id: 'div-005', userId: lenda.id, ticker: 'FLA3', clubName: 'Flamengo',
      type: 'ESPORTIVO', amount: 150.00, yieldPercent: 5.0,
      status: 'CREDITED', processedMonth: '2026-01',
      scheduledFor: d(-60), triggerEvent: 'TITULO',
    },
    // ESPORTIVO PENDING — vitória recente aguardando crédito
    {
      id: 'div-006', userId: craque.id, ticker: 'FLA3', clubName: 'Flamengo',
      type: 'ESPORTIVO', amount: 18.00, yieldPercent: 0.8,
      status: 'PENDING', processedMonth: null,
      scheduledFor: d(2), triggerEvent: 'VITORIA',
    },
    // FINANCEIRO CREDITED — Lenda, mês anterior
    {
      id: 'div-007', userId: lenda.id, ticker: 'INT3', clubName: 'Internacional',
      type: 'FINANCEIRO', amount: 30.00, yieldPercent: 1.2,
      status: 'CREDITED', processedMonth: '2026-02',
      scheduledFor: d(-30), triggerEvent: null,
    },
    // Edge case: PENDING perto do prazo (5 dias restantes)
    {
      id: 'div-008', userId: jogador.id, ticker: 'FLA3', clubName: 'Flamengo',
      type: 'FINANCEIRO', amount: 3.50, yieldPercent: 0.3,
      status: 'PENDING', processedMonth: '2026-03',
      scheduledFor: d(2), triggerEvent: null,
    },
  ]

  for (const div of dividendSeeds) {
    await prisma.dividend.upsert({
      where: { id: div.id },
      create: {
        id: div.id,
        userId: div.userId,
        ticker: div.ticker,
        clubName: div.clubName,
        type: div.type,
        amount: div.amount,
        yieldPercent: div.yieldPercent,
        status: div.status,
        processedMonth: div.processedMonth,
        scheduledFor: div.scheduledFor,
        triggerEvent: div.triggerEvent,
      },
      update: {},
    })
  }

  console.log('[seed:dividends] ✓ 8 dividendos (FINANCEIRO/ESPORTIVO × CREDITED/PENDING/EXPIRADO, VITORIA e TITULO)')
}
