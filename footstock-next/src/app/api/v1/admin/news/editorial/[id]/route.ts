// ============================================================================
// FootStock — /api/v1/admin/news/editorial/[id]
// Atualização e exclusão de notícia editorial no painel admin.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAdmin } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'
import { NEWS_STATUS } from '@/lib/enums'

const patchSchema = z
  .object({
    title: z.string().min(5).max(255).optional(),
    content: z.string().min(10).max(4000).optional(),
    impact: z.enum(['FINANCEIRA_CRITICA', 'ESPORTIVA_MAJORITARIA', 'MERCADO_ATIVOS', 'INTEGRIDADE_SAUDE', 'INSTITUCIONAL', 'ESPORTIVA_MENOR']).optional(),
    sentiment: z.enum(['BULLISH', 'BEARISH', 'NEUTRAL']).optional(),
    ticker: z.string().min(2).max(5).optional(),
    source: z.string().max(255).nullable().optional(),
    status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
  })
  .refine(
    data =>
      Boolean(
        data.title ??
          data.content ??
          data.impact ??
          data.sentiment ??
          data.ticker ??
          data.source ??
          data.status
      ),
    { message: 'Nenhum campo para atualizar.' }
  )

// `existingPublishedAt` é a data já gravada (ou null). Preserva-se a data de
// publicação ORIGINAL: publicar carimba só na primeira vez; arquivar não mexe em
// publishedAt (apenas oculta). Antes, qualquer transição sobrescrevia a data,
// destruindo o histórico de auditoria.
function statusToPersist(
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED',
  existingPublishedAt: Date | null,
) {
  if (status === NEWS_STATUS.PUBLISHED) {
    return { isPublished: true, publishedAt: existingPublishedAt ?? new Date() }
  }
  if (status === NEWS_STATUS.ARCHIVED) {
    return { isPublished: false } // preserva publishedAt original
  }
  return { isPublished: false, publishedAt: null } // DRAFT: volta a rascunho
}

function extractNewsId(req: NextRequest): string {
  const segments = req.nextUrl.pathname.split('/')
  return segments[segments.length - 1] ?? ''
}

async function patchHandler(req: NextRequest) {
  const id = extractNewsId(req)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ success: false, error: 'JSON inválido.' }, { status: 400 })
  }

  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Dados inválidos.' }, { status: 422 })
  }

  const payload = parsed.data

  // Enforce immutability: external-source news cannot have title/content edited
  if (payload.title !== undefined || payload.content !== undefined) {
    const existing = await prisma.news.findUnique({
      where: { id },
      select: { source: true },
    })
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Noticia nao encontrada.' }, { status: 404 })
    }
    if (existing.source) {
      return NextResponse.json(
        { success: false, error: 'Noticias de fontes externas nao podem ter titulo ou conteudo editado.' },
        { status: 403 }
      )
    }
  }

  const data: Record<string, unknown> = {}

  if (payload.title !== undefined) data.title = payload.title
  if (payload.content !== undefined) data.content = payload.content
  if (payload.impact !== undefined) data.impact = payload.impact as import('@prisma/client').ImpactCategory
  if (payload.sentiment !== undefined) data.sentiment = payload.sentiment as import('@prisma/client').Sentiment
  if (payload.source !== undefined) data.source = payload.source

  if (payload.ticker) {
    const asset = await prisma.asset.findUnique({
      where: { ticker: payload.ticker.toUpperCase() },
      select: { id: true },
    })
    if (!asset) {
      return NextResponse.json({ success: false, error: 'Ticker inválido.' }, { status: 422 })
    }
    data.assetIds = [asset.id]
  }

  if (payload.status) {
    const current = await prisma.news.findUnique({
      where: { id },
      select: { publishedAt: true },
    })
    Object.assign(data, statusToPersist(payload.status, current?.publishedAt ?? null))
  }

  try {
    const updated = await prisma.news.update({
      where: { id },
      data,
      select: { id: true },
    })
    return NextResponse.json({ success: true, data: updated })
  } catch {
    return NextResponse.json({ success: false, error: 'Notícia não encontrada.' }, { status: 404 })
  }
}

async function deleteHandler(req: NextRequest) {
  const id = extractNewsId(req)
  try {
    // Soft delete: arquiva a notícia em vez de remover fisicamente do banco.
    // O campo isPublished=false sinaliza status ARCHIVED para a camada de leitura.
    const archived = await prisma.news.update({
      where: { id },
      data: { isPublished: false },
      select: { id: true },
    })
    return NextResponse.json({ success: true, data: archived })
  } catch {
    return NextResponse.json({ success: false, error: 'Notícia não encontrada.' }, { status: 404 })
  }
}

// RESOLVED: EDITOR pode arquivar via PATCH (news:write) mas não pode DELETE (news:delete).
// Arquivamento = PATCH { status: 'ARCHIVED' }. Exclusão permanente = DELETE, apenas SUPER_ADMIN/ADMIN.
export const PATCH = withAdmin('news:write')(patchHandler)
export const DELETE = withAdmin('news:delete')(deleteHandler)
