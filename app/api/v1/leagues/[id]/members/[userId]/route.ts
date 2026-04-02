import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth/server'
import { prisma } from '@/lib/prisma'

/** DELETE /api/v1/leagues/[id]/members/[userId] — Remover participante da liga */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id, userId: targetUserId } = await params

  try {
    const league = await (prisma as any).league?.findUnique({ where: { id } })
    if (!league) return NextResponse.json({ error: 'Liga não encontrada' }, { status: 404 })

    const isCreator = league.creatorId === auth.user.id
    const isSystemAdmin = ['SUPER_ADMIN', 'ADMINISTRADOR'].includes(auth.user.adminRole ?? '')
    if (!isCreator && !isSystemAdmin) {
      return NextResponse.json({ error: 'Apenas o criador da liga pode remover participantes' }, { status: 403 })
    }

    if (league.creatorId === targetUserId) {
      return NextResponse.json({ error: 'Não é possível remover o criador da liga' }, { status: 400 })
    }

    await (prisma as any).leagueMember?.deleteMany({
      where: { leagueId: id, userId: targetUserId },
    })

    await (prisma as any).notification?.create({
      data: {
        userId: targetUserId,
        type: 'LEAGUES',
        title: 'Você foi removido de uma liga',
        body: `Você foi removido da liga "${league.name}".`,
      },
    }).catch(() => null)

    return NextResponse.json({ success: true, message: 'Participante removido' })
  } catch (error) {
    console.error('[League Remove Member]', error)
    return NextResponse.json({ error: 'Erro ao remover participante' }, { status: 500 })
  }
}
