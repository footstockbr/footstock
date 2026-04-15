// ============================================================================
// Foot Stock — GET /api/v1/banners?position={position}
// Retorna banner ativo para a posição solicitada.
// Se nenhum banner ativo: retorna 204 (frontend omite o espaço).
// Cache Redis TTL 5 minutos por posição.
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
      { success: false, error: `Posição inválida. Use: ${BANNER_POSITIONS.join(', ')}` },
      { status: 422 }
    )
  }

  const { position } = parsed.data
  const cacheKey = `banner:v2:active:${position}`

  // 1) Tentar cache Redis
  try {
    const cached = await redis.get(cacheKey)
    if (cached !== null) {
      const data = JSON.parse(cached)
      if (!data) return new NextResponse(null, { status: 204 })
      return NextResponse.json({ success: true, data })
    }
  } catch {
    // Redis indisponível — buscar no DB
  }

  // 2) Buscar banner ativo no banco
  const banner = await prisma.sponsorBanner.findFirst({
    where: {
      position,
      isActive: true,
      // Patrocinador ativo (se vinculado)
      OR: [
        { sponsorId: null },
        { sponsor: { isActive: true } },
      ],
    },
    orderBy: { impressions: 'asc' }, // round-robin: menor número de impressões primeiro
    select: {
      id:       true,
      position: true,
      imageUrl: true,
      linkUrl:  true,
      title:    true,
      width:    true,
      height:   true,
      sponsor:  { select: { id: true, name: true } },
    },
  })

  if (!banner) {
    try {
      await redis.set(cacheKey, 'null', 'EX', CACHE_TTL)
    } catch { /* ignorar */ }
    return new NextResponse(null, { status: 204 })
  }

  // Incrementar impressões de forma assíncrona (não bloqueia a resposta)
  prisma.sponsorBanner.update({
    where: { id: banner.id },
    data: { impressions: { increment: 1 } },
  }).catch(() => null)

  const result = {
    id:          banner.id,
    position:    banner.position,
    imageUrl:    banner.imageUrl,
    linkUrl:     banner.linkUrl,
    altText:     banner.title,
    width:       banner.width,
    height:      banner.height,
    sponsorId:   banner.sponsor?.id ?? null,
    sponsorName: banner.sponsor?.name ?? null,
  }

  try {
    await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL)
  } catch { /* ignorar */ }

  return NextResponse.json({ success: true, data: result })
}
