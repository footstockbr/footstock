import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { redisPublisher } from '@/lib/redis'
import { env } from '@/lib/env'
import { adminAuditService } from '@/lib/services/shared'
import type { User, AdminRole } from '@/types'

const REDIS_KEY = 'admin:gateway:config:v1'

const settlementSchema = z.enum(['D+30', 'D+15', 'D+2', 'D+1', 'D+0'])

const gatewaySchema = z.object({
  code: z.enum(['MERCADO_PAGO', 'PAGSEGURO', 'PAYPAL']),
  name: z.string().min(2).max(40),
  icon: z.string().min(1).max(40),
  color: z.string().regex(/^#([A-Fa-f0-9]{6})$/, 'Cor deve estar no formato #RRGGBB'),
  active: z.boolean(),
  splitPercent: z.number().min(0).max(100),
  creditFeePercent: z.number().min(0).max(100),
  creditSettlement: settlementSchema,
  debitFeePercent: z.number().min(0).max(100),
  debitSettlement: settlementSchema,
  pixFeePercent: z.number().min(0).max(100),
  pixSettlement: settlementSchema,
  webhookEndpoint: z.string().url('Webhook endpoint invalido').optional().or(z.literal('')),
  webhookApiKey: z.string().max(256).optional().or(z.literal('')),
  webhookSecret: z.string().max(256).optional().or(z.literal('')),
})

const payloadSchema = z.object({
  gateways: z.array(gatewaySchema).length(3),
})

type GatewayConfig = z.infer<typeof gatewaySchema>

function maskSecret(secret?: string): string | null {
  if (!secret) return null
  if (secret.length <= 6) return '***'
  return `${secret.slice(0, 3)}***${secret.slice(-3)}`
}

function buildDefaultConfig(): GatewayConfig[] {
  return [
    {
      code: 'MERCADO_PAGO',
      name: 'Mercado Pago',
      icon: 'wallet',
      color: '#00B1EA',
      active: true,
      splitPercent: 100,
      creditFeePercent: 4.99,
      creditSettlement: 'D+30',
      debitFeePercent: 2.99,
      debitSettlement: 'D+1',
      pixFeePercent: 0.99,
      pixSettlement: 'D+0',
      webhookEndpoint: '',
      webhookApiKey: env.MERCADO_PAGO_ACCESS_TOKEN,
      webhookSecret: env.MERCADO_PAGO_WEBHOOK_SECRET,
    },
    {
      code: 'PAGSEGURO',
      name: 'PagSeguro',
      icon: 'credit-card',
      color: '#FFD400',
      active: true,
      splitPercent: 0,
      creditFeePercent: 5.49,
      creditSettlement: 'D+30',
      debitFeePercent: 2.89,
      debitSettlement: 'D+1',
      pixFeePercent: 1.19,
      pixSettlement: 'D+0',
      webhookEndpoint: '',
      webhookApiKey: env.PAGSEGURO_TOKEN,
      webhookSecret: env.PAGSEGURO_WEBHOOK_SECRET,
    },
    {
      code: 'PAYPAL',
      name: 'PayPal',
      icon: 'paypal',
      color: '#0070BA',
      active: true,
      splitPercent: 0,
      creditFeePercent: 6.49,
      creditSettlement: 'D+30',
      debitFeePercent: 3.49,
      debitSettlement: 'D+1',
      pixFeePercent: 0,
      pixSettlement: 'D+0',
      webhookEndpoint: '',
      webhookApiKey: env.PAYPAL_CLIENT_ID,
      webhookSecret: env.PAYPAL_WEBHOOK_ID,
    },
  ]
}

function sanitizeForResponse(gateways: GatewayConfig[]) {
  return gateways.map((gateway) => ({
    ...gateway,
    webhookApiKey: maskSecret(gateway.webhookApiKey),
    webhookSecret: maskSecret(gateway.webhookSecret),
  }))
}

async function getStoredConfig(): Promise<GatewayConfig[] | null> {
  const raw = await redisPublisher.get(REDIS_KEY)
  if (!raw) return null

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return null
  }

  const parsed = payloadSchema.safeParse(json)
  if (!parsed.success) return null

  return parsed.data.gateways
}

