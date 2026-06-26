// ============================================================================
// FootStock — Admin: Circuit Breaker do Motor (toggle + limiar)
// GET   /api/v1/admin/motor/circuit-breaker → estado atual (motor:read)
// PATCH /api/v1/admin/motor/circuit-breaker → liga/desliga + ajusta o limiar (motor:control)
// ----------------------------------------------------------------------------
// Atualiza SÓ o subtree circuitBreaker do blob SSoT `motor:layers:config:v1`
// (read-merge-write), preservando as demais camadas. O motor lê esse mesmo blob
// (MotorLayerRuntimeConfig, cache ~10s), então a mudança vale ao vivo (o toggle
// `enabled` exige a versão do motor que o consome; ver L10_CircuitBreaker).
// O limiar é exposto/recebido em PERCENTUAL (8 = 8%); persistido como fração.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAdmin, type AuthContext } from '@/app/api/middleware'
import {
  readCircuitBreakerConfig,
  writeCircuitBreakerConfig,
  CB_TRIGGER_MIN,
  CB_TRIGGER_MAX,
} from '@/lib/motor/circuit-breaker-config'

const PCT_MIN = CB_TRIGGER_MIN * 100 // 1
const PCT_MAX = CB_TRIGGER_MAX * 100 // 50

// Pelo menos um campo precisa estar presente (toggle e/ou limiar).
const patchSchema = z
  .object({
    enabled: z.boolean().optional(),
    thresholdPct: z.number().min(PCT_MIN).max(PCT_MAX).optional(),
  })
  .refine((v) => v.enabled !== undefined || v.thresholdPct !== undefined, {
    message: 'Informe enabled e/ou thresholdPct',
  })

function view(config: { enabled: boolean; halt_trigger: number; halt_duration_s: number }) {
  return {
    enabled: config.enabled,
    thresholdPct: Math.round(config.halt_trigger * 100 * 100) / 100, // 0.08 → 8
    halt_trigger: config.halt_trigger,
    halt_duration_s: config.halt_duration_s,
  }
}

async function getHandler(_req: NextRequest, _ctx: AuthContext): Promise<NextResponse> {
  try {
    const { config, source, updatedAt, updatedBy } = await readCircuitBreakerConfig()
    return NextResponse.json({ success: true, data: { ...view(config), source, updatedAt, updatedBy } })
  } catch (err) {
    console.error('[motor/circuit-breaker][GET] error:', err)
    return NextResponse.json(
      { success: false, error: { code: 'SYS_001', message: 'Erro ao carregar circuit breaker' } },
      { status: 500 }
    )
  }
}

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

  const parsed = patchSchema.safeParse(body)
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
    const next = await writeCircuitBreakerConfig(
      {
        enabled: parsed.data.enabled,
        halt_trigger:
          parsed.data.thresholdPct !== undefined ? parsed.data.thresholdPct / 100 : undefined,
      },
      user.id
    )
    return NextResponse.json({ success: true, data: view(next) })
  } catch (err) {
    console.error('[motor/circuit-breaker][PATCH] error:', err)
    return NextResponse.json(
      { success: false, error: { code: 'SYS_001', message: 'Erro ao salvar circuit breaker' } },
      { status: 500 }
    )
  }
}

export const GET = withAdmin('motor:read')(getHandler)
export const PATCH = withAdmin('motor:control')(patchHandler)
