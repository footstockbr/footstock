import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Serverless: até 2 conexões por instância para Promise.all não serializar em pool max:1
    max: process.env.NODE_ENV === 'production' ? 2 : 10,
    // Cold start + 2 queries paralelas: aumentar para não timeout no enqueue
    connectionTimeoutMillis: 20_000,
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
