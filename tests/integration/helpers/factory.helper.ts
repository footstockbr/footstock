// ============================================================================
// Foot Stock — Integration Tests: Factory Helpers
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
  ageVerificationPending?: boolean
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
    ageVerificationPending = false,
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
      ageVerificationPending,
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

  return prisma.order.create({
    data: {
      userId,
      assetId: asset.id,
      ticker,
      type,
      side,
      quantity,
      status,
      price,
      feeAmount: 0,
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
