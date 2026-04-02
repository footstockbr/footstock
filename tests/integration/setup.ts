// ============================================================================
// Foot Stock — Integration Tests: Setup Compartilhado
// Isolamento via cleanup de dados de teste em afterEach.
// NUNCA usa mocks de banco — Prisma conecta ao TEST_DATABASE_URL real.
// ============================================================================

import { PrismaClient } from '@prisma/client'

// ─── Cliente Prisma para testes de integração ────────────────────────────────
// DATABASE_URL é sobrescrito para TEST_DATABASE_URL pelo globalSetup.ts

export const testPrisma = new PrismaClient({
  log: process.env.DEBUG_INTEGRATION ? ['query', 'error'] : ['error'],
})

// ─── Domínio de email de teste ────────────────────────────────────────────────
// Todos os usuários criados em testes de integração usam este domínio.
// O globalTeardown e os afterEach's limpam por este padrão.
export const TEST_EMAIL_DOMAIN = '@integration-test.local'

// ─── Lifecycle ────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await testPrisma.$connect()
})

afterAll(async () => {
  // Cleanup final — garante que nenhum dado de teste persiste
  await testPrisma.user.deleteMany({
    where: { email: { endsWith: TEST_EMAIL_DOMAIN } },
  })
  await testPrisma.$disconnect()
})

// ─── Mock: Supabase SSR ───────────────────────────────────────────────────────
// Supabase é um serviço externo — mockado em todos os testes de integração.
// A integração real (service ↔ DB) é testada via Prisma direto.
jest.mock('@supabase/ssr', () => ({
  createServerClient: jest.fn(),
}))

// ─── Mock: Redis ──────────────────────────────────────────────────────────────
// Redis é externo e usado para rate limiting e cache.
// Testes de integração focam em service ↔ DB; Redis é mockado.
jest.mock('@/lib/redis', () => ({
  redisPublisher: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    setex: jest.fn().mockResolvedValue('OK'),
    incr: jest.fn().mockResolvedValue(1),
    expire: jest.fn().mockResolvedValue(1),
    incrby: jest.fn().mockResolvedValue(1),
    publish: jest.fn().mockResolvedValue(0),
    del: jest.fn().mockResolvedValue(1),
    ttl: jest.fn().mockResolvedValue(-1),
    zadd: jest.fn().mockResolvedValue(1),
    zrangebyscore: jest.fn().mockResolvedValue([]),
    zremrangebyscore: jest.fn().mockResolvedValue(0),
    zcard: jest.fn().mockResolvedValue(0),
  },
  redisSubscriber: {
    subscribe: jest.fn(),
    on: jest.fn(),
  },
}))

// ─── Mock: FlagCheck (verificação de idade) ───────────────────────────────────
jest.mock('@/lib/services/age-verification', () => ({
  checkAge: jest.fn().mockResolvedValue({ isAdult: true, pending: false }),
  AgeVerificationService: jest.fn().mockImplementation(() => ({
    verify: jest.fn().mockResolvedValue({ isAdult: true, pending: false }),
  })),
}))
