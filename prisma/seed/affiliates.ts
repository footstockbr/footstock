/**
 * Seed: Affiliates — AffiliateCode e AffiliateTransactions.
 * Cobre AffiliateStatus: PENDING, PROCESSING, PAID.
 * TransactionType: SIGNUP, CONVERSION, RENEWAL.
 * Persona: Influenciador (Lucas) e Time Parceiro (clube-parceiro).
 * Idempotente (upsert por id fixo).
 */
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

const now = new Date()
const d = (offsetDays: number) => new Date(now.getTime() + offsetDays * 86_400_000)

export async function seedAffiliates() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[seed:affiliates] Seeds não executam em produção.')
  }

  const [lenda, craque, jogador, clubeParceiro] = await Promise.all([
    prisma.user.findUnique({ where: { email: 'lenda@foot-stock.test' } }),
    prisma.user.findUnique({ where: { email: 'craque@foot-stock.test' } }),
    prisma.user.findUnique({ where: { email: 'jogador@foot-stock.test' } }),
    prisma.user.findUnique({ where: { email: 'clube-parceiro@foot-stock.test' } }),
  ])

  if (!lenda || !craque || !jogador) {
    throw new Error('[seed:affiliates] Usuários âncora não encontrados.')
  }

  // ─── AffiliateCode — Lenda como influenciador ─────────────────────────────
  const influencerCode = await prisma.affiliateCode.upsert({
    where: { userId: lenda.id },
    create: {
      id: 'aff-code-lenda',
      userId: lenda.id,
      code: 'LENDA2026',
      affiliateType: 'INFLUENCER',
      commissionPercentage: 0.10, // 10%
      bankData: Prisma.JsonNull,
      active: true,
    },
    update: { active: true },
  })

  // AffiliateCode — Clube Parceiro (se existir)
  if (clubeParceiro) {
    await prisma.affiliateCode.upsert({
      where: { userId: clubeParceiro.id },
      create: {
        id: 'aff-code-clube',
        userId: clubeParceiro.id,
        code: 'CLUBEFOOT2026',
        affiliateType: 'CLUB_PARTNER',
        commissionPercentage: 0.05, // 5% royalties
        bankData: Prisma.JsonNull,
        active: true,
      },
      update: { active: true },
    })
  }

  // ─── AffiliateTransactions ────────────────────────────────────────────────

  const txSeeds = [
    // SIGNUP — Craque se cadastrou via link do influenciador
    {
      id: 'afft-001',
      affiliateCodeId: influencerCode.id,
      referredUserId: craque.id,
      subscriptionId: null,
      transactionType: 'SIGNUP',
      amount: 0, // signup não gera comissão monetária, só rastreia
      status: 'PAID' as const,
      paidAt: d(-20),
    },
    // CONVERSION — Craque assinou o plano (gera comissão)
    {
      id: 'afft-002',
      affiliateCodeId: influencerCode.id,
      referredUserId: craque.id,
      subscriptionId: 'sub-craque-active',
      transactionType: 'CONVERSION',
      amount: 1.99, // 10% de R$19,90
      status: 'PAID' as const,
      paidAt: d(-15),
    },
    // RENEWAL — Renovação de assinatura (PENDING — aguardando pagamento ao afiliado)
    {
      id: 'afft-003',
      affiliateCodeId: influencerCode.id,
      referredUserId: craque.id,
      subscriptionId: 'sub-craque-active',
      transactionType: 'RENEWAL',
      amount: 1.99,
      status: 'PENDING' as const,
      paidAt: null,
    },
    // SIGNUP de um segundo usuário (Jogador) via mesmo código
    {
      id: 'afft-004',
      affiliateCodeId: influencerCode.id,
      referredUserId: jogador.id,
      subscriptionId: null,
      transactionType: 'SIGNUP',
      amount: 0,
      status: 'PROCESSING' as const, // em processamento
      paidAt: null,
    },
  ]

  for (const tx of txSeeds) {
    await prisma.affiliateTransaction.upsert({
      where: { id: tx.id },
      create: {
        id: tx.id,
        affiliateCodeId: tx.affiliateCodeId,
        referredUserId: tx.referredUserId,
        subscriptionId: tx.subscriptionId,
        transactionType: tx.transactionType,
        amount: tx.amount,
        status: tx.status,
        paidAt: tx.paidAt,
      },
      update: {},
    })
  }

  console.log('[seed:affiliates] ✓ AffiliateCodes: 2 (INFLUENCER, CLUB_PARTNER)')
  console.log('[seed:affiliates] ✓ AffiliateTransactions: 4 (SIGNUP×2, CONVERSION, RENEWAL × PAID/PENDING/PROCESSING)')
}
