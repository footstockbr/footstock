/**
 * Entry point do seed de demonstração do painel admin
 * Module: module-23-admin-usuarios-financeiro / TASK-5
 *
 * Uso:
 *   npx ts-node prisma/seeds/admin-demo/index.ts
 *
 * GUARD: Não executar em produção (NODE_ENV=production)
 */

import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { seedAdminDemoUsers } from './users.seed'
import { seedAdminDemoAssets } from './assets.seed'
// news.seed is a standalone script — imported dynamically if needed
import { seedAdminDemoFinancial } from './financial.seed'
import { seedAdminDemoEngagement } from './engagement.seed'
import { seedAdminDemoModeration } from './moderation.seed'
import { seedAdminDemoPriceHistory } from './priceHistory.seed'

const connectionString = process.env.DATABASE_URL!
const adapter = new PrismaPg({ connectionString })

const prisma = new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
})

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[seed] ABORTADO — NODE_ENV=production. Seeds de demo são proibidos em produção.')
  }

  console.log('\n🌱 Admin Demo Seed — Foot Stock')
  console.log('================================\n')

  // Skip users/news/financial if running just engagement seed
  const skipInitial = process.argv.includes('--engagement-only')

  if (!skipInitial) {
    await seedAdminDemoUsers(prisma)
    console.log()
  }

  // Assets são sempre necessários para engajamento e price history
  await seedAdminDemoAssets(prisma)
  console.log()

  // Price history GBM — depende dos ativos existirem (TASK-025)
  await seedAdminDemoPriceHistory(prisma)
  console.log()

  if (!skipInitial) {
    // news.seed.ts is standalone — run separately: npx ts-node prisma/seeds/admin-demo/news.seed.ts
    await seedAdminDemoFinancial(prisma)
    console.log()
  }

  await seedAdminDemoEngagement(prisma)
  console.log()
  await seedAdminDemoModeration(prisma)

  console.log('\n✅ Seed de demonstração concluído com sucesso!')
  console.log('   Acesse /admin com as credenciais em DEV-CREDENTIALS.md\n')
}

main()
  .catch((e) => {
    console.error('[seed] Erro fatal:', e.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
