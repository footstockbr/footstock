/**
 * Seed dos 9 usuarios de teste em PRODUCAO.
 * - Cria identidade em Supabase Auth (email + password + email_confirm:true)
 * - Cria User row em Prisma com id == supabase auth user id
 * Idempotente: skip se ja existe em ambos.
 *
 * Uso: dotenv -e .env.production -- npx tsx scripts/seed-prod-test-users.ts
 */

import { createClient } from '@supabase/supabase-js'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { createHash } from 'node:crypto'

type DevTestUserProfile = {
  password: string
  name: string
  planType: 'JOGADOR' | 'CRAQUE' | 'LENDA'
  adminRole?: 'SUPER_ADMIN' | 'ADMINISTRADOR' | 'MONITOR' | 'EDITOR' | 'MODERADOR' | 'CLUB_PARTNER'
  label?: string
  clubId?: string
  clubName?: string
}

const DEV_PASSWORD = 'FootStock@Dev2026!'

const DEV_TEST_USERS: Record<string, DevTestUserProfile> = {
  'superadmin@foot-stock.test': { password: DEV_PASSWORD, name: 'Super Admin', planType: 'LENDA', adminRole: 'SUPER_ADMIN' },
  'admin@foot-stock.test': { password: DEV_PASSWORD, name: 'Administrador Teste', planType: 'LENDA', adminRole: 'ADMINISTRADOR' },
  'monitor@foot-stock.test': { password: DEV_PASSWORD, name: 'Monitor Teste', planType: 'LENDA', adminRole: 'MONITOR' },
  'editor@foot-stock.test': { password: DEV_PASSWORD, name: 'Editor Teste', planType: 'LENDA', adminRole: 'EDITOR' },
  'moderador@foot-stock.test': { password: DEV_PASSWORD, name: 'Moderador Teste', planType: 'LENDA', adminRole: 'MODERADOR' },
  'craque@foot-stock.test': { password: DEV_PASSWORD, name: 'Usuário Craque', planType: 'CRAQUE' },
  'lenda@foot-stock.test': { password: DEV_PASSWORD, name: 'Usuário Lenda', planType: 'LENDA', label: 'LENDA / AFILIADO' },
  'jogador@foot-stock.test': { password: DEV_PASSWORD, name: 'Usuário Jogador', planType: 'JOGADOR' },
  'clube-parceiro@foot-stock.test': { password: DEV_PASSWORD, name: 'Clube Parceiro FC', planType: 'JOGADOR', adminRole: 'CLUB_PARTNER', clubId: 'COL3', clubName: 'Colorado do Beira-Rio SC' },
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const DIRECT_URL = process.env.DIRECT_URL ?? process.env.DATABASE_URL

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !DIRECT_URL) {
  console.error('Missing env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DIRECT_URL')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const adapter = new PrismaPg({ connectionString: DIRECT_URL })
const prisma = new PrismaClient({ adapter })

function cpfHashFor(email: string): string {
  // CPF hash deterministico para test users (atende constraint unique cpfHash)
  return createHash('sha256').update(`test-cpf:${email}`).digest('hex')
}

async function ensureSupabaseUser(email: string, password: string): Promise<string> {
  // Tenta achar usuario existente via listUsers (paginado)
  let page = 1
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(`listUsers failed: ${error.message}`)
    const found = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
    if (found) return found.id
    if (data.users.length < 200) break
    page++
  }
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`createUser failed for ${email}: ${error?.message}`)
  return data.user.id
}

async function ensurePrismaUser(id: string, email: string, profile: DevTestUserProfile) {
  const existing = await prisma.user.findUnique({ where: { id } })
  if (existing) {
    return { action: 'skip', id, email }
  }
  const existingByEmail = await prisma.user.findUnique({ where: { email } })
  if (existingByEmail && existingByEmail.id !== id) {
    return { action: 'mismatch', id, email, dbId: existingByEmail.id }
  }
  await prisma.user.create({
    data: {
      id,
      email,
      name: profile.name,
      cpfHash: cpfHashFor(email),
      planType: profile.planType,
      adminRole: profile.adminRole ?? null,
      investorProfile: 'INICIANTE',
      favoriteClub: profile.clubId ?? 'FLAM',
      userType: profile.adminRole ? (profile.adminRole === 'CLUB_PARTNER' ? 'CLUB_PARTNER' : 'ADMIN') : 'NORMAL',
      fsBalance: profile.planType === 'LENDA' ? 25000 : profile.planType === 'CRAQUE' ? 5000 : 2000,
      birthDate: new Date('1990-01-01'),
      tourCompleted: true,
    },
  })
  return { action: 'create', id, email }
}

async function main() {
  console.log(`[seed-prod] Target Supabase: ${SUPABASE_URL}`)
  console.log(`[seed-prod] Users to seed: ${Object.keys(DEV_TEST_USERS).length}`)
  const results: Array<Record<string, unknown>> = []
  for (const [email, profile] of Object.entries(DEV_TEST_USERS)) {
    try {
      const supabaseId = await ensureSupabaseUser(email, profile.password)
      const r = await ensurePrismaUser(supabaseId, email, profile)
      console.log(`  [${r.action}] ${email} -> ${r.id}`)
      results.push({ email, ...r })
    } catch (err) {
      console.error(`  [FAIL] ${email}:`, err instanceof Error ? err.message : err)
      results.push({ email, action: 'error', error: String(err) })
    }
  }
  console.log('\n[seed-prod] Summary:')
  console.table(results)
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error('[seed-prod] Fatal:', err)
  process.exit(1)
})
