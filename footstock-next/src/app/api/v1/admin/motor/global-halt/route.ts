// ============================================================================
// FootStock — Admin: Global Halt do Motor de Negociações
// POST   /api/v1/admin/motor/global-halt → pausa motor inteiro
// DELETE /api/v1/admin/motor/global-halt → retoma motor
// GET    /api/v1/admin/motor/global-halt → status do halt
// Recurso: motor:control — disponível para SUPER_ADMIN e ADMINISTRADOR
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { withAdmin, type AuthContext } from '@/app/api/middleware'
import { redisPublisher as redis } from '@/lib/redis'

const GLOBAL_HALT_KEY = 'motor:global-halt'

/** POST /api/v1/admin/motor/global-halt — Pausar motor inteiro */
async function haltHandler(req: NextRequest, { user }: AuthContext): Promise<NextResponse> {
  const timestamp = new Date().toISOString()
  await redis.set(GLOBAL_HALT_KEY, JSON.stringify({ haltedAt: timestamp, haltedBy: user.id }))

  return NextResponse.json({
    success: true,
    data: {
      status: 'halted',
      haltedAt: timestamp,
      message: 'Motor pausado. Todos os ativos suspensos.',
    },
  })
}

/** DELETE /api/v1/admin/motor/global-halt — Retomar motor */
async function resumeHandler(_req: NextRequest, _ctx: AuthContext): Promise<NextResponse> {
  await redis.del(GLOBAL_HALT_KEY)

  return NextResponse.json({
    success: true,
    data: {
      status: 'running',
      resumedAt: new Date().toISOString(),
      message: 'Motor retomado. Negociação reativada.',
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
    },
  })
}

export const POST = withAdmin('motor:control')(haltHandler)
export const DELETE = withAdmin('motor:control')(resumeHandler)
export const GET = withAdmin('motor:control')(statusHandler)
