import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const leaguesSeed = async () => {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set')
  }

  const adapter = new PrismaPg({ connectionString })
  const prisma = new PrismaClient({ adapter })

  try {
    // Obter um admin para usar como createdBy
    let adminUser = await prisma.user.findFirst({
      where: { adminRole: 'SUPER_ADMIN' },
      select: { id: true },
    })

    if (!adminUser) {
      adminUser = await prisma.user.findFirst({
        where: { adminRole: { not: null } },
        select: { id: true },
      })
    }

    if (!adminUser) {
      adminUser = await prisma.user.findFirst({ select: { id: true } })
    }

    if (!adminUser) {
      console.warn('[seed] Leagues: nenhum usuário encontrado — seed pulado')
      return
    }

    const adminId = adminUser.id
    const now = new Date()

    const leagues = [
      // Públicas
      {
        id: 'seed-pub-ouro-abril26',
        name: 'Liga Pública Ouro — Abril 2026',
        slug: 'liga-publica-ouro-abril-2026',
        type: 'PUBLICA' as const,
        division: 'OURO',
        duration: '1M',
        status: 'ACTIVE',
        maxMembers: 200,
        prizePool: '0.00',
        startsAt: new Date('2026-04-01T00:00:00.000Z'),
        endsAt: new Date('2026-04-30T23:59:59.000Z'),
        permiteAlavancagem: false,
      },
      {
        id: 'seed-pub-bronze-semana',
        name: 'Liga Bronze da Semana',
        slug: 'liga-bronze-semana-abr26',
        type: 'PUBLICA' as const,
        division: 'BRONZE',
        duration: '1S',
        status: 'ACTIVE',
        maxMembers: 200,
        prizePool: '0.00',
        startsAt: new Date('2026-04-14T00:00:00.000Z'),
        endsAt: new Date('2026-04-21T23:59:59.000Z'),
        permiteAlavancagem: false,
      },
      {
        id: 'seed-pub-aberta-temp',
        name: 'Temporada Aberta 2025/26',
        slug: 'temporada-aberta-2025-26',
        type: 'PUBLICA' as const,
        division: 'ABERTA',
        duration: 'TEMPORADA',
        status: 'ACTIVE',
        maxMembers: 200,
        prizePool: '0.00',
        startsAt: new Date('2026-01-01T00:00:00.000Z'),
        endsAt: new Date('2026-07-31T23:59:59.000Z'),
        permiteAlavancagem: false,
      },
      {
        id: 'seed-pub-prata-abril26',
        name: 'Liga Prata Abril',
        slug: 'liga-prata-abril-2026',
        type: 'PUBLICA' as const,
        division: 'PRATA',
        duration: '1M',
        status: 'ACTIVE',
        maxMembers: 200,
        prizePool: '0.00',
        startsAt: new Date('2026-04-01T00:00:00.000Z'),
        endsAt: new Date('2026-04-30T23:59:59.000Z'),
        permiteAlavancagem: false,
      },
      {
        id: 'seed-pub-bronze-enc',
        name: 'Liga Bronze Março (Encerrada)',
        slug: 'liga-bronze-marco-2026-enc',
        type: 'PUBLICA' as const,
        division: 'BRONZE',
        duration: '1M',
        status: 'FINISHED',
        maxMembers: 200,
        prizePool: '0.00',
        startsAt: new Date('2026-03-01T00:00:00.000Z'),
        endsAt: new Date('2026-03-31T23:59:59.000Z'),
        permiteAlavancagem: false,
      },
      // Amigos
      {
        id: 'seed-ami-galera',
        name: 'Galera do Brasileirão',
        slug: 'galera-do-brasileirao-2026',
        type: 'AMIGOS' as const,
        division: 'BRONZE',
        duration: 'TEMPORADA',
        status: 'ACTIVE',
        maxMembers: 20,
        prizePool: '0.00',
        startsAt: new Date('2026-04-01T00:00:00.000Z'),
        endsAt: new Date('2026-07-31T23:59:59.000Z'),
        permiteAlavancagem: false,
      },
      {
        id: 'seed-ami-fanaticos',
        name: 'Fanáticos do Futebol',
        slug: 'fanaticos-do-futebol-2026',
        type: 'AMIGOS' as const,
        division: 'PRATA',
        duration: '1M',
        status: 'ACTIVE',
        maxMembers: 20,
        prizePool: '0.00',
        startsAt: new Date('2026-04-01T00:00:00.000Z'),
        endsAt: new Date('2026-04-30T23:59:59.000Z'),
        permiteAlavancagem: false,
      },
      {
        id: 'seed-ami-traders',
        name: 'Traders FC',
        slug: 'traders-fc-abril-2026',
        type: 'AMIGOS' as const,
        division: 'OURO',
        duration: '1M',
        status: 'ACTIVE',
        maxMembers: 20,
        prizePool: '0.00',
        startsAt: new Date('2026-04-10T00:00:00.000Z'),
        endsAt: new Date('2026-05-10T23:59:59.000Z'),
        permiteAlavancagem: false,
      },
      // PRO
      {
        id: 'seed-pro-craque-abr',
        name: 'Liga PRO Craque — Abril',
        slug: 'liga-pro-craque-abril-2026',
        type: 'PRO' as const,
        division: 'OURO',
        duration: '1M',
        status: 'ACTIVE',
        maxMembers: 500,
        prizePool: '0.00',
        startsAt: new Date('2026-04-01T00:00:00.000Z'),
        endsAt: new Date('2026-04-30T23:59:59.000Z'),
        permiteAlavancagem: true,
      },
      {
        id: 'seed-pro-elite-temp',
        name: 'PRO Elite Temporada 2026',
        slug: 'pro-elite-temporada-2026',
        type: 'PRO' as const,
        division: 'ABERTA',
        duration: 'TEMPORADA',
        status: 'ACTIVE',
        maxMembers: 500,
        prizePool: '0.00',
        startsAt: new Date('2026-01-01T00:00:00.000Z'),
        endsAt: new Date('2026-12-31T23:59:59.000Z'),
        permiteAlavancagem: true,
      },
      {
        id: 'seed-pro-lenda-abr',
        name: 'Liga PRO Lenda — Sprint',
        slug: 'liga-pro-lenda-sprint-abr26',
        type: 'PRO' as const,
        division: 'OURO',
        duration: '1S',
        status: 'ACTIVE',
        maxMembers: 500,
        prizePool: '0.00',
        startsAt: new Date('2026-04-14T00:00:00.000Z'),
        endsAt: new Date('2026-04-21T23:59:59.000Z'),
        permiteAlavancagem: true,
      },
    ]

    console.log('[seed] Leagues: inserindo ligas demo...')
    let inserted = 0

    for (const league of leagues) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "leagues" (
          id, name, slug, type, division, duration, status,
          max_members, prize_pool, starts_at, ends_at,
          created_by, permite_alavancagem, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::decimal, $10, $11, $12, $13, NOW(), NOW())
        ON CONFLICT (id) DO NOTHING`,
        league.id,
        league.name,
        league.slug,
        league.type,
        league.division,
        league.duration,
        league.status,
        league.maxMembers,
        league.prizePool,
        league.startsAt,
        league.endsAt,
        adminId,
        league.permiteAlavancagem
      )
      inserted++
    }

    console.log(`[seed] Leagues: ${inserted} ligas processadas (ON CONFLICT DO NOTHING para duplicatas)`)
  } finally {
    await prisma.$disconnect()
  }
}

leaguesSeed().catch((err) => {
  console.error('[seed] Leagues error:', err)
  process.exit(1)
})
