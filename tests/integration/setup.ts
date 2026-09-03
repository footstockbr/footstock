// ============================================================================
// FootStock — Integration Tests: Setup Compartilhado
// Isolamento via cleanup de dados de teste em afterEach.
// NUNCA usa mocks de banco — Prisma conecta ao TEST_DATABASE_URL real.
// ============================================================================

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { limparUsuariosDeTeste as limparEmCascata } from './helpers/cleanup.helper'
import { getRedisClient } from '@/lib/redis'

// ─── Cliente Prisma para testes de integração ────────────────────────────────
// DATABASE_URL é sobrescrito para TEST_DATABASE_URL pelo globalSetup.ts

// Prisma 7 exige driver adapter: o bloco `datasource db` do schema nao tem `url`,
// entao `new PrismaClient()` nu nao sabe para onde conectar. Preferimos
// TEST_DATABASE_URL explicitamente em vez de confiar so no DATABASE_URL que o
// globalSetup sobrescreve -- se um dia o worker deixar de herdar esse env, a
// suite falha aqui com mensagem clara em vez de mirar no banco errado.
const testConnectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL

if (!testConnectionString) {
  throw new Error(
    '[integration] TEST_DATABASE_URL nao configurada no worker de teste. ' +
    'Verifique .env.test e o globalSetup.'
  )
}

export const testPrisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: testConnectionString }),
  log: process.env.DEBUG_INTEGRATION ? ['query', 'error'] : ['error'],
})

// ─── Domínio de email de teste ────────────────────────────────────────────────
// Todos os usuários criados em testes de integração usam este domínio.
// O globalTeardown e os afterEach's limpam por este padrão.
export const TEST_EMAIL_DOMAIN = '@integration-test.local'

// ─── Lifecycle ────────────────────────────────────────────────────────────────

beforeAll(async () => {
  await testPrisma.$connect()

  // Falhar cedo e com instrucao: sem o container de Redis o sintoma seria uma
  // enxurrada de MOTOR_090 em testes de ordem, que nao tem nada a ver com a causa.
  const redis = getRedisClient()
  if (!redis) {
    throw new Error(
      '[integration] REDIS_URL ausente no worker de teste. Verifique .env.test.'
    )
  }
  try {
    await redis.ping()
  } catch (err) {
    throw new Error(
      `[integration] Redis de teste inacessivel em ${process.env.REDIS_URL}. ` +
      'Rode `npm run test:integration:setup` para subir o container. ' +
      `Causa: ${err instanceof Error ? err.message : String(err)}`
    )
  }
})

// ─── Estado do motor por teste ────────────────────────────────────────────────
// `OrderService.createOrder` so aceita ordem com motor vivo: exige ausencia de
// `motor:global-halt` e um `market:tick:latest` fresco (janela de 10s, ver
// lib/motor/tick-freshness.ts). Sem isso toda ordem vira MOTOR_090.
//
// O estado e reposto ANTES de cada teste, nao uma vez no globalSetup, porque o
// tick expira por idade: numa suite longa o ultimo teste veria um tick stale.
// Teste que quer motor pausado ou tick velho sobrescreve a chave por conta propria.
beforeEach(async () => {
  const redis = getRedisClient()
  if (!redis) return
  await redis.del('motor:global-halt')
  await redis.set('market:tick:latest', String(Date.now()))
})

/**
 * Cleanup canonico dos testes de integracao.
 *
 * Sempre preferir isto a `testPrisma.user.deleteMany(...)` nu: `users` tem 15
 * dependentes NO ACTION (orders, positions, payments, subscriptions...), entao o
 * delete direto morre em FK assim que um teste cria qualquer dado real. Ver
 * `helpers/cleanup.helper.ts` para o porque de a arvore ser derivada do catalogo.
 */
export async function limparUsuariosDeTeste(): Promise<number> {
  return limparEmCascata(testPrisma, TEST_EMAIL_DOMAIN)
}

afterAll(async () => {
  // Cleanup final — garante que nenhum dado de teste persiste
  await limparUsuariosDeTeste()
  await testPrisma.$disconnect()

  // Sem isto o jest fica com handle aberto e nao encerra o processo.
  await getRedisClient()?.quit().catch(() => undefined)
})

// ─── Mock: Auth (Auth.js getAuthUser) ─────────────────────────────────────────
// A autenticação é simulada via mock de `@/lib/auth` (ver helpers/auth.helper).
// A integração real (service ↔ DB) é testada via Prisma direto.
jest.mock('@/lib/auth', () => ({
  getAuthUser: jest.fn(),
}))

// ─── Redis: SEM mock, container real ─────────────────────────────────────────
// Havia aqui um jest.mock de '@/lib/redis' com um `redisPublisher` de 12 metodos
// escritos a mao. O modulo real exporta muito mais que isso (getRedisClient,
// createSubscriber, REDIS_CHANNELS, redisGetJSON/SetJSON, SlidingWindowRateLimiter),
// entao o mock apagava o resto: `redisPublisher.exists is not a function` e
// `SlidingWindowRateLimiter is not a constructor` derrubavam 8 testes -- falhas do
// mock, nao do codigo.
//
// Pior: metade do contrato de ordens vive no Redis (`motor:global-halt`,
// `market:tick:latest`, rate limit por sliding window em Lua). Com o `get` mockado
// devolvendo null, `OrderService.createOrder` so sabia responder MOTOR_090 -- o
// happy path nunca foi exercitado de verdade.
//
// Por isso o harness usa Redis REAL, num container isolado (`redis-test`, porta
// 6380 do docker-compose.test.yml), pela mesma razao que usa Postgres real.

// ─── Verificação de idade: SEM mock (deliberado) ──────────────────────────────
// Havia aqui um jest.mock de '@/lib/services/age-verification' expondo `checkAge`
// e `AgeVerificationService`. Nenhum dos dois existe mais no modulo -- o servico
// virou a funcao pura `verifyAge(birthDate)` quando a verificacao deixou de ser
// assincrona/persistida (T-023). O mock stale nao falhava: ele substituia o modulo
// por um objeto sem `verifyAge`, e quem importasse a funcao recebia `undefined` e
// so quebrava no ponto de uso. Como a implementacao real e pura (aritmetica de
// datas, zero I/O), o certo e nao mocka-la -- assim o gate de maioridade e
// exercitado de verdade nos testes de seguranca (THREAT-003).
