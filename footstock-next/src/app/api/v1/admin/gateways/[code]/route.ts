import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { redisPublisher } from '@/lib/redis'
import type { User, AdminRole } from '@/types'

const REDIS_KEY = 'admin:gateway:config:v1'

async function getStoredConfig() {
  const raw = await redisPublisher.get(REDIS_KEY)
  if (!raw) return null

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return null
  }

  const schema = z.object({
    gateways: z.array(
      z.object({
        code: z.string(),
        active: z.boolean(),
      })
    ),
  })

  const parsed = schema.safeParse(json)
  return parsed.success ? parsed.data : null
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code: paramCode } = await params

  let auth = await getAuthUser()

  if (!auth && process.env.NODE_ENV === 'development') {
    const adminRole = request.cookies.get('fs-admin-role')?.value
    if (adminRole) {
      const dummyUser: User = {
        id: 'dev-user',
        email: 'dev@foot-stock.test',
        name: 'Dev User',
        phone: null,
        birthDate: '',
        favoriteClub: '',
        favoriteClubDisplayName: null,
        userType: 'NORMAL',
        investorProfile: 'INICIANTE',
        planType: 'JOGADOR',
        fsBalance: 0,
        marginBlocked: 0,
        tourCompleted: false,
        ageVerificationPending: false,
        adminRole: adminRole as AdminRole,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      auth = { user: dummyUser, supabaseId: 'dev-user' }
    }
  }

  if (!auth) {
    return NextResponse.json(
      { success: false, error: { code: 'AUTH_010', message: 'Sessão inválida' } },
      { status: 401 }
    )
  }

  if (!hasAdminRole(auth.user.adminRole, 'ADMINISTRADOR')) {
    return NextResponse.json(
      { success: false, error: { code: 'AUTH_009', message: 'Acesso negado' } },
      { status: 403 }
    )
  }

  try {
    let body: Record<string, unknown> = {}
    try {
      body = await request.json()
    } catch {
      // Sem body é ok
    }

    const code = paramCode.toUpperCase()
    const action = body.action || 'toggle'
    const active = body.active !== undefined ? (body.active as boolean) : null

    const config = await getStoredConfig()
    if (!config || !config.gateways) {
      return NextResponse.json(
        { success: false, error: { code: 'VAL_001', message: 'Configuração não encontrada' } },
        { status: 400 }
      )
    }

    const gatewayIndex = config.gateways.findIndex(g => g.code === code)
    if (gatewayIndex === -1) {
      return NextResponse.json(
        { success: false, error: { code: 'VAL_001', message: 'Gateway não encontrado' } },
        { status: 404 }
      )
    }

    if (action === 'toggle') {
      config.gateways[gatewayIndex].active = !config.gateways[gatewayIndex].active
    } else if (action === 'enable') {
      config.gateways[gatewayIndex].active = true
    } else if (action === 'disable') {
      config.gateways[gatewayIndex].active = false
    } else if (active !== null) {
      config.gateways[gatewayIndex].active = active
    }

    await redisPublisher.set(REDIS_KEY, JSON.stringify(config))

    return NextResponse.json({
      success: true,
      data: {
        code,
        active: config.gateways[gatewayIndex].active,
        message: config.gateways[gatewayIndex].active ? 'Gateway ativado' : 'Gateway desativado',
      },
    })
  } catch (error) {
    console.error('[admin/gateways/[code]][PATCH] error:', error)
    return NextResponse.json(
      { success: false, error: { code: 'SYS_001', message: 'Erro ao atualizar gateway' } },
      { status: 500 }
    )
  }
}
