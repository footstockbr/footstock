// ============================================================================
// Foot Stock — Integration Tests: Global Setup
// Valida que o banco de teste está acessível antes de rodar os testes.
// ============================================================================

import { PrismaClient } from '@prisma/client'
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

  const prisma = new PrismaClient({ datasources: { db: { url: testDatabaseUrl } } })

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

  // Sobrescrever DATABASE_URL para que o Prisma nos testes aponte para o banco de teste
  process.env.DATABASE_URL = testDatabaseUrl
}
