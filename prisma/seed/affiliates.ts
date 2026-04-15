/**
 * Seed: Affiliates — AffiliateCode e AffiliateTransactions.
 * Cobre AffiliateStatus: PENDING, PROCESSING, PAID.
 * TransactionType: SIGNUP, CONVERSION, RENEWAL.
 * Persona: Influenciador (Lucas) e Time Parceiro (clube-parceiro).
 * Idempotente (upsert por id fixo).
 *
 * REGRA: Todo usuário deve ter um AffiliateCode (alinhado com /api/v1/auth/register).
 * - Tipo USER: commissionPercentage=0, sem acesso ao portal de afiliados
 * - Tipo INFLUENCIADOR: comissão configurável, acesso ao portal
 * - Tipo TIME_PARCEIRO: comissão configurável, acesso ao portal
 */
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

const now = new Date()
const d = (offsetDays: number) => new Date(now.getTime() + offsetDays * 86_400_000)

// Inline: espelho de @/lib/utils/affiliate-code-gen (sem depender do alias @/lib/*)
const BASE32_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
function _genCode(name: string): string {
  const prefix = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .slice(0, 5)
    .toUpperCase()
    .padEnd(5, 'X')
  let suffix = ''
  for (let i = 0; i < 4; i++) {
    suffix += BASE32_CHARS[Math.floor(Math.random() * BASE32_CHARS.length)]!
  }
  return prefix + suffix
}

async function uniqueCode(name: string): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = _genCode(name)
    const taken = await prisma.affiliateCode.findUnique({ where: { code } })
    if (!taken) return code
  }
  // fallback com alta entropia
  let code = 'FS'
  for (let i = 0; i < 7; i++) code += BASE32_CHARS[Math.floor(Math.random() * BASE32_CHARS.length)]!
  return code
}

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

  // ─── AffiliateCode — Lenda como INFLUENCIADOR ──────────────────────────────
  // CORRIGIDO: 'INFLUENCER' → 'INFLUENCIADOR' (alinhado com affiliate-auth.ts)
  const influencerCode = await prisma.affiliateCode.upsert({
    where: { userId: lenda.id },
    create: {
      id: 'aff-code-lenda',
      userId: lenda.id,
      code: 'LENDA2026',
      affiliateType: 'INFLUENCIADOR',
      commissionPercentage: 0.10,
      bankData: Prisma.JsonNull,
      active: true,
    },
    update: {
      code: 'LENDA2026',
      affiliateType: 'INFLUENCIADOR',
      commissionPercentage: 0.10,
      active: true,
    },
  })

  // AffiliateCode — Clube Parceiro como TIME_PARCEIRO
  // CORRIGIDO: 'CLUB_PARTNER' → 'TIME_PARCEIRO' (alinhado com affiliate-auth.ts)
  if (clubeParceiro) {
    await prisma.affiliateCode.upsert({
      where: { userId: clubeParceiro.id },
      create: {
        id: 'aff-code-clube',
        userId: clubeParceiro.id,
        code: 'CLUBEFOOT2026',
        affiliateType: 'TIME_PARCEIRO',
        commissionPercentage: 0.05,
        bankData: Prisma.JsonNull,
        active: true,
      },
      update: {
        code: 'CLUBEFOOT2026',
        affiliateType: 'TIME_PARCEIRO',
        commissionPercentage: 0.05,
        active: true,
      },
    })
  }

  // ─── AffiliateCode USER — todos os outros usuários ────────────────────────
  // Garante que TODOS os usuários tenham um AffiliateCode (regra de negócio:
  // /api/v1/auth/register cria automaticamente; seed precisa fazer o mesmo).
  const allUsers = await prisma.user.findMany({
    select: { id: true, name: true },
  })

  let createdCount = 0
  for (const user of allUsers) {
    const existing = await prisma.affiliateCode.findUnique({ where: { userId: user.id } })
    if (existing) continue

    const code = await uniqueCode(user.name)
    await prisma.affiliateCode.create({
      data: {
        userId: user.id,
        code,
        affiliateType: 'USER',
        commissionPercentage: 0,
        bankData: Prisma.JsonNull,
        active: true,
      },
    })
    createdCount++
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
      amount: 0,
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
      amount: 1.99,
      status: 'PAID' as const,
      paidAt: d(-15),
    },
    // SUBSCRIPTION_RENEWAL — Renovação (PENDING — aguardando pagamento ao afiliado)
    // CORRIGIDO: 'RENEWAL' → 'SUBSCRIPTION_RENEWAL' (alinhado com payments/webhook/route.ts)
    {
      id: 'afft-003',
      affiliateCodeId: influencerCode.id,
      referredUserId: craque.id,
      subscriptionId: 'sub-craque-active',
      transactionType: 'SUBSCRIPTION_RENEWAL',
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
      status: 'PROCESSING' as const,
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

  console.log(`[seed:affiliates] ✓ AffiliateCodes especiais: INFLUENCIADOR (lenda), TIME_PARCEIRO (clube)`)
  console.log(`[seed:affiliates] ✓ AffiliateCodes USER criados para ${createdCount} usuário(s) sem código`)
  console.log('[seed:affiliates] ✓ AffiliateTransactions: 4 (SIGNUP×2, CONVERSION, RENEWAL × PAID/PENDING/PROCESSING)')
}
