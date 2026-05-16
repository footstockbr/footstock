// ============================================================================
// FootStock — /api/cron/session-transition (* * * * *)
// Verifica transicao de sessao de mercado a cada minuto.
// Se houve transicao, registra em market_session_log (auditoria).
// Idempotente: se ja esta na sessao correta, nao gera log duplicado.
// Rastreabilidade: T-008 (Sessoes de Mercado)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import type { SessionType } from '@prisma/client'
import { env } from '@/lib/env'
import { prisma } from '@/lib/prisma'
import { getCurrentSession } from '@/lib/services/session-manager'
import { redisPublisher as redis } from '@/lib/redis'

let previousSession: string | null = null

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const expectedSecret = env.CRON_SECRET

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return new NextResponse(null, { status: 401 })
  }

  try {
    const now = new Date()
    const currentSession = getCurrentSession(now)

    // Recuperar sessao anterior do Redis (persiste entre deploys)
    if (previousSession === null) {
      previousSession = await redis.get('market:session:previous') ?? null
    }

    const transitioned = previousSession !== null && previousSession !== currentSession

    if (transitioned && previousSession) {
      // Registrar transicao no banco (timestamp UTC para auditoria)
      await prisma.marketSessionLog.create({
        data: {
          fromSession: previousSession as SessionType,
          toSession: currentSession as SessionType,
          transitionAt: now,
        },
      })
    }

    // Atualizar sessao anterior
    previousSession = currentSession
    await redis.set('market:session:previous', currentSession, 'EX', 86400)

    return NextResponse.json({
      success: true,
      session: currentSession,
      transitioned,
      timestamp: now.toISOString(),
    })
  } catch (err) {
    console.error('[cron/session-transition] Erro:', err)
    return NextResponse.json(
      { error: 'SYS_001', message: 'Erro ao verificar transição de sessão' },
      { status: 500 }
    )
  }
}
