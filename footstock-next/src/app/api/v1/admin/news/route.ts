import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import { resolveTickerFromText } from '@/lib/utils/resolve-ticker'
import type { User, AdminRole } from '@/types'

const createSchema = z.object({
  title: z.string().min(5, 'Titulo deve ter pelo menos 5 caracteres').max(255),
  content: z.string().min(10, 'Conteudo deve ter pelo menos 10 caracteres').max(4000),
  impact: z.enum(['FINANCEIRA_CRITICA', 'ESPORTIVA_MAJORITARIA', 'MERCADO_ATIVOS', 'INTEGRIDADE_SAUDE', 'INSTITUCIONAL', 'ESPORTIVA_MENOR']),
  sentiment: z.enum(['BULLISH', 'BEARISH', 'NEUTRAL']),
  ticker: z.string().max(5).optional().default(''),
  source: z.string().max(255).nullable().optional(),
  isPublished: z.boolean().optional().default(false),
})

const VALID_ADMIN_ROLES = ['SUPER_ADMIN', 'ADMINISTRADOR', 'MODERADOR', 'EDITOR', 'MONITOR', 'CLUB_PARTNER']

function getDevAuthFromCookie(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') return null
  const adminRole = request.cookies.get('fs-admin-role')?.value
  if (!adminRole) return null
  if (!VALID_ADMIN_ROLES.includes(adminRole)) return null
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
    version: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  return { user: dummyUser, supabaseId: 'dev-user' }
}

export async function GET(request: NextRequest) {
  let auth = await getAuthUser()
  if (!auth) auth = getDevAuthFromCookie(request)

  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'EDITOR')) {
    return NextResponse.json(
      { error: { code: 'ADMIN-051', message: 'Permissão insuficiente para gerenciar notícias.' } },
      { status: 403 }
    )
  }

  try {
    const news = await prisma.news.findMany({
      orderBy: { publishedAt: { sort: 'desc', nulls: 'last' } },
      take: 100,
    })

    return ok(news)
  } catch (error) {
    console.error('[news] Error:', error)
    return errors.server()
  }
}

export async function POST(request: NextRequest) {
  let auth = await getAuthUser()
  if (!auth) auth = getDevAuthFromCookie(request)

  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'EDITOR')) {
    return NextResponse.json(
      { error: { code: 'ADMIN-051', message: 'Permissão insuficiente.' } },
      { status: 403 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errors.validation('JSON invalido.')
  }

  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return errors.validation('Dados invalidos. Verifique titulo (min 5), conteudo (min 10), impacto e sentimento.')
  }

  try {
    const { title, content, impact, sentiment, ticker, source, isPublished } = parsed.data

    // Auto-detect ticker from title+content when not explicitly provided
    let resolvedTicker = ticker || null
    if (!resolvedTicker && (title || content)) {
      resolvedTicker = await resolveTickerFromText(`${title} ${content}`)
    }

    const news = await prisma.news.create({
      data: {
        title,
        content,
        impact,
        sentiment,
        ticker: resolvedTicker,
        assetIds: [],
        source: source || null,
        isPublished,
        publishedAt: isPublished ? new Date() : null,
        author: auth.user.name,
      },
    })

    return ok(news, 201)
  } catch (error) {
    console.error('[news] Error:', error)
    return errors.server()
  }
}
