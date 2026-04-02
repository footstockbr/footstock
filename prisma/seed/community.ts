/**
 * Seed: Community — GlobalForumPosts, ForumLikes, LeagueMembers, ForumPosts (liga),
 * GlossaryInteractions, Notifications (todos os 14 NotificationTypes).
 * Idempotente (upsert por id fixo).
 */
import { prisma } from '@/lib/prisma'

const now = new Date()
const d = (offsetDays: number) => new Date(now.getTime() + offsetDays * 86_400_000)

export async function seedCommunity() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[seed:community] Seeds não executam em produção.')
  }

  const [craque, lenda, jogador, editor, moderador] = await Promise.all([
    prisma.user.findUnique({ where: { email: 'craque@foot-stock.test' } }),
    prisma.user.findUnique({ where: { email: 'lenda@foot-stock.test' } }),
    prisma.user.findUnique({ where: { email: 'jogador@foot-stock.test' } }),
    prisma.user.findUnique({ where: { email: 'editor@foot-stock.test' } }),
    prisma.user.findUnique({ where: { email: 'moderador@foot-stock.test' } }),
  ])

  if (!craque || !lenda || !jogador) {
    throw new Error('[seed:community] Usuários âncora não encontrados.')
  }

  // =========================================================================
  // GLOBAL FORUM POSTS
  // =========================================================================

  const globalPosts = [
    {
      id: 'gfp-001', userId: craque.id, content: 'Flamengo subindo forte hoje! Alguém mais de olho nesse ativo? #FLA3', ticker: 'FLA3',
      isFlagged: false, flagCount: 0, isDeleted: false,
    },
    {
      id: 'gfp-002', userId: lenda.id, content: 'Palmeiras vai disparar com esse patrocínio. Comprei mais 50 ações hoje.', ticker: 'PAL3',
      isFlagged: false, flagCount: 0, isDeleted: false,
    },
    {
      id: 'gfp-003', userId: jogador.id, content: 'Alguém pode me explicar o que é alavancagem?',
      isFlagged: false, flagCount: 0, isDeleted: false, ticker: null,
    },
    {
      id: 'gfp-004', userId: craque.id, content: 'palavrao spam golpe', ticker: null, // palavra bloqueada — para testar moderação
      isFlagged: true, flagCount: 3, isDeleted: false,
    },
    {
      id: 'gfp-005', userId: lenda.id, content: 'Post deletado pelo moderador — violação das regras da comunidade.', ticker: null,
      isFlagged: false, flagCount: 5, isDeleted: true, // edge case: post removido
    },
    {
      id: 'gfp-006', userId: jogador.id, content: 'Qual o limite de ordens para o plano Jogador?',
      isFlagged: false, flagCount: 0, isDeleted: false, ticker: null,
    },
  ]

  for (const post of globalPosts) {
    await prisma.globalForumPost.upsert({
      where: { id: post.id },
      create: {
        id: post.id,
        userId: post.userId,
        content: post.content,
        ticker: post.ticker,
        isFlagged: post.isFlagged,
        flagCount: post.flagCount,
        isDeleted: post.isDeleted,
      },
      update: {},
    })
  }

  // Forum Likes
  const likes = [
    { id: 'fl-001', postId: 'gfp-001', userId: lenda.id },
    { id: 'fl-002', postId: 'gfp-001', userId: jogador.id },
    { id: 'fl-003', postId: 'gfp-002', userId: craque.id },
    { id: 'fl-004', postId: 'gfp-003', userId: craque.id },
  ]

  for (const like of likes) {
    await prisma.forumLike.upsert({
      where: { id: like.id },
      create: { id: like.id, postId: like.postId, userId: like.userId },
      update: {},
    })
  }

  console.log('[seed:community] ✓ GlobalForumPosts: 6 (normal, flagged, deleted) + 4 likes')

  // =========================================================================
  // LEAGUE MEMBERS — associa usuários às ligas existentes
  // =========================================================================

  const leagues = await prisma.league.findMany({ take: 3 })
  if (leagues.length > 0) {
    const leaguePublica = leagues.find(l => l.type === 'PUBLICA') ?? leagues[0]!
    const leagueAmigos = leagues.find(l => l.type === 'AMIGOS') ?? leagues[0]!
    const leaguePro = leagues.find(l => l.type === 'PRO') ?? leagues[0]!

    const memberSeeds = [
      // Liga Pública
      { id: 'lm-001', leagueId: leaguePublica.id, userId: craque.id, score: 1250.5, rank: 1 },
      { id: 'lm-002', leagueId: leaguePublica.id, userId: lenda.id, score: 980.0, rank: 2 },
      { id: 'lm-003', leagueId: leaguePublica.id, userId: jogador.id, score: 430.0, rank: 3 },
      // Liga Amigos
      { id: 'lm-004', leagueId: leagueAmigos.id, userId: craque.id, score: 750.0, rank: 1 },
      { id: 'lm-005', leagueId: leagueAmigos.id, userId: lenda.id, score: 600.0, rank: 2 },
      // Liga PRO (Lenda only)
      { id: 'lm-006', leagueId: leaguePro.id, userId: lenda.id, score: 2100.0, rank: 1 },
    ]

    for (const m of memberSeeds) {
      await prisma.leagueMember.upsert({
        where: { leagueId_userId: { leagueId: m.leagueId, userId: m.userId } },
        create: {
          id: m.id,
          leagueId: m.leagueId,
          userId: m.userId,
          score: m.score,
          rank: m.rank,
          joinedAt: d(-10),
        },
        update: { score: m.score, rank: m.rank },
      })
    }

    // Forum Posts dentro da liga pública
    const forumPosts = [
      {
        id: 'fp-001', leagueId: leaguePublica.id, userId: craque.id,
        content: 'Pessoal, alguém vai comprar mais Flamengo antes da rodada?',
        isPinned: false,
      },
      {
        id: 'fp-002', leagueId: leaguePublica.id, userId: lenda.id,
        content: '📌 Regras da liga: sem spam, sem dicas de manipulação. Bom jogo a todos!',
        isPinned: true,
      },
    ]

    for (const fp of forumPosts) {
      await prisma.forumPost.upsert({
        where: { id: fp.id },
        create: {
          id: fp.id,
          leagueId: fp.leagueId,
          userId: fp.userId,
          content: fp.content,
          isPinned: fp.isPinned,
        },
        update: {},
      })
    }

    console.log('[seed:community] ✓ LeagueMembers: 6 (3 ligas) + ForumPosts: 2 (1 pinado)')
  }

  // =========================================================================
  // GLOSSARY INTERACTIONS
  // =========================================================================

  const glossaryTerms = ['alavancagem', 'short-selling', 'stop-loss', 'oco', 'circuit-breaker', 'dividend', 'margin-call']

  for (const term of glossaryTerms) {
    await prisma.glossaryInteraction.upsert({
      where: { id: `gi-craque-${term}` },
      create: { id: `gi-craque-${term}`, userId: craque.id, termSlug: term },
      update: {},
    })
  }

  await prisma.glossaryInteraction.upsert({
    where: { id: 'gi-jogador-alavancagem' },
    create: { id: 'gi-jogador-alavancagem', userId: jogador.id, termSlug: 'alavancagem' },
    update: {},
  })

  console.log('[seed:community] ✓ GlossaryInteractions: 8 registros')

  // =========================================================================
  // NOTIFICATIONS — todos os 14 NotificationTypes
  // =========================================================================

  const notificationSeeds = [
    { id: 'notif-001', userId: jogador.id, type: 'ORDER_EXECUTED' as const, title: 'Ordem executada', body: 'Sua ordem de compra de 10 ações FLA3 foi executada com sucesso.', isRead: true },
    { id: 'notif-002', userId: craque.id, type: 'ORDER_CANCELLED' as const, title: 'Ordem cancelada', body: 'Sua ordem limite de venda de 15 ações FLA3 foi cancelada por expiração.', isRead: false },
    { id: 'notif-003', userId: lenda.id, type: 'MARGIN_CALL_ALERT' as const, title: 'Alerta de Margin Call', body: 'Sua posição em PAL3 está próxima do nível de liquidação. Adicione margem ou reduza a posição.', isRead: false },
    { id: 'notif-004', userId: craque.id, type: 'CIRCUIT_BREAKER' as const, title: 'Circuit Breaker ativado', body: 'O ativo FLA3 atingiu o limite de variação diária (-15%) e está temporariamente suspenso.', isRead: true },
    { id: 'notif-005', userId: jogador.id, type: 'NEWS_FAVORITE_CLUB' as const, title: 'Notícia do seu clube', body: 'Seu clube favorito FLA3 foi mencionado em nova notícia: "Flamengo assina contrato histórico".', isRead: false },
    { id: 'notif-006', userId: craque.id, type: 'PAYMENT_CONFIRMED' as const, title: 'Pagamento confirmado', body: 'Sua assinatura Craque foi renovada com sucesso. Próximo vencimento em 30 dias.', isRead: true },
    { id: 'notif-007', userId: lenda.id, type: 'PAYMENT_FAILED' as const, title: 'Falha no pagamento', body: 'Não foi possível processar o pagamento da sua assinatura Lenda. Verifique seus dados de pagamento.', isRead: false },
    { id: 'notif-008', userId: craque.id, type: 'PLAN_CANCEL_ALERT' as const, title: 'Assinatura será cancelada', body: 'Sua assinatura Craque será cancelada em 7 dias. Renove para manter o acesso premium.', isRead: false },
    { id: 'notif-009', userId: lenda.id, type: 'DIVIDEND_CREDITED' as const, title: 'Dividendo creditado', body: 'Você recebeu FS$ 45,00 de dividendo financeiro do Palmeiras (PAL3) referente ao mês de março.', isRead: true },
    { id: 'notif-010', userId: jogador.id, type: 'BONUS_CREDITED' as const, title: 'Bônus creditado', body: 'Você recebeu um bônus de FS$ 500 de boas-vindas em sua conta!', isRead: true },
    { id: 'notif-011', userId: craque.id, type: 'LEAGUE_RESULT' as const, title: 'Resultado da liga', body: 'A Liga dos Campeões Teste encerrou! Você ficou em 1º lugar e ganhou FS$ 1.000 de premiação.', isRead: false },
    { id: 'notif-012', userId: jogador.id, type: 'ADMIN_BROADCAST' as const, title: 'Comunicado da Foot Stock', body: 'Manutenção programada neste sábado entre 02h e 04h. O mercado ficará temporariamente indisponível.', isRead: false },
    { id: 'notif-013', userId: craque.id, type: 'CANCELLATION_LOCK_ACTIVE' as const, title: 'Trava de cancelamento ativa', body: 'Sua assinatura entrou no período de trava de 30 dias. O cancelamento poderá ser solicitado após esse período.', isRead: true },
    { id: 'notif-014', userId: lenda.id, type: 'CANCELLATION_LOCK_LIQUIDATED' as const, title: 'Trava de cancelamento encerrada', body: 'O período de trava de 30 dias da sua assinatura encerrou. Você pode cancelar a qualquer momento.', isRead: true },
  ]

  for (const n of notificationSeeds) {
    await prisma.notification.upsert({
      where: { id: n.id },
      create: {
        id: n.id,
        userId: n.userId,
        type: n.type,
        title: n.title,
        body: n.body,
        isRead: n.isRead,
      },
      update: {},
    })
  }

  console.log('[seed:community] ✓ Notifications: 14 (todos os NotificationTypes, mix lido/não lido)')
}
