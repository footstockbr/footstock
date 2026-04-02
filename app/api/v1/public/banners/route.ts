// ============================================================================
// Foot Stock — GET /api/v1/public/banners?position={position}
// Retorna banner ativo para a posição solicitada.
// Cache Redis TTL 5 minutos por posição.
// Fonte: module-24/TASK-3/ST003
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { redisPublisher as redis } from '@/lib/redis'
import { BANNER_POSITIONS, type BannerData, type BannersMap, type PublicBannerDto } from '@/lib/types/sponsors'

const CACHE_TTL_SECONDS = 300 // 5 minutos

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
  const cacheKey = `banner:active:${position}`

  // 1) Tentar cache Redis
  try {
    const cached = await redis.get(cacheKey)
    if (cached) {
      const data = JSON.parse(cached) as PublicBannerDto | null
      return NextResponse.json({ success: true, data })
    }
  } catch {
    // Redis indisponível — buscar no DB
  }

  // 2) Buscar no banco
  const now = new Date()
  const sponsor = await prisma.adSponsor.findFirst({
    where: {
      active: true,
      startsAt: { lte: now },
      endsAt: { gte: now },
    },
    orderBy: { createdAt: 'desc' },
  })

  let result: PublicBannerDto | null = null

  if (sponsor) {
    const bannersMap = sponsor.banners as BannersMap
    const banner = bannersMap[position] as BannerData | undefined
    if (banner) {
      result = {
        position,
        imageUrl: banner.imageUrl,
        linkUrl: banner.linkUrl,
        altText: banner.altText,
        sponsorId: sponsor.id,
        sponsorName: sponsor.name,
      }
    }
  }

  // 3) Salvar resultado no cache (mesmo null, para evitar thundering herd)
  try {
    await redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL_SECONDS)
  } catch {
    // Ignorar falha de cache
  }

  return NextResponse.json({ success: true, data: result })
}
