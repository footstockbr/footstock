import { prisma } from '@/lib/prisma'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

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
      type: 'PUBLICA' as const,
      duration: '1M',
      division: 'ABERTA',
      maxMembers: 20,
      inviteCode: 'TEST-PUBLIC-001',
    },
    {
      name: 'Liga VIP Privada',
      type: 'AMIGOS' as const,
      duration: '1S',
      division: 'BRONZE',
      maxMembers: 10,
      inviteCode: 'TEST-PRIV-002',
    },
    {
      name: 'Liga Patrocinada Urubu',
      type: 'PRO' as const,
      duration: 'TEMPORADA',
      division: 'OURO',
      maxMembers: 50,
      prizePool: 1000,
      inviteCode: 'TEST-SPON-003',
    },
  ]

  for (const league of leagues) {
    const startsAt = new Date()
    const endsAt = new Date(startsAt)
    if (league.duration === '1S') endsAt.setDate(endsAt.getDate() + 7)
    else if (league.duration === '1M') endsAt.setDate(endsAt.getDate() + 30)
    else endsAt.setDate(endsAt.getDate() + 180)

    await prisma.league.upsert({
      where: { inviteCode: league.inviteCode },
      create: {
        name: league.name,
        slug: `${slugify(league.name)}-${league.inviteCode.toLowerCase()}`,
        type: league.type,
        duration: league.duration,
        division: league.division,
        maxMembers: league.maxMembers,
        prizePool: league.prizePool ?? 0,
        inviteCode: league.inviteCode,
        startsAt,
        endsAt,
        createdBy: owner.id,
      },
      update: {},
    })
    console.log(`[seed:leagues] ✓ ${league.name}`)
  }
}
