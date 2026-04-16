// ============================================================================
// FootStock — GET /api/v1/banners?position={position}
// Retorna banners ativos para a posicao solicitada (filtrados por data).
// Se nenhum banner ativo: retorna 204 (frontend omite o espaco).
// Retorna array `data` para suportar auto-rotacao no frontend.
// Cache Redis TTL 5 minutos por posicao.
// Fonte: T-017
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { redisPublisher as redis } from '@/lib/redis'
import { BANNER_POSITIONS } from '@/lib/types/sponsors'

const CACHE_TTL = 300 // 5 minutos

const QuerySchema = z.object({
  position: z.enum(BANNER_POSITIONS),
})

export async function GET(req: NextRequest): Promise<NextResponse> {
  const parsed = QuerySchema.safeParse({
    position: req.nextUrl.searchParams.get('position'),
  })

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: `Posicao invalida. Use: ${BANNER_POSITIONS.join(', ')}` },
      { status: 422 }
    )
  }

  const { position } = parsed.data
  const cacheKey = `banner:v3:active:${position}`

  // 1) Tentar cache Redis
  try {
    const cached = await redis.get(cacheKey)
    if (cached !== null) {
      const data = JSON.parse(cached)
      if (!data || (Array.isArray(data) && data.length === 0)) {
        return new NextResponse(null, { status: 204 })
      }
      return NextResponse.json({ success: true, data })
    }
  } catch {
    // Redis indisponivel — buscar no DB
  }

  // 2) Buscar todos os banners ativos para esta posicao (filtrado por data)
  const now = new Date()
  const banners = await prisma.sponsorBanner.findMany({
    where: {
      position,
      isActive: true,
      // Filtro de data: startDate <= now AND (endDate IS NULL OR endDate >= now)
      OR: [
        { startDate: null },
        { startDate: { lte: now } },
      ],
      AND: [
        {
          OR: [
            { endDate: null },
            { endDate: { gte: now } },
          ],
        },
        // Patrocinador ativo (se vinculado)
        {
          OR: [
            { sponsorId: null },
            { sponsor: { isActive: true } },
          ],
        },
      ],
    },
    orderBy: { impressions: 'asc' }, // round-robin: menor impressoes primeiro
    select: {
      id:               true,
      position:         true,
      imageUrl:         true,
      linkUrl:          true,
      title:            true,
      company:          true,
      color:            true,
      ctaText:          true,
      ctaColor:         true,
      width:            true,
      height:           true,
      imageDesktopUrl:  true,
      imageMobileUrl:   true,
      imageVerticalUrl: true,
      sponsor:          { select: { id: true, name: true } },
    },
  })

  if (banners.length === 0) {
    try {
      await redis.set(cacheKey, '[]', 'EX', CACHE_TTL)
    } catch { /* ignorar */ }
    return new NextResponse(null, { status: 204 })
  }

  // Incrementar impressoes do primeiro banner (round-robin)
  prisma.sponsorBanner.update({
    where: { id: banners[0].id },
    data: { impressions: { increment: 1 } },
  }).catch(() => null)

  const result = banners.map((banner) => ({
    id:               banner.id,
    position:         banner.position,
    imageUrl:         banner.imageUrl,
    linkUrl:          banner.linkUrl,
    altText:          banner.title,
    title:            banner.title,
    company:          banner.company,
    color:            banner.color,
    ctaText:          banner.ctaText,
    ctaColor:         banner.ctaColor,
    width:            banner.width,
    height:           banner.height,
    imageDesktopUrl:  banner.imageDesktopUrl,
    imageMobileUrl:   banner.imageMobileUrl,
    imageVerticalUrl: banner.imageVerticalUrl,
    sponsorId:        banner.sponsor?.id ?? null,
    sponsorName:      banner.sponsor?.name ?? null,
  }))

  try {
    await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL)
  } catch { /* ignorar */ }

  return NextResponse.json({ success: true, data: result })
}
