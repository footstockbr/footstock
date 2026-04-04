import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Serverless: 1 conexão por instância de função (evita esgotamento de pool no PgBouncer)
    max: process.env.NODE_ENV === 'production' ? 1 : 10,
    // Timeout de conexão: impede 504 indefinido quando a URL está errada/inacessível
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000,
  })
  pool.on('error', err => {
    console.error('[prisma:pool] Erro de conexão:', err.message)
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adapter = new PrismaPg(pool as any)
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export default prisma
