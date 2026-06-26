// ============================================================================
// FootStock — Admin: Motor Layer Configuration
// GET   /api/v1/admin/motor/layers → retorna config atual (motor:read)
// PATCH /api/v1/admin/motor/layers → atualiza config (motor:control)
// Persiste em Redis key motor:layers:config:v1
// Fallback to hardcoded defaults se não encontrado no Redis
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAdmin, type AuthContext } from '@/app/api/middleware'
import { redisPublisher as redis } from '@/lib/redis'
import { MOTOR_LAYERS_DEFAULTS } from '@/lib/constants/motor-layers'
import type { MotorLayersConfig } from '@/lib/types/admin'

const REDIS_KEY = 'motor:layers:config:v1'

// ─── Zod Schema ───────────────────────────────────────────────────────────────

const ouClusterSchema = z.object({
  sigma:       z.number().min(0.0001).max(0.02),
  theta:       z.number().min(0.01).max(1.0),
  spread_base: z.number().min(0.0001).max(0.05),
})

const ofiClusterSchema = z.object({
  rho: z.number().min(0.5).max(0.9999),
})

const sessionSchema = z.object({
  vol_multiplier: z.number().min(0).max(5.0),
})

const layersSchema = z.object({
  ou: z.object({
    clusters: z.object({
      A_TOP:    ouClusterSchema,
      A_MID:    ouClusterSchema,
      A_SMALL:  ouClusterSchema,
      B_LIQUID: ouClusterSchema,
      B_ILLIQ:  ouClusterSchema,
    }),
  }),
  fundamentalReversion: z.object({
    reversion_rate: z.number().min(0.0001).max(0.05),
  }),
  garch: z.object({
    omega:   z.number().min(0.0000001).max(0.0001),
    alpha:   z.number().min(0.01).max(0.50),
    beta:    z.number().min(0.01).max(0.99),
    vol_cap: z.number().min(1.0).max(5.0),
  }).refine((g) => g.alpha + g.beta < 1.0, {
    message: 'GARCH: alpha + beta deve ser < 1 para garantir estacionariedade',
  }),
  ofi: z.object({
    clusters: z.object({
      A_TOP:    ofiClusterSchema,
      A_MID:    ofiClusterSchema,
      A_SMALL:  ofiClusterSchema,
      B_LIQUID: ofiClusterSchema,
      B_ILLIQ:  ofiClusterSchema,
    }),
  }),
  kylesLambda: z.object({
    lambda_scale: z.number().min(0.1).max(5.0),
  }),
  supplyScaling: z.object({
    amp_cap: z.number().min(1.0).max(5.0),
  }),
  pressureQueue: z.object({
    pressure_spread_ticks: z.number().int().min(1).max(100),
    absorption_ticks:      z.number().int().min(5).max(200),
    spot_cap:              z.number().min(0.001).max(0.10),
  }),
  velocityCap: z.object({
    max_per_tick: z.number().min(0.0001).max(0.05),
  }),
  circuitBreaker: z.object({
    // enabled: liga/desliga o halt automatico do motor. Opcional com default true para
    // que blobs legados (gravados antes deste campo) continuem fazendo parse sem perder
    // as demais customizacoes.
    enabled:         z.boolean().default(true),
    halt_trigger:    z.number().min(0.01).max(0.50),
    halt_duration_s: z.number().int().min(10).max(3600),
  }),
  sessionManagement: z.object({
    sessions: z.object({
      PRE_OPENING:  sessionSchema,
      TRADING:      sessionSchema,
      CLOSING_CALL: sessionSchema,
      AFTER_MARKET: sessionSchema,
      CLOSED:       sessionSchema,
    }),
  }),
  // Toggle por camada. `.default(true)` em cada campo + `.default({})` no objeto torna o
  // bloco inteiro opcional: blobs legados (sem layerToggles) fazem parse com tudo ligado.
  layerToggles: z
    .object({
      ou:                   z.boolean().default(true),
      fundamentalReversion: z.boolean().default(true),
      garch:                z.boolean().default(true),
      ofi:                  z.boolean().default(true),
      kylesLambda:          z.boolean().default(true),
      supplyScaling:        z.boolean().default(true),
      pressureQueue:        z.boolean().default(true),
      velocityCap:          z.boolean().default(true),
      sessionManagement:    z.boolean().default(true),
    })
    .default({
      ou: true,
      fundamentalReversion: true,
      garch: true,
      ofi: true,
      kylesLambda: true,
      supplyScaling: true,
      pressureQueue: true,
      velocityCap: true,
      sessionManagement: true,
    }),
})

// ─── Redis helpers ────────────────────────────────────────────────────────────

async function getStoredConfig(): Promise<MotorLayersConfig | null> {
  try {
    const raw = await redis.get(REDIS_KEY)
    if (!raw) return null
    const json = JSON.parse(raw)
    const parsed = layersSchema.safeParse(json)
    if (!parsed.success) return null
    return {
      ...parsed.data,
      updatedAt: json.updatedAt ?? null,
      updatedBy: json.updatedBy ?? null,
    }
  } catch {
    return null
  }
}

// ─── GET /api/v1/admin/motor/layers ──────────────────────────────────────────

async function getHandler(_req: NextRequest, _ctx: AuthContext): Promise<NextResponse> {
  try {
    const stored = await getStoredConfig()
    const config: MotorLayersConfig = stored ?? {
      ...MOTOR_LAYERS_DEFAULTS,
      updatedAt: null,
      updatedBy: null,
    }
    return NextResponse.json({ success: true, data: config })
  } catch (err) {
    console.error('[motor/layers][GET] error:', err)
    return NextResponse.json(
      { success: false, error: { code: 'SYS_001', message: 'Erro ao carregar config de camadas' } },
      { status: 500 }
    )
  }
}

// ─── PATCH /api/v1/admin/motor/layers ────────────────────────────────────────

async function patchHandler(req: NextRequest, { user }: AuthContext): Promise<NextResponse> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'VAL_001', message: 'JSON inválido' } },
      { status: 400 }
    )
  }

  const parsed = layersSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'VAL_001',
          message: parsed.error.issues[0]?.message ?? 'Payload inválido',
          details: parsed.error.flatten(),
        },
      },
      { status: 422 }
    )
  }

  try {
    // O editor de Camadas tem agora o toggle por camada (inclui o card do circuit breaker, que
    // escreve circuitBreaker.enabled). Portanto salvamos o blob como veio (sem preservar enabled).
    // O toggle do KPI (/api/v1/admin/motor/circuit-breaker) continua sendo um atalho que faz
    // read-merge-write do mesmo campo; entre os dois vale last-writer-wins (ambos são controles
    // de admin). O editor seeda do servidor ao abrir, então normalmente reflete o estado atual.
    const toStore: MotorLayersConfig = {
      ...parsed.data,
      updatedAt: new Date().toISOString(),
      updatedBy: user.id,
    }
    await redis.set(REDIS_KEY, JSON.stringify(toStore))

    return NextResponse.json({ success: true, data: toStore })
  } catch (err) {
    console.error('[motor/layers][PATCH] error:', err)
    return NextResponse.json(
      { success: false, error: { code: 'SYS_001', message: 'Erro ao salvar config de camadas' } },
      { status: 500 }
    )
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export const GET   = withAdmin('motor:read')(getHandler)
export const PATCH = withAdmin('motor:control')(patchHandler)
