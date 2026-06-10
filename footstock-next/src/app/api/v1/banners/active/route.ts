import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { BANNER_POSITIONS } from '@/lib/types/sponsors'

const QuerySchema = z.object({
  position: z.enum(BANNER_POSITIONS),
})

/** GET /api/v1/banners/active?position=home_top — Banner ativo para uma posição (round-robin) */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)

  // Valida a posição contra o enum canônico (alinhado a /api/v1/banners e /public/banners).
  const parsed = QuerySchema.safeParse({ position: searchParams.get('position') })
  if (!parsed.success) {
    return NextResponse.json(
      { banner: null, error: `Posição inválida. Use: ${BANNER_POSITIONS.join(', ')}` },
      { status: 422 }
    )
  }
  const { position } = parsed.data

  try {
    const now = new Date()
    // Modelo correto é SponsorBanner (uma linha por banner, com position/isActive/impressions),
    // não AdSponsor (blob JSON sem esses campos). Round-robin: menos impressões primeiro.
    const banner = await prisma.sponsorBanner.findFirst({
      where: {
        position,
        isActive: true,
        AND: [
          { OR: [{ startDate: null }, { startDate: { lte: now } }] },
          { OR: [{ endDate: null }, { endDate: { gte: now } }] },
        ],
      },
      orderBy: { impressions: 'asc' },
    })

    if (!banner) {
      return NextResponse.json({ banner: null })
    }

    // Incrementar impressões (fire-and-forget — não bloqueia a resposta).
    await prisma.sponsorBanner
      .update({
        where: { id: banner.id },
        data: { impressions: { increment: 1 } },
      })
      .catch(() => null)

    return NextResponse.json({ banner })
  } catch (err) {
    console.error('[banners/active GET] error:', err)
    return NextResponse.json({ banner: null })
  }
}
