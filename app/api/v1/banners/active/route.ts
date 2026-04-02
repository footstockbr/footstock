import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

/** GET /api/v1/banners/active?position=header — Banner ativo para uma posição (round-robin) */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const position = searchParams.get('position') ?? 'default'

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const banners = await (prisma as any).adSponsor?.findMany({
      where: { active: true, position },
      orderBy: { impressions: 'asc' }, // round-robin: menos impressões primeiro
      take: 1,
    })

    if (!banners?.length) {
      return NextResponse.json({ banner: null })
    }

    const banner = banners[0]

    // Incrementar impressões
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).adSponsor?.update({
      where: { id: banner.id },
      data: { impressions: { increment: 1 } },
    }).catch(() => null)

    return NextResponse.json({ banner })
  } catch {
    return NextResponse.json({ banner: null })
  }
}
