// ============================================================================
// FootStock — Admin: Global Halt do Motor de Negociações
// POST   /api/v1/admin/motor/global-halt → bloqueia novas ordens/read-only
// DELETE /api/v1/admin/motor/global-halt → remove bloqueio read-only
// GET    /api/v1/admin/motor/global-halt → status do halt
// Recurso: motor:control — disponível para SUPER_ADMIN e ADMINISTRADOR
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withAdmin, type AuthContext } from '@/app/api/middleware'
import { redisPublisher as redis } from '@/lib/redis'

const GLOBAL_HALT_KEY = 'motor:global-halt'

/** POST /api/v1/admin/motor/global-halt — Bloqueio read-only de novas ordens */
async function haltHandler(req: NextRequest, { user }: AuthContext): Promise<NextResponse> {
  const timestamp = new Date().toISOString()
  await redis.set(GLOBAL_HALT_KEY, JSON.stringify({ haltedAt: timestamp, haltedBy: user.id }))

  return NextResponse.json({
    success: true,
    data: {
      status: 'halted',
      haltedAt: timestamp,
      mode: 'read-only',
      message: 'Novas ordens bloqueadas em modo read-only. Freeze de preço exige HALT_ALL aplicado pelo serviço motor.',
    },
  })
}

/** DELETE /api/v1/admin/motor/global-halt — Remove bloqueio read-only */
async function resumeHandler(_req: NextRequest, _ctx: AuthContext): Promise<NextResponse> {
  await redis.del(GLOBAL_HALT_KEY)

  return NextResponse.json({
    success: true,
    data: {
      status: 'running',
      resumedAt: new Date().toISOString(),
      mode: 'read-write',
      message: 'Bloqueio read-only removido. Retomada de preço depende de RESUME_ALL aplicado pelo serviço motor.',
    },
  })
}

/** GET /api/v1/admin/motor/global-halt — Status do halt */
async function statusHandler(_req: NextRequest, _ctx: AuthContext): Promise<NextResponse> {
  const haltData = await redis.get(GLOBAL_HALT_KEY)
  const isHalted = !!haltData

  return NextResponse.json({
    success: true,
    data: {
      status: isHalted ? 'halted' : 'running',
      halt: isHalted ? JSON.parse(haltData!) : null,
      mode: isHalted ? 'read-only' : 'read-write',
      message: isHalted
        ? 'Global halt está bloqueando novas ordens; isto não prova freeze de preço sem HALT_ALL aplicado.'
        : 'Global halt ausente; novas ordens não estão bloqueadas por esta flag.',
    },
  })
}

export const POST = withAdmin('motor:control')(haltHandler)
export const DELETE = withAdmin('motor:control')(resumeHandler)
export const GET = withAdmin('motor:control')(statusHandler)
