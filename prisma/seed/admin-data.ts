/**
 * Seed: Admin Data — AdminMarketActions, ModerationRules, Sponsors (financeiros),
 * NsmDailyRecords, DataAccessLogs, DataExportJobs, IncidentLogs.
 * Idempotente (upsert por id fixo).
 */
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

const now = new Date()
const d = (offsetDays: number) => new Date(now.getTime() + offsetDays * 86_400_000)

export async function seedAdminData() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[seed:admin-data] Seeds não executam em produção.')
  }

  const [superAdmin, admin, editor, lenda, craque, suspenso] = await Promise.all([
    prisma.user.findUnique({ where: { email: 'superadmin@foot-stock.test' } }),
    prisma.user.findUnique({ where: { email: 'admin@foot-stock.test' } }),
    prisma.user.findUnique({ where: { email: 'editor@foot-stock.test' } }),
    prisma.user.findUnique({ where: { email: 'lenda@foot-stock.test' } }),
    prisma.user.findUnique({ where: { email: 'craque@foot-stock.test' } }),
    prisma.user.findUnique({ where: { email: 'suspenso@foot-stock.test' } }),
  ])

  if (!superAdmin || !admin) {
    throw new Error('[seed:admin-data] Admins não encontrados.')
  }

  const assets = await prisma.asset.findMany({ take: 4, orderBy: { ticker: 'asc' } })
  if (assets.length < 2) throw new Error('[seed:admin-data] Poucos assets.')

  // =========================================================================
  // ADMIN MARKET ACTIONS — cobre todos os tipos de ação
  // =========================================================================

  type ActionSeed = {
    id: string; adminId: string; assetId: string | null; action: string
    reason: string; ticker: string | null
    details: Prisma.InputJsonValue | typeof Prisma.JsonNull
    previousPrice?: number; newPrice?: number
  }

  const actionSeeds: ActionSeed[] = [
    { id: 'ama-001', adminId: editor!.id, assetId: assets[0]!.id, action: 'INJECT_NEWS', reason: 'Notícia editorial agendada sobre patrocínio', ticker: assets[0]!.ticker, details: { newsId: 'news-001' } },
    { id: 'ama-002', adminId: admin.id, assetId: assets[1]!.id, action: 'PAUSE_ASSET', reason: 'Verificação de anomalia de preço detectada', ticker: assets[1]!.ticker, details: Prisma.JsonNull },
    { id: 'ama-003', adminId: superAdmin.id, assetId: assets[0]!.id, action: 'ADJUST_PRICE', reason: 'Correção de valuation pós-auditoria', ticker: assets[0]!.ticker, details: Prisma.JsonNull, previousPrice: 35.50, newPrice: 38.20 },
    { id: 'ama-004', adminId: admin.id, assetId: null, action: 'HALT_TRADING', reason: 'Manutenção programada do motor', ticker: null, details: { duration: '2h' } },
    { id: 'ama-005', adminId: editor!.id, assetId: assets[2]!.id, action: 'NEWS_INJECT', reason: 'Injeção manual de notícia esportiva', ticker: assets[2]!.ticker, details: { newsId: 'news-003', impactCategory: 'ESPORTIVA_MAJORITARIA' } },
    { id: 'ama-006', adminId: admin.id, assetId: assets[1]!.id, action: 'TICKER_HALT', reason: 'Circuit breaker automático -15%', ticker: assets[1]!.ticker, details: Prisma.JsonNull },
    { id: 'ama-007', adminId: admin.id, assetId: assets[1]!.id, action: 'TICKER_RESUME', reason: 'Reabertura pós circuit breaker', ticker: assets[1]!.ticker, details: Prisma.JsonNull },
    { id: 'ama-008', adminId: superAdmin.id, assetId: null, action: 'MOD_RULE_UPDATE', reason: 'Atualização de regra de moderação #3', ticker: null, details: { ruleId: 3 } },
    { id: 'ama-009', adminId: admin.id, assetId: null, action: 'USER_SUSPEND', reason: 'Violação reiterada das regras da comunidade', ticker: null, details: { targetUserId: suspenso?.id ?? 'unknown' } },
    { id: 'ama-010', adminId: superAdmin.id, assetId: null, action: 'ADMIN_BROADCAST', reason: 'Comunicado de manutenção programada', ticker: null, details: { message: 'Manutenção neste sábado 02h-04h' } },
    { id: 'ama-011', adminId: admin.id, assetId: null, action: 'UNAUTHORIZED_ATTEMPT', reason: 'Tentativa de acesso a rota de superadmin bloqueada', ticker: null, details: { route: '/admin/gateways' } },
  ]

  for (const a of actionSeeds) {
    await prisma.adminMarketAction.upsert({
      where: { id: a.id },
      create: {
        id: a.id,
        adminId: a.adminId,
        assetId: a.assetId,
        action: a.action,
        reason: a.reason,
        ticker: a.ticker,
        details: a.details,
        ipAddress: '177.18.100.5',
        previousPrice: a.previousPrice ?? null,
        newPrice: a.newPrice ?? null,
        createdAt: d(-Math.floor(Math.random() * 7)),
      },
      update: {},
    })
  }

  console.log('[seed:admin-data] ✓ AdminMarketActions: 11 (todos os tipos de ação)')

  // =========================================================================
  // MODERATION RULES — fallback do Redis
  // =========================================================================

  const moderationRules = [
    { id: 1, name: 'max-flags-before-review', description: 'Posts com mais de 3 flags são enviados para revisão manual', enabled: true, config: { threshold: 3 } },
    { id: 2, name: 'blocked-words-filter', description: 'Filtra automaticamente posts com palavras da blacklist', enabled: true, config: { action: 'BLOCK' } },
    { id: 3, name: 'rate-limit-posts', description: 'Máximo de 10 posts por usuário por hora no fórum global', enabled: true, config: { limit: 10, windowSeconds: 3600 } },
    { id: 4, name: 'new-user-post-limit', description: 'Usuários com menos de 7 dias só podem fazer 3 posts/dia', enabled: true, config: { dayLimit: 3, accountAgedays: 7 } },
    { id: 5, name: 'auto-ban-on-repeated-violations', description: 'Banimento automático após 5 violações graves em 30 dias', enabled: false, config: { threshold: 5, windowDays: 30 } },
  ]

  for (const rule of moderationRules) {
    await prisma.moderationRule.upsert({
      where: { id: rule.id },
      create: {
        id: rule.id,
        name: rule.name,
        description: rule.description,
        enabled: rule.enabled,
        config: rule.config,
      },
      update: { enabled: rule.enabled, config: rule.config },
    })
  }

  console.log('[seed:admin-data] ✓ ModerationRules: 5 (4 enabled, 1 disabled)')

  // =========================================================================
  // SPONSORS (financeiros — para ligas)
  // =========================================================================

  const leaguePro = await prisma.league.findFirst({ where: { type: 'PRO' } })

  await prisma.sponsor.upsert({
    where: { id: 'sponsor-001' },
    create: {
      id: 'sponsor-001',
      assetId: assets[0]!.id,
      name: 'Brahma Parceiro Foot Stock',
      logoUrl: 'https://picsum.photos/seed/brahma/200/80',
      contractStart: d(-30),
      contractEnd: d(60),
      sponsorshipValue: 50000.00,
    },
    update: {},
  })

  // Associar sponsor à liga PRO se existir
  if (leaguePro) {
    await prisma.league.update({
      where: { id: leaguePro.id },
      data: { sponsorId: 'sponsor-001' },
    })
  }

  console.log('[seed:admin-data] ✓ Sponsors: 1 (vinculado à Liga PRO)')

  // =========================================================================
  // NSM DAILY RECORDS — 30 dias de histórico
  // =========================================================================

  for (let i = -29; i <= 0; i++) {
    const date = d(i)
    date.setHours(0, 0, 0, 0)
    const filledOrders = Math.floor(Math.random() * 300) + 100 // 100-400 ordens/dia
    const target = 500

    await prisma.nsmDailyRecord.upsert({
      where: { date },
      create: {
        date,
        filledOrders,
        target,
        percentage: (filledOrders / target) * 100,
        alertSent: filledOrders < target * 0.5, // alerta se < 50% do target
      },
      update: {},
    })
  }

  console.log('[seed:admin-data] ✓ NsmDailyRecords: 30 dias de histórico')

  // =========================================================================
  // DATA ACCESS LOGS — auditoria LGPD
  // =========================================================================

  const accessLogSeeds = [
    { id: 'dal-001', userId: lenda!.id, accessedBy: admin.id, dataType: 'profile', endpoint: '/api/admin/users/[id]', reason: 'Investigação de reclamação' },
    { id: 'dal-002', userId: lenda!.id, accessedBy: admin.id, dataType: 'financial', endpoint: '/api/admin/users/[id]/transactions', reason: 'Auditoria financeira' },
    { id: 'dal-003', userId: craque!.id, accessedBy: superAdmin.id, dataType: 'admin_view', endpoint: '/api/admin/users/[id]', reason: 'Revisão de suporte' },
    { id: 'dal-004', userId: lenda!.id, accessedBy: lenda!.id, dataType: 'full_export', endpoint: '/api/user/data-export', reason: 'Solicitação LGPD Art. 18' },
    { id: 'dal-005', userId: craque!.id, accessedBy: 'system', dataType: 'consents', endpoint: '/api/internal/lgpd/audit', reason: 'Auditoria automática mensal' },
  ]

  for (const log of accessLogSeeds) {
    await prisma.dataAccessLog.upsert({
      where: { id: log.id },
      create: {
        id: log.id,
        userId: log.userId,
        accessedBy: log.accessedBy,
        dataType: log.dataType,
        endpoint: log.endpoint,
        reason: log.reason,
        ipAddress: '177.18.200.10',
        createdAt: d(-Math.floor(Math.random() * 14)),
      },
      update: {},
    })
  }

  console.log('[seed:admin-data] ✓ DataAccessLogs: 5 (profile, financial, admin_view, full_export, consents)')

  // =========================================================================
  // DATA EXPORT JOBS — ExportJobStatus cobertura
  // =========================================================================

  if (lenda) {
    const exportJobs = [
      { id: 'dej-001', userId: lenda.id, status: 'COMPLETED' as const, filePath: '/tmp/exports/lenda-export-2026-03.zip', downloadUrl: 'https://storage.foot-stock.app/exports/lenda-2026-03.zip', expiresAt: d(7), completedAt: d(-2) },
      { id: 'dej-002', userId: lenda.id, status: 'PENDING' as const, filePath: null, downloadUrl: null, expiresAt: null, completedAt: null },
      { id: 'dej-003', userId: craque!.id, status: 'PROCESSING' as const, filePath: null, downloadUrl: null, expiresAt: null, completedAt: null },
      { id: 'dej-004', userId: craque!.id, status: 'FAILED' as const, filePath: null, downloadUrl: null, expiresAt: null, completedAt: null },
    ]

    for (const job of exportJobs) {
      await prisma.dataExportJob.upsert({
        where: { id: job.id },
        create: {
          id: job.id,
          userId: job.userId,
          status: job.status,
          format: 'json+csv',
          filePath: job.filePath,
          downloadUrl: job.downloadUrl,
          expiresAt: job.expiresAt,
          error: job.status === 'FAILED' ? 'Timeout ao gerar arquivo ZIP' : null,
          completedAt: job.completedAt,
        },
        update: {},
      })
    }

    console.log('[seed:admin-data] ✓ DataExportJobs: 4 (COMPLETED, PENDING, PROCESSING, FAILED)')
  }

  // =========================================================================
  // INCIDENT LOGS — registro de incidentes de segurança (LGPD Art. 48)
  // =========================================================================

  await prisma.incidentLog.upsert({
    where: { id: 'inc-001' },
    create: {
      id: 'inc-001',
      type: 'DATA_EXPOSURE_ATTEMPT',
      description: 'Tentativa de acesso massivo à rota /api/admin/users sem autenticação — bloqueada pelo rate limiter. IP bloqueado automaticamente.',
      affectedUsers: 0,
      dataTypes: ['profile'],
      detectedAt: d(-7),
      containedAt: d(-7),
      estimatedImpact: 'Nenhum dado exposto — bloqueio preventivo efetivo.',
      report: 'O sistema detectou 450 requisições em 60 segundos provenientes de um único IP (45.33.32.156). O rate limiter (Upstash Redis) bloqueou todas as requisições a partir da 101ª. Nenhum dado de usuário foi acessado. IP adicionado à blocklist.',
      notifiedAt: d(-7),
      emailSent: true,
    },
    update: {},
  })

  console.log('[seed:admin-data] ✓ IncidentLogs: 1 (tentativa de exposição bloqueada)')
}
