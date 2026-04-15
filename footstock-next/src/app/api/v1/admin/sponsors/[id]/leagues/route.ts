import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth/server'
import { prisma } from '@/lib/prisma'

/** POST /api/v1/admin/sponsors/[id]/leagues — Vincular patrocinador a liga PRO */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  if (!['SUPER_ADMIN', 'ADMINISTRADOR'].includes(auth.user.adminRole ?? '')) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id: sponsorId } = await params
  const { leagueId } = await request.json()
  if (!leagueId) return NextResponse.json({ error: 'leagueId obrigatório' }, { status: 400 })

  try {
    // Verifica que o patrocinador existe
    const sponsor = await prisma.sponsor.findUnique({ where: { id: sponsorId } })
    if (!sponsor) return NextResponse.json({ error: 'Patrocinador não encontrado' }, { status: 404 })

    // Verifica que a liga existe e é PRO
    const league = await prisma.league.findUnique({
      where: { id: leagueId },
      select: { id: true, type: true, name: true },
    })
    if (!league) return NextResponse.json({ error: 'Liga não encontrada' }, { status: 404 })
    if (league.type !== 'PRO') {
      return NextResponse.json({ error: 'Apenas ligas PRO aceitam patrocinadores' }, { status: 400 })
    }

    // Vincula patrocinador à liga via League.sponsorId
    const updated = await prisma.league.update({
      where: { id: leagueId },
      data: { sponsorId },
      select: { id: true, name: true, type: true, sponsorId: true },
    })

    return NextResponse.json({ success: true, league: updated }, { status: 200 })
  } catch (error) {
    console.error('[SponsorLeague POST]', error)
    return NextResponse.json({ error: 'Erro ao vincular patrocinador' }, { status: 500 })
  }
}

/** DELETE /api/v1/admin/sponsors/[id]/leagues — Desvincular patrocinador de uma liga */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  if (!['SUPER_ADMIN', 'ADMINISTRADOR'].includes(auth.user.adminRole ?? '')) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id: sponsorId } = await params
  const { leagueId } = await request.json()
  if (!leagueId) return NextResponse.json({ error: 'leagueId obrigatório' }, { status: 400 })

  try {
    // Desvincular: setar sponsorId como null na liga
    await prisma.league.updateMany({
      where: { id: leagueId, sponsorId },
      data: { sponsorId: null },
    })

    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error) {
    console.error('[SponsorLeague DELETE]', error)
    return NextResponse.json({ error: 'Erro ao desvincular patrocinador' }, { status: 500 })
  }
}

/** GET /api/v1/admin/sponsors/[id]/leagues — Listar ligas vinculadas ao patrocinador */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id: sponsorId } = await params
  try {
    const leagues = await prisma.league.findMany({
      where: { sponsorId },
      select: { id: true, name: true, type: true, division: true, status: true, startsAt: true, endsAt: true },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json({ leagues })
  } catch (error) {
    console.error('[SponsorLeague GET]', error)
    return NextResponse.json({ error: 'Erro ao buscar ligas' }, { status: 500 })
  }
}
