/**
 * Seed para desenvolvimento LOCAL (PostgreSQL sem Supabase Auth).
 * Usa seedUsersLocal() que gera IDs via uuid() em vez de auth.users.
 *
 * Para usar: npx prisma db seed  (apontando para este arquivo via package.json)
 * Para produção/staging: use prisma/seed/index.ts (requer Supabase real)
 */
import { prisma } from '@/lib/prisma'
import { seedAssets } from './assets'
import { seedUsersLocal } from './users-local'
import { seedLeagues } from './leagues'
import { seedSubscriptions } from './subscriptions'

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('[seed] ERRO: Seeds não executam em produção.')
    process.exit(1)
  }

  console.log('[seed:local] Iniciando seeds (modo local sem Supabase)...')

  await seedAssets()
  console.log('[seed:local] ✓ Assets (40 clubes)')

  await seedUsersLocal()
  console.log('[seed:local] ✓ Usuários de teste (7 roles, IDs locais)')

  await seedLeagues()
  console.log('[seed:local] ✓ Ligas de teste (3 ligas)')

  await seedSubscriptions()
  console.log('[seed:local] ✓ Subscriptions de teste (3 assinaturas)')

  console.log('[seed:local] Todos os seeds concluídos!')
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
