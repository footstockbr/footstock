import { prisma } from '@/lib/prisma'

export async function seedLeagues() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[seed:leagues] Seeds não executam em produção.')
  }

  const owner = await prisma.user.findUnique({
    where: { email: 'craque@foot-stock.test' },
  })

  if (!owner) {
    console.warn('[seed:leagues] Usuário craque@foot-stock.test não encontrado — skipping leagues')
    return
  }

  const leagues = [
    {
      name: 'Liga dos Campeões Teste',
      type: 'PUBLIC' as const,
      season: 2026,
      maxMembers: 20,
      inviteCode: 'TEST-PUBLIC-001',
    },
    {
      name: 'Liga VIP Privada',
      type: 'PRIVATE' as const,
      season: 2026,
      maxMembers: 10,
      inviteCode: 'TEST-PRIV-002',
    },
    {
      name: 'Liga Patrocinada Flamengo',
      type: 'SPONSORED' as const,
      season: 2026,
      maxMembers: 50,
      prizePool: 1000,
      inviteCode: 'TEST-SPON-003',
    },
  ]

  for (const league of leagues) {
    await prisma.league.upsert({
      where: { inviteCode: league.inviteCode },
      create: { ...league, ownerId: owner.id },
      update: {},
    })
    console.log(`[seed:leagues] ✓ ${league.name}`)
  }
}
