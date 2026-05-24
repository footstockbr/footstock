import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getAuthUser, hasAdminRole } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ok, errors } from '@/lib/api'
import type { User, AdminRole } from '@/types'

const patchSchema = z
  .object({
    title: z.string().min(5).max(255).optional(),
    content: z.string().min(10).max(4000).optional(),
    impact: z.enum(['FINANCEIRA_CRITICA', 'ESPORTIVA_MAJORITARIA', 'MERCADO_ATIVOS', 'INTEGRIDADE_SAUDE', 'INSTITUCIONAL', 'ESPORTIVA_MENOR']).optional(),
    sentiment: z.enum(['BULLISH', 'BEARISH', 'NEUTRAL']).optional(),
    ticker: z.string().max(5).optional(),
    isPublished: z.boolean().optional(),
    isArchived: z.boolean().optional(),
  })
  .refine(
    data => Object.values(data).some(v => v !== undefined),
    { message: 'Nenhum campo para atualizar.' }
  )

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

interface NewsParams {
  params: Promise<{ id: string }>
}

export async function PATCH(request: NextRequest, { params }: NewsParams) {
  const { id } = await params
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

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return errors.validation('Dados invalidos.')
  }

  try {
    const { title, content, impact, sentiment, ticker, isPublished, isArchived } = parsed.data

    // Enforce immutability: external-source news cannot have title/content edited
    if (title !== undefined || content !== undefined) {
      const existing = await prisma.news.findUnique({
        where: { id },
        select: { source: true },
      })
      if (!existing) {
        return NextResponse.json(
          { error: { code: 'NEWS-001', message: 'Noticia nao encontrada' } },
          { status: 404 }
        )
      }
      if (existing.source) {
        return NextResponse.json(
          { error: { code: 'NEWS-002', message: 'Noticias de fontes externas nao podem ter titulo ou conteudo editado.' } },
          { status: 403 }
        )
      }
    }

    const updateData: Record<string, unknown> = {}
    if (title !== undefined) updateData.title = title
    if (content !== undefined) updateData.content = content
    if (impact !== undefined) updateData.impact = impact
    if (sentiment !== undefined) updateData.sentiment = sentiment
    if (ticker !== undefined) {
      updateData.ticker = ticker || null
      // ADR Opcao A (blacksmith/adr/adr-news-ticker-assetids-sync.md): manter ticker e assetIds sincronizados em updates
      if (ticker) {
        const asset = await prisma.asset.findUnique({
          where: { ticker },
          select: { id: true },
        })
        updateData.assetIds = asset ? [asset.id] : []
      } else {
        updateData.assetIds = []
      }
    }
    if (isArchived !== undefined) {
      updateData.isArchived = isArchived
      if (isArchived) updateData.archivedAt = new Date()
    }
    if (isPublished !== undefined) {
      updateData.isPublished = isPublished
      if (isPublished && !updateData.publishedAt) {
        updateData.publishedAt = new Date()
      }
    }

    const news = await prisma.news.update({
      where: { id },
      data: updateData,
    })

    return ok(news)
  } catch (error) {
    if ((error as { code?: string }).code === 'P2025') {
      return NextResponse.json(
        { error: { code: 'NEWS-001', message: 'Notícia não encontrada' } },
        { status: 404 }
      )
    }
    console.error('[news] Error:', error)
    return errors.server()
  }
}

export async function DELETE(request: NextRequest, { params }: NewsParams) {
  const { id } = await params
  let auth = await getAuthUser()
  if (!auth) auth = getDevAuthFromCookie(request)

  if (!auth) return errors.unauthorized()
  if (!hasAdminRole(auth.user.adminRole, 'SUPER_ADMIN')) {
    return NextResponse.json(
      { error: { code: 'ADMIN-051', message: 'Apenas super admin pode deletar notícias.' } },
      { status: 403 }
    )
  }

  try {
    await prisma.news.delete({
      where: { id },
    })

    return ok({ message: 'Notícia deletada com sucesso' })
  } catch (error) {
    if ((error as { code?: string }).code === 'P2025') {
      return NextResponse.json(
        { error: { code: 'NEWS-001', message: 'Notícia não encontrada' } },
        { status: 404 }
      )
    }
    console.error('[news] Error:', error)
    return errors.server()
  }
}
