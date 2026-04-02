/**
 * Seed para desenvolvimento LOCAL (PostgreSQL sem Supabase Auth).
 * Usa seedUsersLocal() que gera IDs via uuid() em vez de auth.users.
 *
 * Para usar: npx prisma db seed  (apontando para este arquivo via package.json)
 * Para produção/staging: use prisma/seed/index.ts (requer Supabase real)
 *
 * Ordem de execução (FK-safe):
 *   Nível 0: Assets
 *   Nível 1: Users (local) + UsersExtra + Compliance (consents)
 *   Nível 2: Subscriptions, Leagues, News, Orders, Dividends, Affiliates
 *   Nível 3: Community (LeagueMembers, Forum, Notifications), AdminData
 */
import { prisma } from '@/lib/prisma'
import { seedAssets } from './assets'
import { seedUsersLocal } from './users-local'
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

  console.log('[seed:local] Iniciando seeds (modo local sem Supabase)...\n')

  // ── Nível 0: Base ────────────────────────────────────────────────────────
  await seedAssets()
  console.log('[seed:local] ✓ Nível 0: Assets (40 clubes)\n')

  // ── Nível 1: Usuários + Consentimentos ──────────────────────────────────
  await seedUsersLocal()
  await seedUsersExtra()
  await seedCompliance()
  console.log('[seed:local] ✓ Nível 1: Users (8 roles + 7 edge cases) + Consents (todos os purposes)\n')

  // ── Nível 2: Entidades com FK para Nível 0-1 ────────────────────────────
  await seedSubscriptionsFull()
  console.log('[seed:local] ✓ Nível 2a: Subscriptions (todos os status) + Payments + Dunning + Webhooks')

  await seedLeagues()
  console.log('[seed:local] ✓ Nível 2b: Leagues (PUBLICA, AMIGOS, PRO)')

  await seedNews()
  console.log('[seed:local] ✓ Nível 2c: News (todos os ImpactCategory e Sentiment)')

  await seedOrders()
  console.log('[seed:local] ✓ Nível 2d: Orders + Positions + Transactions + PriceHistory')

  await seedDividends()
  console.log('[seed:local] ✓ Nível 2e: Dividends (ESPORTIVO/FINANCEIRO × todos os status)')

  await seedAffiliates()
  console.log('[seed:local] ✓ Nível 2f: AffiliateCodes + AffiliateTransactions\n')

  // ── Nível 3: Comunidade + Admin ──────────────────────────────────────────
  await seedCommunity()
  console.log('[seed:local] ✓ Nível 3a: GlobalForum + ForumLikes + LeagueMembers + Notifications + Glossary')

  await seedAdminData()
  console.log('[seed:local] ✓ Nível 3b: AdminActions + ModerationRules + Sponsors + NSM + DataAccessLogs + ExportJobs + IncidentLogs\n')

  console.log('[seed:local] ════════════════════════════════════════════════')
  console.log('[seed:local] Todos os seeds concluídos!')
  console.log('[seed:local] ════════════════════════════════════════════════')
  console.log('[seed:local]')
  console.log('[seed:local] Resumo:')
  console.log('[seed:local]   Assets:               40 clubes (20 Série A + 20 Série B)')
  console.log('[seed:local]   Users:                15 (8 roles + 7 edge cases)')
  console.log('[seed:local]   Consents:             todos os 5 ConsentPurpose')
  console.log('[seed:local]   Subscriptions:        7 status (ACTIVE×2, PENDING, TRIAL, EXPIRED, SUSPENDED, CANCELLATION_LOCK, CANCELLED)')
  console.log('[seed:local]   Payments:             6 (PAID×3, PENDING, FAILED, REFUNDED)')
  console.log('[seed:local]   DunningAttempts:      3 (D+1 FAILED, D+3 PENDING, D+7 PENDING)')
  console.log('[seed:local]   WebhookAuditLogs:     5 (ACCEPTED×3, REJECTED, DUPLICATE)')
  console.log('[seed:local]   Leagues:              3 (PUBLICA, AMIGOS, PRO)')
  console.log('[seed:local]   LeagueMembers:        6 membros em 3 ligas')
  console.log('[seed:local]   News:                 10 (6 ImpactCategories × 3 Sentiments)')
  console.log('[seed:local]   Orders:               10 (todos os OrderType/Side/Status)')
  console.log('[seed:local]   Positions:            5 (LONG/SHORT × OPEN/CLOSED)')
  console.log('[seed:local]   Transactions:         9 (todos os FinancialType)')
  console.log('[seed:local]   PriceHistory:         28 registros (7 dias × 4 SessionTypes)')
  console.log('[seed:local]   Dividends:            8 (ESPORTIVO/FINANCEIRO × CREDITED/PENDING/EXPIRADO)')
  console.log('[seed:local]   AffiliateCodes:       2 (INFLUENCER, CLUB_PARTNER)')
  console.log('[seed:local]   AffiliateTransactions:4 (SIGNUP×2, CONVERSION, RENEWAL)')
  console.log('[seed:local]   GlobalForumPosts:     6 (normal, flagged, deleted)')
  console.log('[seed:local]   ForumPosts:           2 (normal + pinado)')
  console.log('[seed:local]   ForumLikes:           4')
  console.log('[seed:local]   Notifications:        14 (todos os NotificationTypes)')
  console.log('[seed:local]   GlossaryInteractions: 8')
  console.log('[seed:local]   AdminMarketActions:   11 (todos os tipos)')
  console.log('[seed:local]   ModerationRules:      5')
  console.log('[seed:local]   Sponsors:             1')
  console.log('[seed:local]   NsmDailyRecords:      30 dias')
  console.log('[seed:local]   DataAccessLogs:       5')
  console.log('[seed:local]   DataExportJobs:       4 (COMPLETED, PENDING, PROCESSING, FAILED)')
  console.log('[seed:local]   IncidentLogs:         1')
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
