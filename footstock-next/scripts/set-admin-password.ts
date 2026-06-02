// ============================================================================
// FootStock - set-admin-password (Bug A / ramificacao A1)
//
// Define `passwordHash` (bcrypt, 12 rounds) para UMA conta administrativa cujo
// hash esta ausente (password_hash IS NULL), corrigindo o 401 AUTH-001 do login.
// Causa-raiz: o seed de demo (prisma/seeds/admin-demo/users.seed.ts) cria os
// admins SEM passwordHash; authorizeCredentials retorna null sem hash -> 401.
//
// NAO rotaciona AUTH_SECRET. NAO usa scripts/seed-prod-test-users.ts (esse so
// cobre usuarios .test). Altera EXATAMENTE o e-mail alvo, mais ninguem.
//
// Uso (dry-run, NENHUM write — comportamento padrao):
//   TARGET_EMAIL=superadmin@foot-stock.dev \
//     node --experimental-strip-types scripts/set-admin-password.ts
//
// Aplicar de fato (exige confirmacao explicita de host/db + senha):
//   TARGET_EMAIL=superadmin@foot-stock.dev NEW_PASSWORD='...' \
//   EXPECT_DB_HOST=localhost EXPECT_DB_NAME=foot_stock_dev SEED_APPLY=1 \
//     node --experimental-strip-types scripts/set-admin-password.ts
//
// Variaveis lidas:
//   DATABASE_URL    - Postgres alvo
//   TARGET_EMAIL    - e-mail EXATO da conta a corrigir (obrigatorio)
//   NEW_PASSWORD    - senha em claro (obrigatoria so no apply); nunca logada
//   SEED_APPLY      - "1"/"true" para escrever; ausente => dry-run
//   EXPECT_DB_HOST  - guarda: aborta se o host do DATABASE_URL divergir
//   EXPECT_DB_NAME  - guarda: aborta se o database do DATABASE_URL divergir
//
// Seguranca: NUNCA imprime senha nem passwordHash; mascara como `***`.
// Idempotente: re-executar com a mesma senha mantem o estado (apenas re-hash).
// ============================================================================

import bcrypt from 'bcryptjs'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const BCRYPT_ROUNDS = 12

function isTruthy(v: string | undefined): boolean {
  if (!v) return false
  const s = v.trim().toLowerCase()
  return s === '1' || s === 'true' || s === 'yes' || s === 'on'
}

function fail(msg: string): never {
  console.error(`[set-admin-password] ABORT: ${msg}`)
  process.exit(1)
}

function parseDbTarget(url: string): { host: string; db: string } {
  try {
    const u = new URL(url)
    return { host: u.hostname, db: u.pathname.replace(/^\//, '') }
  } catch {
    fail('DATABASE_URL invalido (nao parseavel).')
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) fail('DATABASE_URL ausente.')

  const targetEmail = process.env.TARGET_EMAIL?.trim()
  if (!targetEmail) fail('TARGET_EMAIL ausente (e-mail EXATO obrigatorio; nao inferir dominio).')

  const apply = isTruthy(process.env.SEED_APPLY)
  const { host, db } = parseDbTarget(databaseUrl)

  console.log(`[set-admin-password] alvo db: host=${host} database=${db}`)
  console.log(`[set-admin-password] alvo email: ${targetEmail}`)
  console.log(`[set-admin-password] modo: ${apply ? 'APPLY (write)' : 'DRY-RUN (somente leitura)'}`)

  // Guardas de host/db: so checam quando informadas; protegem contra apontar
  // para o banco errado (ex.: rodar contra prod sem querer).
  if (apply) {
    const expectHost = process.env.EXPECT_DB_HOST?.trim()
    const expectDb = process.env.EXPECT_DB_NAME?.trim()
    if (!expectHost || !expectDb) {
      fail('No APPLY, EXPECT_DB_HOST e EXPECT_DB_NAME sao obrigatorios (confirmacao de host/db).')
    }
    if (host !== expectHost) fail(`host do DATABASE_URL (${host}) != EXPECT_DB_HOST (${expectHost}).`)
    if (db !== expectDb) fail(`database do DATABASE_URL (${db}) != EXPECT_DB_NAME (${expectDb}).`)
    if (!process.env.NEW_PASSWORD) fail('NEW_PASSWORD ausente (obrigatoria no APPLY).')
  }

  const adapter = new PrismaPg({ connectionString: databaseUrl })
  const prisma = new PrismaClient({ adapter })

  try {
    const user = await prisma.user.findUnique({
      where: { email: targetEmail },
      select: { id: true, email: true, adminRole: true, userType: true, passwordHash: true },
    })

    if (!user) fail(`nenhum usuario com email=${targetEmail} (nada alterado).`)

    const hashState = user.passwordHash ? 'PRESENTE' : 'NULL'
    console.log(
      `[set-admin-password] encontrado: adminRole=${user.adminRole ?? 'null'} ` +
        `userType=${user.userType} password_hash=${hashState}`,
    )

    if (!apply) {
      console.log(
        `[set-admin-password] DRY-RUN: definiria passwordHash=*** para ${user.email}. ` +
          `Nenhum write realizado. Para aplicar: SEED_APPLY=1 + NEW_PASSWORD + EXPECT_DB_HOST/NAME.`,
      )
      return
    }

    const newHash = await bcrypt.hash(process.env.NEW_PASSWORD as string, BCRYPT_ROUNDS)
    const updated = await prisma.user.update({
      where: { email: targetEmail },
      data: { passwordHash: newHash },
      select: { id: true, email: true },
    })

    console.log(`[set-admin-password] OK: passwordHash=*** definido para ${updated.email} (id mascarado).`)
    console.log('[set-admin-password] Verifique: POST /api/v1/auth/login deve retornar 200 e setar a session cookie.')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  // Mascara qualquer payload de erro que possa conter dado sensivel.
  console.error('[set-admin-password] ERRO inesperado (detalhe mascarado).')
  console.error(err instanceof Error ? err.message : '***')
  process.exit(1)
})
