import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth/server'
import { prisma } from '@/lib/prisma'

// SponsorLeague model ainda não existe no schema Prisma — acessado via cast tipado
// TODO: adicionar model SponsorLeague ao schema e gerar migration
type SponsorLeagueRecord = { id: string; league: { id: string; name: string; type: string } }
type PrismaWithSponsorLeague = typeof prisma & {
  sponsorLeague?: {
    create: (args: { data: { sponsorId: string; leagueId: string } }) => Promise<{ id: string }>
    findMany: (args: { where: { sponsorId: string }; include: unknown }) => Promise<SponsorLeagueRecord[]>
  }
  league?: { findUnique: (args: { where: { id: string } }) => Promise<{ id: string; type: string } | null> }
}

/** POST /api/v1/admin/sponsors/[id]/leagues — Vincular patrocinador a liga PRO */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  if (!['SUPER_ADMIN', 'ADMINISTRADOR'].includes(auth.user.adminRole ?? '')) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await params
  const { leagueId } = await request.json()
  if (!leagueId) return NextResponse.json({ error: 'leagueId obrigatório' }, { status: 400 })

  const db = prisma as PrismaWithSponsorLeague
  try {
    const league = await db.league?.findUnique({ where: { id: leagueId } })
    if (!league) return NextResponse.json({ error: 'Liga não encontrada' }, { status: 404 })
    if (league.type !== 'PRO') return NextResponse.json({ error: 'Apenas ligas PRO aceitam patrocinadores' }, { status: 400 })

    const link = await db.sponsorLeague?.create({
      data: { sponsorId: id, leagueId },
    })

    return NextResponse.json({ success: true, id: link?.id }, { status: 201 })
  } catch (error) {
    console.error('[SponsorLeague POST]', error)
    return NextResponse.json({ error: 'Erro ao vincular patrocinador' }, { status: 500 })
  }
}

/** GET /api/v1/admin/sponsors/[id]/leagues — Listar ligas vinculadas */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const db = prisma as PrismaWithSponsorLeague
  try {
    const links = await db.sponsorLeague?.findMany({
      where: { sponsorId: id },
      include: { league: { select: { id: true, name: true, type: true } } },
    }) ?? []

    return NextResponse.json({ leagues: links.map(l => l.league) })
  } catch (error) {
    console.error('[SponsorLeague GET]', error)
    return NextResponse.json({ error: 'Erro ao buscar ligas' }, { status: 500 })
  }
}