async function getHandler(req: NextRequest) {
  let auth = await getAuthUser()

  // Dev mode fallback: accept fs-admin-role cookie
  if (!auth && process.env.NODE_ENV === 'development') {
    const adminRole = req.cookies.get('fs-admin-role')?.value
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
        adminRole: adminRole as AdminRole,
        version: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      auth = { user: dummyUser, userId: 'dev-user' }
    }
  }

  if (!auth) {
    return NextResponse.json(
      { success: false, error: { code: 'AUTH-010', message: 'Sessão inválida' } },
      { status: 401 }
    )
  }

  if (!hasAdminRole(auth.user.adminRole, 'ADMINISTRADOR')) {
    return NextResponse.json(
      { success: false, error: { code: 'AUTH-009', message: 'Acesso negado' } },
      { status: 403 }
    )
  }

  try {
    const defaults = buildDefaultConfig()
    const stored = await getStoredConfig()
    const responseData = sanitizeForResponse(stored ?? defaults)

    return NextResponse.json({ success: true, data: { gateways: responseData } })
  } catch (error) {
    console.error('[admin/gateways/config][GET] error:', error)
    return NextResponse.json(
      { success: false, error: { code: 'SYS_001', message: 'Erro interno ao carregar configuração de gateways' } },
      { status: 500 }
    )
  }
}

async function patchHandler(req: NextRequest) {
  let auth = await getAuthUser()

  // Dev mode fallback: accept fs-admin-role cookie
  if (!auth && process.env.NODE_ENV === 'development') {
    const adminRole = req.cookies.get('fs-admin-role')?.value
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
        adminRole: adminRole as AdminRole,
        version: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      auth = { user: dummyUser, userId: 'dev-user' }
    }
  }

  if (!auth) {
    return NextResponse.json(
      { success: false, error: { code: 'AUTH-010', message: 'Sessão inválida' } },
      { status: 401 }
    )
  }

  // PATCH de configuração de gateway é exclusivo SUPER_ADMIN (re-auth feita no frontend)
  if (auth.user.adminRole !== 'SUPER_ADMIN') {
    return NextResponse.json(
      { success: false, error: { code: 'AUTH-009', message: 'Apenas SUPER_ADMIN pode alterar configuração de gateways' } },
      { status: 403 }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { success: false, error: { code: 'VAL_001', message: 'JSON invalido' } },
      { status: 400 }
    )
  }

  const parsed = payloadSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: 'VAL_001', message: 'Payload invalido', details: parsed.error.flatten() } },
      { status: 422 }
    )
  }

  const uniqueCodes = new Set(parsed.data.gateways.map((gateway) => gateway.code))
  if (uniqueCodes.size !== 3) {
    return NextResponse.json(
      { success: false, error: { code: 'VAL_001', message: 'Cada gateway deve aparecer exatamente uma vez' } },
      { status: 422 }
    )
  }

  try {
    const current = (await getStoredConfig()) ?? buildDefaultConfig()
    const currentByCode = new Map(current.map((gateway) => [gateway.code, gateway]))

    const mergedGateways = parsed.data.gateways.map((incoming) => {
      const previous = currentByCode.get(incoming.code)

      const keepApiKey =
        !incoming.webhookApiKey || incoming.webhookApiKey.includes('***')
      const keepSecret =
        !incoming.webhookSecret || incoming.webhookSecret.includes('***')

      return {
        ...incoming,
        webhookApiKey: keepApiKey ? previous?.webhookApiKey : incoming.webhookApiKey,
        webhookSecret: keepSecret ? previous?.webhookSecret : incoming.webhookSecret,
      }
    })

    await redisPublisher.set(REDIS_KEY, JSON.stringify({ gateways: mergedGateways }))

    // Auditoria: registra ação de config de gateway (audit trail obrigatório — spec §Configurações)
    await adminAuditService.log({
      adminId: auth.user.id,
      action: 'CONFIG_GATEWAY_EDIT',
      details: {
        gatewayCodes: mergedGateways.map((g) => g.code),
        activeCodes: mergedGateways.filter((g) => g.active).map((g) => g.code),
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        gateways: sanitizeForResponse(mergedGateways),
        updatedBy: auth.user.id,
        updatedAt: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error('[admin/gateways/config][PATCH] error:', error)
    return NextResponse.json(
      { success: false, error: { code: 'SYS_001', message: 'Erro interno ao salvar configuração de gateways' } },
      { status: 500 }
    )
  }
}

export const GET = getHandler
export const PATCH = patchHandler
