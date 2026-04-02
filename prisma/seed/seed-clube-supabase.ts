/**
 * Script pontual: cria clube-parceiro@foot-stock.test no Supabase Auth
 * e recria o registro Prisma com o UUID correto.
 * Executar: npx ts-node --project tsconfig.seed.json -r tsconfig-paths/register prisma/seed/seed-clube-supabase.ts
 */
import { createClient } from '@supabase/supabase-js'
import { prisma } from '@/lib/prisma'
import { env } from '@/lib/env'
import { hashCPF } from '@/lib/utils/crypto'

async function main() {
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  )

  const email = 'clube-parceiro@foot-stock.test'
  const password = 'Test@1234!Clube'
  const name = 'Clube Parceiro FC'
  const cpf = '600.700.800-91'
  const cpfHash = hashCPF(cpf)

  // 1. Criar no Supabase Auth (ou obter ID existente)
  let userId: string

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, cpfHash, adminRole: 'CLUB_PARTNER' },
  })

  if (authError && !authError.message.includes('already been registered')) {
    throw new Error(`Erro ao criar usuário no Supabase Auth: ${authError.message}`)
  }

  if (authData?.user) {
    userId = authData.user.id
    console.log(`[seed] ✓ Criado no Supabase Auth: ${email} (${userId})`)
  } else {
    // Já existia — buscar ID
    const { data: listData } = await supabase.auth.admin.listUsers()
    const existing = listData?.users.find(u => u.email === email)
    if (!existing) throw new Error(`Usuário ${email} não encontrado no Supabase Auth após conflito`)
    userId = existing.id
    console.log(`[seed] ℹ Já existia no Supabase Auth: ${email} (${userId})`)
  }

  // 2. Deletar registro Prisma antigo (UUID divergente) se existir
  const existingPrisma = await prisma.user.findUnique({ where: { email } })
  if (existingPrisma && existingPrisma.id !== userId) {
    console.log(`[seed] ⚠ UUID divergente no Prisma (${existingPrisma.id}). Recriando...`)

    // Deletar dependências em cascata manualmente (se não houver ON DELETE CASCADE)
    await prisma.consent.deleteMany({ where: { userId: existingPrisma.id } })
    await prisma.user.delete({ where: { id: existingPrisma.id } })
    console.log(`[seed] ✓ Registro antigo deletado`)
  }

  // 3. Criar/atualizar no Prisma com UUID correto
  await prisma.user.upsert({
    where: { email },
    create: {
      id: userId,
      email,
      name,
      cpfHash,
      planType: 'JOGADOR',
      adminRole: 'CLUB_PARTNER',
      fsBalance: 0,
      favoriteClub: 'FLA3',
      tourCompleted: true,
      investorProfile: null,
    },
    update: {
      adminRole: 'CLUB_PARTNER',
      planType: 'JOGADOR',
    },
  })

  // 4. Consentimentos LGPD
  const purposes = ['ESSENTIAL', 'MARKETING', 'ANALYTICS', 'DATA_TERCEIROS'] as const
  for (const purpose of purposes) {
    await prisma.consent.upsert({
      where: { userId_purpose: { userId, purpose } },
      create: { userId, purpose, granted: true, grantedAt: new Date() },
      update: {},
    })
  }

  console.log(`[seed] ✓ ${email} pronto (Prisma + Supabase Auth + Consents)`)
  await prisma.$disconnect()
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
