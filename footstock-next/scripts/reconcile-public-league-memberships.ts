// ============================================================================
// FootStock — reconcile-public-league-memberships
// Reconciliação idempotente e auditável de memberships em ligas públicas.
//
// Uso (rodar de footstock-next/):
//   DATABASE_URL=... npx tsx scripts/reconcile-public-league-memberships.ts       # dry-run (default)
//   DATABASE_URL=... npx tsx scripts/reconcile-public-league-memberships.ts --apply
//
// Segurança:
//   - Dry-run por padrão. Nenhuma gravação ocorre sem --apply explícito.
//   - Nunca remove memberships existentes.
//   - Aborta o lote no primeiro FAILED inesperado, preservando as já aplicadas.
//   - Não é invocado automaticamente em build, migration, cron ou deploy.
//
// hipotese: H2 — a existência e a magnitude de usuários elegíveis sem membership
// pública ativa na sua divisão só serão confirmadas após dry-run em ambiente
// autorizado.
// ============================================================================

import { prisma } from '../src/lib/prisma'
import { leagueAutoEnrollService } from '../src/lib/services/LeagueAutoEnrollService'
import type { PlanType } from '../src/types'

export interface Args {
  apply: boolean
  json: boolean
  batchSize: number
}

export interface ReconcileSummary {
  mode: 'DRY-RUN' | 'APPLY'
  scanned: number
  alreadyMember: number
  eligible: number
  enrolled: number
  noActiveLeague: number
  failed: number
  sample: Array<Record<string, unknown>>
}

export function parseArgs(argv: string[]): Args {
  const a: Args = { apply: false, json: false, batchSize: 100 }
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i]
    if (t === '--apply') a.apply = true
    else if (t === '--json') a.json = true
    else if (t === '--batch-size') a.batchSize = Math.max(1, Math.trunc(Number(argv[++i])))
  }
  return a
}

export function sanitizeId(id: string): string {
  return `${id.slice(0, 4)}...${id.slice(-4)}`
}

function isPlanType(value: string): value is PlanType {
  return ['JOGADOR', 'CRAQUE', 'LENDA'].includes(value)
}

export async function run(args: Args): Promise<ReconcileSummary> {
  // 1. Liga públicas ativas por divisão.
  const activePublicLeagues = await prisma.league.findMany({
    where: { type: 'PUBLICA', status: 'ACTIVE' },
    select: { id: true, division: true },
  })

  const activePublicLeagueIds = new Set(activePublicLeagues.map(l => l.id))

  // 2. Usuários ativos com plano válido.
  let cursor: string | undefined
  const candidates: Array<{ id: string; planType: PlanType }> = []

  for (;;) {
    const users = await prisma.user.findMany({
      where: {
        planType: { in: ['JOGADOR', 'CRAQUE', 'LENDA'] },
      },
      select: { id: true, planType: true },
      take: args.batchSize,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { id: 'asc' },
    })

    if (users.length === 0) break

    for (const user of users) {
      if (!user.planType || !isPlanType(user.planType)) continue
      candidates.push({ id: user.id, planType: user.planType })
    }

    cursor = users[users.length - 1].id
  }

  // 3. Filtrar usuários que já são membros de alguma liga pública ativa.
  const candidateIds = candidates.map(c => c.id)
  const existingMemberships = await prisma.leagueMember.findMany({
    where: {
      userId: { in: candidateIds },
      leagueId: { in: Array.from(activePublicLeagueIds) },
    },
    select: { userId: true },
  })

  const alreadyMemberIds = new Set(existingMemberships.map(m => m.userId))
  const eligible = candidates.filter(c => !alreadyMemberIds.has(c.id))

  // 4. Processamento (dry-run ou apply).
  const counts = {
    scanned: candidates.length,
    alreadyMember: alreadyMemberIds.size,
    eligible: eligible.length,
    enrolled: 0,
    noActiveLeague: 0,
    failed: 0,
  }

  const processed: Array<Record<string, unknown>> = []

  if (args.apply) {
    for (const user of eligible) {
      const result = await leagueAutoEnrollService.enrollUserInPublicLeague(user.id, user.planType)

      processed.push({
        userId: sanitizeId(user.id),
        planType: user.planType,
        status: result.status,
        leagueId: 'leagueId' in result ? sanitizeId(result.leagueId as string) : undefined,
        reason: 'reason' in result ? result.reason : undefined,
      })

      if (result.status === 'ENROLLED') counts.enrolled++
      else if (result.status === 'NO_ACTIVE_PUBLIC_LEAGUE') counts.noActiveLeague++
      else if (result.status === 'ALREADY_MEMBER') {
        // Condição de corrida: outro processo já inscreveu. Não incrementa enrolled.
      }
      else if (result.status === 'FAILED') {
        counts.failed++
        break
      }
    }
  }

  const sample = args.apply
    ? processed.slice(0, 50)
    : eligible.slice(0, 50).map(c => ({
        userId: sanitizeId(c.id),
        planType: c.planType,
        division: leagueAutoEnrollService.getDivisionForPlan(c.planType),
      }))

  return {
    mode: args.apply ? 'APPLY' : 'DRY-RUN',
    ...counts,
    sample,
  }
}

function printSummary(summary: ReconcileSummary, args: Args) {
  if (args.json) {
    console.log(JSON.stringify(summary, null, 2))
    return
  }

  console.log(`\n=== reconcile-public-league-memberships [${summary.mode}] ===`)
  console.log(`scanned=${summary.scanned}  alreadyMember=${summary.alreadyMember}  eligible=${summary.eligible}`)
  if (summary.mode === 'APPLY') {
    console.log(`enrolled=${summary.enrolled}  noActiveLeague=${summary.noActiveLeague}  failed=${summary.failed}`)
  }
  console.log('\n--- amostra (ate 50) ---')
  for (const row of summary.sample) console.log(' ', row)
  if (summary.mode === 'DRY-RUN') {
    console.log('\n(dry-run — nada gravado. Use --apply para aplicar; a execucao aborta no primeiro FAILED.)')
  }
}

async function main() {
  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) {
    console.error('ERRO: defina DATABASE_URL no ambiente.')
    process.exit(1)
  }

  const args = parseArgs(process.argv.slice(2))
  const summary = await run(args)
  printSummary(summary, args)
  await prisma.$disconnect()
}

if (require.main === module) {
  main().catch(err => {
    console.error(err)
    process.exit(1)
  })
}
