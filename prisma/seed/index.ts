/**
 * Seed para staging/produção-like (com Supabase Auth real).
 * Requer NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY no .env
 *
 * Ordem de execução (FK-safe):
 *   Nível 0: Assets
 *   Nível 1: Users (Supabase Auth) + UsersExtra + Compliance (consents)
 *   Nível 2: Subscriptions, Leagues, News, Orders, Dividends, Affiliates
 *   Nível 3: Community (LeagueMembers, Forum, Notifications), AdminData
 */
import { prisma } from '@/lib/prisma'
import { seedAssets } from './assets'
import { seedUsers } from './users'
import { seedUsersExtra } from './users-extra'
import { seedCompliance } from './compliance'
import { seedSubscriptionsFull } from './subscriptions-full'
import { seedLeagues } from './leagues'
import { seedNews } from './news'
import { seedOrders } from './orders'
import { seedDividends } from './dividends'
import { seedAffiliates } from './affiliates'
import { seedCommunity } from './community'
import { seedAdminData } from './admin-data'

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('[seed] ERRO: Seeds não executam em produção.')
    process.exit(1)
  }

  console.log('[seed] Iniciando seeds (modo Supabase)...\n')

  // ── Nível 0: Base ────────────────────────────────────────────────────────
  await seedAssets()
  console.log('[seed] ✓ Nível 0: Assets (40 clubes)')

  // ── Nível 1: Usuários + Consentimentos ──────────────────────────────────
  await seedUsers()
  await seedUsersExtra()
  await seedCompliance()
  console.log('[seed] ✓ Nível 1: Users (Supabase Auth + edge cases) + Consents')

  // ── Nível 2: Entidades com FK para Nível 0-1 ────────────────────────────
  await seedSubscriptionsFull()
  console.log('[seed] ✓ Nível 2a: Subscriptions completo')

  await seedLeagues()
  console.log('[seed] ✓ Nível 2b: Leagues')

  await seedNews()
  console.log('[seed] ✓ Nível 2c: News')

  await seedOrders()
  console.log('[seed] ✓ Nível 2d: Orders + Positions + Transactions + PriceHistory')

  await seedDividends()
  console.log('[seed] ✓ Nível 2e: Dividends')

  await seedAffiliates()
  console.log('[seed] ✓ Nível 2f: Affiliates\n')

  // ── Nível 3: Comunidade + Admin ──────────────────────────────────────────
  await seedCommunity()
  console.log('[seed] ✓ Nível 3a: Community')

  await seedAdminData()
  console.log('[seed] ✓ Nível 3b: AdminData\n')

  console.log('[seed] Todos os seeds concluídos!')
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
