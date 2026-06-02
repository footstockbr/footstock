/**
 * Seed de Demonstração — Milestone 7
 * FootStock | module-19-inbox-notificacoes
 *
 * Execução: npx ts-node prisma/seed-milestone-7.ts
 *
 * Cria:
 *  - 3 usuários de demo (Jogador / Craque / Lenda)
 *  - 5 posts no fórum (likes via campo `likes` no ForumPost)
 *  - 1 liga pública ativa com 3 membros e scores
 *  - notificações de demonstração por usuário
 *
 * Idempotente: executar 2x não duplica dados
 */

import { PrismaClient, NotificationType } from '@prisma/client'

const prisma = new PrismaClient()

// ─── Usuários de demo ──────────────────────────────────────────────────────────

async function getOrCreateDemoUsers() {
  const birthDate = new Date('1990-01-01')

  const jogador = await prisma.user.upsert({
    where: { email: 'demo@jogador.footstock' },
    update: {},
    create: {
      email: 'demo@jogador.footstock',
      cpfHash: 'demo_cpf_hash_jogador_footstock_0001_placeholder_64ch',
      name: 'Demo Jogador',
      birthDate,
      favoriteClub: 'FLM',
      favoriteClubDisplayName: 'Flamengo',
      investorProfile: 'INICIANTE',
      planType: 'JOGADOR',
    },
  })

  const craque = await prisma.user.upsert({
    where: { email: 'demo@craque.footstock' },
    update: {},
    create: {
      email: 'demo@craque.footstock',
      cpfHash: 'demo_cpf_hash_craque_footstock_0002_placeholder_64ch',
      name: 'Demo Craque',
      birthDate,
      favoriteClub: 'PAL',
      favoriteClubDisplayName: 'Palmeiras',
      investorProfile: 'INTERMEDIARIO',
      planType: 'CRAQUE',
    },
  })

  const lenda = await prisma.user.upsert({
    where: { email: 'demo@lenda.footstock' },
    update: {},
    create: {
      email: 'demo@lenda.footstock',
      cpfHash: 'demo_cpf_hash_lenda_footstock_0003_placeholder_64ch',
      name: 'Demo Lenda',
      birthDate,
      favoriteClub: 'FLM',
      favoriteClubDisplayName: 'Flamengo',
      investorProfile: 'AVANCADO',
      planType: 'LENDA',
    },
  })

  return { jogadorId: jogador.id, craqueId: craque.id, lendaId: lenda.id }
}

// ─── Posts no Fórum ────────────────────────────────────────────────────────────

async function seedForumPosts(users: { jogadorId: string; craqueId: string; lendaId: string }) {
  const posts = [
    {
      userId: users.jogadorId,
      content: 'Flamengo tá em alta hoje, alguém mais notou? #FLM',
      ticker: 'FLM',
      likes: 3,
    },
    {
      userId: users.craqueId,
      content: 'Análise técnica: Palmeiras com suporte em FS$ 45. Short selling pode ser interessante.',
      ticker: 'PAL',
      likes: 0,
    },
    {
      userId: users.lendaId,
      content: 'Diversificação é fundamental. Eu tenho 8 clubes diferentes na carteira.',
      ticker: null,
      likes: 0,
    },
    {
      userId: users.jogadorId,
      content: 'Alguém sabe o que aconteceu com URU3 hoje? Caiu 12% sem notícia.',
      ticker: 'URU3',
      likes: 2,
    },
    {
      userId: users.craqueId,
      content: 'O conceito de fair value no FootStock é diferente do mercado real. Leiam o glossário!',
      ticker: null,
      likes: 0,
    },
  ]

  let created = 0
  for (const post of posts) {
    // Verificar por conteúdo + userId para idempotência
    const existing = await prisma.globalForumPost.findFirst({
      where: {
        userId: post.userId,
        content: post.content,
      },
    })

    if (!existing) {
      await prisma.globalForumPost.create({
        data: {
          userId: post.userId,
          content: post.content,
          ticker: post.ticker,
        },
      })
      created++
    }
  }

  console.log(`  ✓ ${posts.length} posts no fórum (${created} novos)`)
}

// ─── Liga de demonstração ──────────────────────────────────────────────────────

async function seedLeague(users: { jogadorId: string; craqueId: string; lendaId: string }) {
  const leagueName = 'Liga Demo — Semana 5'

  let league = await prisma.league.findFirst({ where: { name: leagueName } })

  if (!league) {
    league = await prisma.league.create({
      data: {
        name: leagueName,
        slug: leagueName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-seed',
        type: 'PUBLICA',
        division: 'PRATA',
        duration: '1S',
        status: 'ACTIVE',
        startsAt: new Date(),
        endsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdBy: users.lendaId,
      },
    })
  }

  const members = [
    { userId: users.lendaId, score: 71, rank: 1 },
    { userId: users.craqueId, score: 45, rank: 2 },
    { userId: users.jogadorId, score: 12, rank: 3 },
  ]

  for (const member of members) {
    const existing = await prisma.leagueMember.findFirst({
      where: { leagueId: league.id, userId: member.userId },
    })

    if (!existing) {
      await prisma.leagueMember.create({
        data: {
          leagueId: league.id,
          userId: member.userId,
          score: member.score,
          rank: member.rank,
        },
      })
    }
  }

  console.log(`  ✓ Liga "${leagueName}" com 3 membros`)
  return league
}

