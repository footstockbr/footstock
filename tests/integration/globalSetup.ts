// ============================================================================
// FootStock — Integration Tests: Global Setup
// Valida que o banco de teste está acessível antes de rodar os testes.
// ============================================================================

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import path from 'path'
import fs from 'fs'

/**
 * Carrega .env.test manualmente sem depender de dotenv instalado diretamente.
 * Next.js tem dotenv como dependência transitiva.
 */
function loadTestEnv() {
  const envFile = path.resolve(process.cwd(), '.env.test')
  if (!fs.existsSync(envFile)) return

  const content = fs.readFileSync(envFile, 'utf-8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const val = trimmed.slice(eqIdx + 1).trim()
    if (key && !process.env[key]) {
      process.env[key] = val
    }
  }
}

export default async function globalSetup() {
  loadTestEnv()
  const testDatabaseUrl = process.env.TEST_DATABASE_URL

  if (!testDatabaseUrl) {
    throw new Error(
      '[integration] TEST_DATABASE_URL não configurada.\n' +
      'Configure uma URL de banco de dados de TESTE separado.\n' +
      'Exemplo: TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5433/foot_stock_test'
    )
  }

  // Prisma 7: `datasources` foi REMOVIDO do construtor e o bloco `datasource db`
  // do schema nao declara `url` -- quem aponta a conexao e o driver adapter. Era
  // por isso que o globalSetup morria com "Unknown property datasources provided
  // to PrismaClient constructor" ANTES de qualquer teste rodar. Mesma forma que o
  // app usa em footstock-next/src/lib/prisma.ts e o motor em MarketEngine.ts.
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: testDatabaseUrl }),
  })

  try {
    await prisma.$connect()
    // Validar que as migrations foram aplicadas
    await prisma.user.count()
    console.log('[integration] ✓ Conexão com banco de teste estabelecida')
  } catch (err) {
    throw new Error(
      `[integration] Falha ao conectar ao banco de teste: ${err}\n` +
      'Execute as migrations: DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy'
    )
  } finally {
    await prisma.$disconnect()
  }

  // Sobrescrever DATABASE_URL para que o Prisma nos testes aponte para o banco de teste.
  // Precisa vir ANTES do seed: `@/lib/prisma` monta o driver adapter no import.
  process.env.DATABASE_URL = testDatabaseUrl

  await seedAssetsDeTeste(testDatabaseUrl)
  await limparRedisDeTeste()
}

/**
 * Zera o Redis de teste antes da suite.
 *
 * O harness usa Redis real (container `redis-test`, porta 6380) em vez de mock --
 * ver o cabecalho de `setup.ts`. Sem o flush inicial, contador de rate limit de uma
 * execucao anterior sobrevive e derruba teste de rota que nao mudou em nada.
 *
 * Falha aqui e FATAL de proposito: rodar a suite com Redis mudo produz enxurrada de
 * MOTOR_090 em testes de ordem, que nao tem relacao aparente com a causa.
 */
async function limparRedisDeTeste() {
  const redisUrl = process.env.REDIS_CLOUD_URL || process.env.REDIS_URL
  if (!redisUrl) {
    throw new Error(
      '[integration] REDIS_URL nao configurada. Verifique .env.test ' +
      '(esperado: redis://localhost:6380, container redis-test).'
    )
  }

  const { default: Redis } = await import('ioredis')
  const redis = new Redis(redisUrl, { maxRetriesPerRequest: 1, connectTimeout: 3_000 })

  try {
    await redis.flushdb()
    console.log('[integration] ✓ Redis de teste limpo')
  } catch (err) {
    throw new Error(
      `[integration] Redis de teste inacessivel em ${redisUrl}: ${err}\n` +
      'Suba o container: docker compose -f docker-compose.test.yml up -d'
    )
  } finally {
    redis.disconnect()
  }
}

/**
 * Semeia os 40 ativos canonicos no banco de teste.
 *
 * Sem isto, `helpers/factory.helper.ts` aborta com "Asset com ticker=URU3 nao
 * encontrado. Rode o seed primeiro" e derruba as suites de ordens e seguranca --
 * que era exatamente o estado do harness: banco criado, banco vazio.
 *
 * A lista de clubes NAO e duplicada aqui: vem de `@/lib/constants/clubs`, a mesma
 * fonte que `prisma/seed/assets.ts` usa. O que difere e a precificacao, que aqui e
 * deterministica e irrelevante para os testes (nenhum assert depende do valor de
 * IPO); o seed de desenvolvimento continua dono da formula de valuation.
 *
 * Idempotente por upsert: rodar a suite N vezes no mesmo container nao duplica nem
 * reseta ativo.
 */
async function seedAssetsDeTeste(testDatabaseUrl: string) {
  const { CLUBS, CLUB_COLORS } = await import('../../footstock-next/src/lib/constants/clubs')

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: testDatabaseUrl }),
  })

  try {
    const existentes = await prisma.asset.count()
    if (existentes >= CLUBS.length) {
      console.log(`[integration] ✓ ${existentes} ativos ja presentes no banco de teste`)
      return
    }

    for (const [index, club] of CLUBS.entries()) {
      const colors = CLUB_COLORS[club.ticker] ?? { primary: '#1a1a1a', secondary: '#ffffff' }
      const price = 10 + (index % 20)
      const cluster = club.division === 'SERIE_A' ? 'A_MID' : 'B_LIQUID'

      await prisma.asset.upsert({
        where: { ticker: club.ticker },
        create: {
          ticker: club.ticker,
          displayName: club.displayName,
          realName: club.realName,
          clubSlug: club.ticker.toLowerCase(),
          division: club.division,
          cluster,
          colorPrimary: colors.primary,
          colorSecondary: colors.secondary,
          currentPrice: price,
          openPrice: price,
          closePrice: price,
          marketCap: price * 1_000_000,
          isActive: true,
        },
        update: {},
      })
    }

    console.log(`[integration] ✓ ${CLUBS.length} ativos semeados no banco de teste`)
  } finally {
    await prisma.$disconnect()
  }
}
