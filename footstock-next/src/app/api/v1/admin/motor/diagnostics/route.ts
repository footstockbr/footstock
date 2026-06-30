import { NextResponse } from 'next/server'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { getRedisClient } from '@/lib/redis'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

type HypothesisStatus = 'likely' | 'possible' | 'rejected' | 'blocked'

function safeJson<T>(raw: string | null): T | null {
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function classify(status: HypothesisStatus, evidence: string[], rejection: string[] = []) {
  return { status, evidence, rejection }
}

export async function GET() {
  const auth = await getAuthUser()
  if (!auth) {
    return NextResponse.json(
      { success: false, error: { code: 'AUTH-010', message: 'Sessão inválida.' } },
      { status: 401 },
    )
  }

  if (!hasAdminRole(auth.user.adminRole, 'MONITOR')) {
    return NextResponse.json(
      { success: false, error: { code: 'ADMIN-050', message: 'Permissão insuficiente.' } },
      { status: 403 },
    )
  }

  const redis = getRedisClient()
  const webSha = process.env.RAILWAY_GIT_COMMIT_SHA
    ?? process.env.VERCEL_GIT_COMMIT_SHA
    ?? process.env.GIT_SHA
    ?? null
  const expectedFixSha = process.env.MOTOR_TOGGLE_FIX_SHA ?? null

  try {
    const [
      layersRaw,
      globalHaltRaw,
      commandRaw,
      motorStatus,
      motorLastTick,
      motorSha,
      haltAllCount,
      circuitBreakerCount,
      totalHalted,
      latestGlobalAudit,
      assets,
    ] = await Promise.all([
      redis?.get('motor:layers:config:v1') ?? Promise.resolve(null),
      redis?.get('motor:global-halt') ?? Promise.resolve(null),
      redis?.get('motor:control:last-command') ?? Promise.resolve(null),
      redis?.get('motor:status') ?? Promise.resolve(null),
      redis?.get('motor:last_tick') ?? Promise.resolve(null),
      redis?.get('motor:git_sha') ?? Promise.resolve(null),
      prisma.asset.count({ where: { isHalted: true, haltReason: 'HALT_ALL' } }),
      prisma.asset.count({ where: { isHalted: true, haltReason: 'CIRCUIT_BREAKER' } }),
      prisma.asset.count({ where: { isHalted: true } }),
      prisma.adminMarketAction.findFirst({
        where: { assetId: null, action: { in: ['HALT_ALL', 'RESUME_ALL'] } },
        orderBy: { createdAt: 'desc' },
        select: { action: true, createdAt: true, details: true },
      }),
      prisma.asset.findMany({
        orderBy: { ticker: 'asc' },
        take: 5,
        select: { ticker: true, currentPrice: true, isHalted: true, haltReason: true, updatedAt: true },
      }),
    ])

    const layers = safeJson<{ layerToggles?: Record<string, boolean>; updatedAt?: string; updatedBy?: string }>(layersRaw)
    const globalHalt = safeJson<{ haltedAt?: string; haltedBy?: string }>(globalHaltRaw)
    const command = safeJson<{ type?: string; state?: string; applied?: boolean; commandId?: string }>(commandRaw)
    const l1l7 = ['ou', 'fundamentalReversion', 'garch', 'ofi', 'kylesLambda', 'supplyScaling', 'pressureQueue']
    const allMainLayersOff = !!layers?.layerToggles && l1l7.every((key) => layers.layerToggles?.[key] === false)
    const hasAppliedHaltAll = command?.type === 'HALT_ALL' && command.state === 'applied' && command.applied === true
    const latestAuditAction = latestGlobalAudit?.action ?? null
    const versionMismatch =
      expectedFixSha !== null &&
      ((webSha !== null && webSha !== expectedFixSha) || (motorSha !== null && motorSha !== expectedFixSha))

    const hypotheses = {
      A_semantica_operacional: classify(
        !globalHalt && !hasAppliedHaltAll ? 'possible' : 'rejected',
        [
          `global-halt=${globalHalt ? 'halted' : 'running'}`,
          `ultimo_comando=${command?.type ?? 'none'}:${command?.state ?? 'none'}`,
        ],
        globalHalt || hasAppliedHaltAll ? ['Existe sinal operacional de pausa; semântica isolada não explica tudo.'] : [],
      ),
      B_falso_positivo_web: classify(
        latestAuditAction === 'HALT_ALL' && !hasAppliedHaltAll && haltAllCount === 0 ? 'likely' : 'possible',
        [
          `ultima_auditoria_global=${latestAuditAction ?? 'none'}`,
          `ultimo_status_comando=${command?.state ?? 'missing'}`,
          `db_halt_all=${haltAllCount}`,
        ],
      ),
      C_deploy_divergente: classify(
        versionMismatch ? 'likely' : webSha && motorSha ? 'rejected' : 'blocked',
        [
          `web_sha=${webSha ?? 'missing'}`,
          `motor_sha=${motorSha ?? 'missing'}`,
          `expected_fix_sha=${expectedFixSha ?? 'not_configured'}`,
        ],
        versionMismatch ? [] : ['Sem MOTOR_TOGGLE_FIX_SHA ou sem motor:git_sha, a rota não prova divergência de deploy.'],
      ),
      D_toggles_nao_consumidos: classify(
        layers?.layerToggles && motorStatus !== 'ONLINE' ? 'possible' : 'rejected',
        [
          `layers_source=${layers ? 'redis' : 'defaults_or_missing'}`,
          `layers_updated_at=${layers?.updatedAt ?? 'missing'}`,
          `motor_status=${motorStatus ?? 'missing'}`,
        ],
      ),
      E_fonte_residual_legitima: classify(
        allMainLayersOff && !hasAppliedHaltAll ? 'possible' : 'rejected',
        [
          `all_l1_l7_off=${allMainLayersOff}`,
          `halt_all_applied=${hasAppliedHaltAll}`,
          'Fontes residuais esperadas: L7_5_Nudge, L7_9_AgentImpact, L10_Correlation, ajuste admin.',
        ],
      ),
    }

    const evidenceMissing = [
      !redis ? 'redis_unavailable' : null,
      !motorSha ? 'motor_version_missing' : null,
      !command ? 'motor_command_ack_missing' : null,
      motorLastTick ? null : 'motor_last_tick_missing',
    ].filter(Boolean)

    return NextResponse.json({
      success: true,
      data: {
        mode: 'read-only',
        conclusion: evidenceMissing.length > 0 ? 'blocked por falta de evidencia operacional minima' : 'diagnostico coletado',
        rejectionGuards: [
          'prints de UI nao sao evidencia final',
          'GET /global-halt isolado nao prova freeze de preco',
          "adminMarketAction.action='HALT_ALL' isolado nao prova consumo pelo motor",
        ],
        versions: { webSha, motorSha, expectedFixSha },
        snapshots: {
          layers: layers
            ? { layerToggles: layers.layerToggles ?? null, updatedAt: layers.updatedAt ?? null, updatedBy: layers.updatedBy ?? null }
            : null,
          globalHalt: globalHalt ? { status: 'halted', haltedAt: globalHalt.haltedAt ?? null, haltedBy: globalHalt.haltedBy ?? null } : { status: 'running' },
          command,
          motor: { status: motorStatus ?? 'unknown', lastTick: motorLastTick ?? null },
          db: { haltAllCount, circuitBreakerCount, totalHalted },
          samplePrices: assets.map((asset) => ({
            ticker: asset.ticker,
            currentPrice: Number(asset.currentPrice),
            isHalted: asset.isHalted,
            haltReason: asset.haltReason,
            updatedAt: asset.updatedAt.toISOString(),
          })),
        },
        hypotheses,
        evidenceMissing,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro desconhecido'
    console.error('[motor/diagnostics] read-only collection failed:', message)
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'DIAG_001',
          message: 'Diagnóstico bloqueado por falha de coleta read-only.',
        },
      },
      { status: 500 },
    )
  }
}