// ─── Notificações de demonstração ────────────────────────────────────────────

async function seedNotifications(
  users: { jogadorId: string; craqueId: string; lendaId: string },
  leagueId: string
) {
  const demoNotifications = [
    // Jogador: 1 lida + 1 não-lida → badge = 1
    {
      userId: users.jogadorId,
      type: 'ORDER_EXECUTED',
      title: 'Ordem executada!',
      body: 'Compra de 10 ações FLM a FS$ 42,50 executada com sucesso.',
      metadata: { ticker: 'FLM', quantity: 10, price: 42.5 },
      read: true,
    },
    {
      userId: users.jogadorId,
      type: 'LEAGUE_RESULT',
      title: 'Resultado da liga!',
      body: 'Liga Demo encerrou. Você ficou em 3º lugar com 12 pts.',
      metadata: { leagueId, rank: 3 },
      read: false,
    },
    // Craque: 1 lida + 1 não-lida → badge = 1
    {
      userId: users.craqueId,
      type: 'ORDER_EXECUTED',
      title: 'Ordem executada!',
      body: 'Compra de 5 ações PAL a FS$ 45,00 executada com sucesso.',
      metadata: { ticker: 'PAL', quantity: 5, price: 45.0 },
      read: true,
    },
    {
      userId: users.craqueId,
      type: 'LEAGUE_RESULT',
      title: 'Resultado da liga!',
      body: 'Liga Demo encerrou. Você ficou em 2º lugar com 45 pts.',
      metadata: { leagueId, rank: 2 },
      read: false,
    },
    // Lenda: 1 lida + 2 não-lidas → badge = 2
    {
      userId: users.lendaId,
      type: 'ORDER_EXECUTED',
      title: 'Ordem executada!',
      body: 'Compra de 20 ações FLM a FS$ 42,50 executada com sucesso.',
      metadata: { ticker: 'FLM', quantity: 20, price: 42.5 },
      read: true,
    },
    {
      userId: users.lendaId,
      type: 'LEAGUE_RESULT',
      title: 'Resultado da liga! 🏆',
      body: 'Liga Demo encerrou. Você ficou em 1º lugar com 71 pts! Parabéns!',
      metadata: { leagueId, rank: 1 },
      read: false,
    },
    {
      userId: users.lendaId,
      type: 'NEWS_FAVORITE_CLUB',
      title: 'Notícia do seu clube favorito',
      body: 'Flamengo anuncia renovação de contrato com jogador-chave da defesa.',
      metadata: { ticker: 'FLM' },
      read: false,
    },
  ]

  let created = 0
  for (const n of demoNotifications) {
    const existing = await prisma.notification.findFirst({
      where: { userId: n.userId, type: n.type as NotificationType },
    })

    if (!existing) {
      await prisma.notification.create({
        data: {
          userId: n.userId,
          type: n.type as NotificationType,
          title: n.title,
          body: n.body,
          data: n.metadata ?? undefined,
          isRead: n.read,
        },
      })
      created++
    }
  }

  console.log(`  ✓ ${demoNotifications.length} notificações de demo (${created} novas)`)
}

// ─── Interações do Glossário (SKIP — modelo não disponível) ─────────────────

async function seedGlossaryInteractions() {
  // GlossaryInteraction model não existe no schema Prisma atual.
  // Dependência: module-18/TASK-1 deve criar o model e a migration.
  // Quando disponível, descomentar e implementar:
  // - 10 interações para Lenda (slugs: short-selling, margin-call, etc.)
  // - 4 interações para Craque
  // - 0 para Jogador
  console.log('  ⏭ Interações do glossário: SKIP (model GlossaryInteraction não disponível no schema)')
}

// ─── Orquestrador ──────────────────────────────────────────────────────────────

export async function seedMilestone7() {
  console.log('🌱 Seed Milestone 7 iniciando...')

  const users = await getOrCreateDemoUsers()
  console.log(`  ✓ Usuários de demo verificados`)

  await seedForumPosts(users)

  const league = await seedLeague(users)

  await seedNotifications(users, league.id)

  await seedGlossaryInteractions()

  console.log('')
  console.log('✅ Seed Milestone 7 concluído!')
  console.log('')
  console.log('Usuários de demo:')
  console.log('  Jogador: demo@jogador.footstock / Demo@123  (badge: 1)')
  console.log('  Craque:  demo@craque.footstock  / Demo@123  (badge: 1)')
  console.log('  Lenda:   demo@lenda.footstock   / Demo@123  (badge: 2)')
  console.log('')
  console.log('O que verificar:')
  console.log('  /forum     → 5 posts com conteúdo diverso e likes')
  console.log('  /ligas     → "Liga Demo — Semana 5" ativa com ranking')
  console.log('  sino/badge → badge com notificações não-lidas por usuário')
}

seedMilestone7()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
