// ============================================================================
// FootStock — Integration Tests: Factory Helpers
// Cria dados de teste únicos no banco real.
// Todos os usuários usam domínio @integration-test.local para cleanup seguro.
// ============================================================================

import { PrismaClient } from '@prisma/client'
import crypto from 'crypto'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type TestRole = 'JOGADOR' | 'CRAQUE' | 'LENDA'
export type TestAdminRole = 'SUPER_ADMIN' | 'ADMINISTRADOR' | 'MONITOR' | 'EDITOR' | 'MODERADOR'

export interface CreateTestUserOptions {
  planType?: TestRole
  adminRole?: TestAdminRole | null
  status?: 'ACTIVE' | 'SUSPENDED' | 'BANNED'
  fsBalance?: number
  // `birthDate` substituiu a antiga coluna `ageVerificationPending`: a verificacao
  // de maioridade virou funcao pura sobre a data declarada (verifyAge, T-023),
  // aplicada no cadastro -- nao ha mais flag persistida por usuario.
  birthDate?: Date | null
  email?: string
  name?: string
  favoriteClub?: string
}

// ─── Utilitários ─────────────────────────────────────────────────────────────

/**
 * Gera email único de teste — nunca colide entre testes paralelos.
 */
export function buildTestEmail(prefix = 'user'): string {
  const unique = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  return `${unique}@integration-test.local`
}

/**
 * Hash do CPF para satisfazer constraint UNIQUE em users.cpfHash.
 * Usa valor aleatório para evitar colisão — não representa um CPF real.
 */
function randomCpfHash(): string {
  return crypto.createHash('sha256').update(Math.random().toString()).digest('hex')
}

// ─── Factory: createTestUser ──────────────────────────────────────────────────

/**
 * Cria um usuário de teste no banco real.
 * @returns Usuário criado com id garantido
 */
export async function createTestUser(
  prisma: PrismaClient,
  options: CreateTestUserOptions = {}
): Promise<{ id: string; email: string; planType: string }> {
  const {
    planType = 'JOGADOR',
    adminRole = null,
    status = 'ACTIVE',
    fsBalance = 10000,
    birthDate = new Date('1990-01-01'),
    email = buildTestEmail(planType.toLowerCase()),
    name = `Teste ${planType}`,
    favoriteClub = 'URU3',
  } = options

  const user = await prisma.user.create({
    data: {
      email,
      name,
      cpfHash: randomCpfHash(),
      planType,
      adminRole,
      status,
      fsBalance,
      marginBlocked: 0,
      birthDate,
      favoriteClub,
      tourCompleted: true,
      investorProfile: planType === 'LENDA' ? 'AVANCADO' : planType === 'CRAQUE' ? 'INTERMEDIARIO' : 'INICIANTE',
    },
    select: { id: true, email: true, planType: true },
  })

  return user
}

/**
 * Cria par de usuários A e B para testes de IDOR.
 */
export async function createTwoUsers(prisma: PrismaClient) {
  const [userA, userB] = await Promise.all([
    createTestUser(prisma, { planType: 'LENDA', email: buildTestEmail('idor-a') }),
    createTestUser(prisma, { planType: 'LENDA', email: buildTestEmail('idor-b') }),
  ])
  return { userA, userB }
}

// ─── Factory: createTestOrder ─────────────────────────────────────────────────

export interface CreateTestOrderOptions {
  userId: string
  ticker?: string
  type?: string
  side?: string
  quantity?: number
  status?: string
  price?: number | null
}

export async function createTestOrder(
  prisma: PrismaClient,
  options: CreateTestOrderOptions
) {
  const {
    userId,
    ticker = 'URU3',
    type = 'MARKET',
    side = 'BUY',
    quantity = 1,
    status = 'OPEN',
    price = null,
  } = options

  // Buscar assetId pelo ticker
  const asset = await prisma.asset.findFirst({ where: { ticker }, select: { id: true } })
  if (!asset) throw new Error(`[factory] Asset com ticker=${ticker} não encontrado. Rode o seed primeiro.`)

  // `ticker` nao e coluna de `orders` -- o ticker vive em `assets` e chega aqui so
  // para resolver o assetId acima. A taxa e `fee`, nao `feeAmount`. Os dois nomes
  // eram herdados de um schema anterior e faziam TODA criacao de ordem de teste
  // morrer em PrismaClientValidationError.
  return prisma.order.create({
    data: {
      userId,
      assetId: asset.id,
      type,
      side,
      quantity,
      status,
      price,
      fee: 0,
    },
  })
}

// ─── Factory: createTestPosition ─────────────────────────────────────────────

export interface CreateTestPositionOptions {
  userId: string
  ticker?: string
  quantity?: number
  avgPrice?: number
}

/**
 * Cria posicao LONG aberta -- pre-condicao de QUALQUER ordem SELL.
 *
 * `OrderService._assertSellAvailable` le a posicao ABERTA do par (usuario, ativo)
 * e rejeita com ORDER_050 quando `availableQty < quantidade pedida`. Sem esta
 * factory os testes de venda so exercitavam esse guard: nenhum chegava a criar
 * ordem. Nao existe indice unico total em (user_id, asset_id) -- o unico e
 * PARCIAL, so sobre `status = 'OPEN'` (ver comentario do model Position) --, por
 * isso duas chamadas para o mesmo par no mesmo teste estouram, e e correto que
 * estourem.
 */
export async function createTestPosition(
  prisma: PrismaClient,
  options: CreateTestPositionOptions
) {
  const { userId, ticker = 'URU3', quantity = 10, avgPrice } = options

  const asset = await prisma.asset.findFirst({
    where: { ticker },
    select: { id: true, currentPrice: true },
  })
  if (!asset) throw new Error(`[factory] Asset com ticker=${ticker} não encontrado. Rode o seed primeiro.`)

  const preco = avgPrice ?? Number(asset.currentPrice)

  return prisma.position.create({
    data: {
      userId,
      assetId: asset.id,
      quantity,
      avgPrice: preco,
      totalInvested: Number((preco * quantity).toFixed(2)),
      side: 'LONG',
      status: 'OPEN',
      openedAt: new Date(),
    },
  })
}

// ─── Factory: createTestSubscription ─────────────────────────────────────────

export async function createTestSubscription(
  prisma: PrismaClient,
  userId: string,
  planType: 'CRAQUE' | 'LENDA' = 'CRAQUE'
) {
  return prisma.subscription.create({
    data: {
      userId,
      planType,
      status: 'ACTIVE',
      gateway: 'MERCADO_PAGO',
      period: 'MONTHLY',
      // Obrigatorio no schema: centavos BRL, nunca Float (PCI-DSS).
      amount: 2990,
      startsAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  })
}

// ─── Payloads de teste ────────────────────────────────────────────────────────

export const buildOrderPayload = (overrides: Partial<CreateTestOrderOptions> = {}) => ({
  ticker: 'URU3',
  type: 'MARKET',
  side: 'BUY',
  quantity: 1,
  ...overrides,
})

export const buildRegisterPayload = (overrides: Record<string, unknown> = {}) => ({
  name: 'Usuário Integração',
  email: buildTestEmail('register'),
  password: 'Senha@1234',
  cpf: '12345678909', // CPF de teste (será hashed, não persiste)
  birthDate: '1990-01-15',
  favoriteClub: 'URU3',
  investorProfile: 'INICIANTE',
  consentLgpd: true,
  ...overrides,
})

export const buildForumPostPayload = (overrides: Record<string, unknown> = {}) => ({
  content: '[INTEGRATION-TEST] Post de teste de integração.',
  ticker: 'URU3',
  ...overrides,
})
