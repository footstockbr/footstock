import { prisma } from '@/lib/prisma'
import { seedAssets } from './assets'
import { seedUsers } from './users'
import { seedLeagues } from './leagues'
import { seedSubscriptions } from './subscriptions'

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('[seed] ERRO: Seeds não executam em produção.')
    process.exit(1)
  }

  console.log('[seed] Iniciando seeds...')

  // Ordem importa: assets → users → leagues → subscriptions
  await seedAssets()
  console.log('[seed] ✓ Assets (40 clubes)')

  await seedUsers()
  console.log('[seed] ✓ Usuários de teste (7 roles, 4 consentimentos cada)')

  await seedLeagues()
  console.log('[seed] ✓ Ligas de teste (3 ligas)')

  await seedSubscriptions()
  console.log('[seed] ✓ Subscriptions de teste (3 assinaturas ativas)')

  console.log('[seed] Todos os seeds concluídos!')
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
