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
import { seedAdminDemoUsers } from './users.seed'
import { seedAdminDemoNews } from './news.seed'
import { seedAdminDemoFinancial } from './financial.seed'

const prisma = new PrismaClient()

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[seed] ABORTADO — NODE_ENV=production. Seeds de demo são proibidos em produção.')
  }

  console.log('\n🌱 Admin Demo Seed — Foot Stock')
  console.log('================================\n')

  await seedAdminDemoUsers(prisma)
  console.log()
  await seedAdminDemoNews(prisma)
  console.log()
  await seedAdminDemoFinancial(prisma)

  console.log('\n✅ Seed de demonstração concluído com sucesso!')
  console.log('   Acesse /admin com as credenciais em DEV-CREDENTIALS.md\n')
}

main()
  .catch((e) => {
    console.error('[seed] Erro fatal:', e.message)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
