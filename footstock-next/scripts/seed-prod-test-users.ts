// ============================================================================
// Foot Stock - Seed prod test users (Auth.js v5 path - bcrypt + Prisma upsert)
//
// Substitui o seed antigo baseado em Supabase Auth Admin API. Usa apenas
// Prisma + bcryptjs. Cria/atualiza 9 usuarios DEV (DEV_TEST_USERS) com
// passwordHash bcrypt (12 rounds) de forma idempotente.
//
// Uso:
//   node --experimental-strip-types scripts/seed-prod-test-users.ts
//
// Dry-run (nenhum write no DB; apenas reporta o diff esperado):
//   SEED_DRY_RUN=1 node --experimental-strip-types scripts/seed-prod-test-users.ts
//
// Variaveis lidas:
//   DATABASE_URL          - Postgres alvo (usar Railway env DEV/PROD)
//   SEED_DRY_RUN          - "1" / "true" ativa modo dry-run (so leitura)
//   HMAC_CPF_SECRET       - opcional; se ausente, cpfHash usa SHA-256 do email
//
// Seguranca: NUNCA imprime passwords ou passwordHash em log; mascara como `***`.
// ============================================================================

import { createHash, createHmac } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import type { Prisma } from '@prisma/client'
import {
  DEV_TEST_USERS,
  type DevTestUserProfile,
} from '../src/lib/constants/dev-test-users.ts'

const prisma = new PrismaClient()

const BCRYPT_ROUNDS = 12

function isTruthy(v: string | undefined): boolean {
  if (!v) return false
  const s = v.trim().toLowerCase()
  return s === '1' || s === 'true' || s === 'yes' || s === 'on'
}

const DRY_RUN = isTruthy(process.env.SEED_DRY_RUN)

/**
 * Hash determinista de identificador sintetico para cpfHash.
 * Em seeds DEV nao ha CPF real; gera-se um cpfHash unico por email.
 * Usa HMAC-SHA256 com HMAC_CPF_SECRET quando disponivel para alinhar
 * com `hashCPF` de producao; fallback para SHA-256 puro do email.
 */
function cpfHashFor(email: string): string {
  const seed = `seed-prod-test::${email.toLowerCase()}`
  const secret = process.env.HMAC_CPF_SECRET
  if (secret) {
    return createHmac('sha256', secret).update(seed).digest('hex')
  }
  return createHash('sha256').update(seed).digest('hex')
}

function balanceFor(planType: DevTestUserProfile['planType']): number {
  if (planType === 'LENDA') return 25000
  if (planType === 'CRAQUE') return 5000
  return 2000
}

function userTypeFor(profile: DevTestUserProfile): string {
  if (!profile.adminRole) return 'NORMAL'
  if (profile.adminRole === 'CLUB_PARTNER') return 'CLUB_PARTNER'
  return 'ADMIN'
}

function buildCreatePayload(
  email: string,
  profile: DevTestUserProfile,
  passwordHash: string,
): Prisma.UserCreateInput {
  return {
    email,
    passwordHash,
    name: profile.name,
    cpfHash: cpfHashFor(email),
    planType: profile.planType,
    adminRole: profile.adminRole ?? null,
    investorProfile: 'INICIANTE',
    favoriteClub: profile.clubId ?? 'FLAM',
    userType: userTypeFor(profile),
    fsBalance: balanceFor(profile.planType),
    birthDate: new Date('1990-01-01'),
    tourCompleted: true,
  }
}

type SeedOutcome = 'created' | 'updated' | 'dry-create' | 'dry-update'

interface SeedRow {
  email: string
  outcome: SeedOutcome
  userId: string | null
}

async function upsertOne(
  email: string,
  profile: DevTestUserProfile,
): Promise<SeedRow> {
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true, passwordHash: true },
  })

  if (DRY_RUN) {
    const outcome: SeedOutcome = existing ? 'dry-update' : 'dry-create'
    const wouldSetHash = existing?.passwordHash ? 'overwrite' : 'set'
    console.log(
      `  [${outcome}] ${email} -> ${existing?.id ?? '<would create>'} ` +
        `(passwordHash: ${wouldSetHash} -> ***; password: ***)`,
    )
    return { email, outcome, userId: existing?.id ?? null }
  }

  const passwordHash = await bcrypt.hash(profile.password, BCRYPT_ROUNDS)
  const createPayload = buildCreatePayload(email, profile, passwordHash)
  const r = await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: createPayload,
  })
  const outcome: SeedOutcome = existing ? 'updated' : 'created'
  console.log(`  [${outcome}] ${email} -> ${r.id} (passwordHash: ***)`)
  return { email, outcome, userId: r.id }
}

async function main(): Promise<void> {
  const total = Object.keys(DEV_TEST_USERS).length
  console.log(
    `[seed-prod-test-users] start (mode=${DRY_RUN ? 'dry-run' : 'apply'}, ` +
      `users=${total}, bcryptRounds=${BCRYPT_ROUNDS})`,
  )

  if (!process.env.DATABASE_URL) {
    console.error('[seed-prod-test-users] ERRO: DATABASE_URL nao definido.')
    process.exitCode = 1
    return
  }

  const rows: SeedRow[] = []
  for (const [email, profile] of Object.entries(DEV_TEST_USERS)) {
    try {
      const row = await upsertOne(email, profile)
      rows.push(row)
    } catch (err) {
      console.error(`  [error] ${email}: ${(err as Error).message}`)
      throw err
    }
  }

  const counts = rows.reduce<Record<SeedOutcome, number>>(
    (acc, r) => {
      acc[r.outcome] = (acc[r.outcome] ?? 0) + 1
      return acc
    },
    { created: 0, updated: 0, 'dry-create': 0, 'dry-update': 0 },
  )

  console.log(
    `[seed-prod-test-users] done: created=${counts.created} ` +
      `updated=${counts.updated} dry-create=${counts['dry-create']} ` +
      `dry-update=${counts['dry-update']} total=${rows.length}/${total}`,
  )

  if (rows.length !== total) {
    process.exitCode = 1
  }
}

main()
  .catch((err) => {
    console.error('[seed-prod-test-users] FATAL:', (err as Error).message)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
