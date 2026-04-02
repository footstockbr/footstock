import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth/server'
import { prisma } from '@/lib/prisma'

/** DELETE /api/v1/leagues/[id]/leave — Sair de uma liga */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { id } = await params
  const userId = auth.user.id

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const league = await (prisma as any).league?.findUnique({
      where: { id },
      include: { members: true },
    })

    if (!league) return NextResponse.json({ error: 'Liga não encontrada' }, { status: 404 })

    if (league.creatorId === userId) {
      return NextResponse.json({ error: 'Criador não pode sair da liga. Delete a liga para encerrá-la.' }, { status: 400 })
    }

    const isMember = league.members?.some((m: { userId: string }) => m.userId === userId)
    if (!isMember) {
      return NextResponse.json({ error: 'Você não é membro desta liga' }, { status: 400 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).leagueMember?.deleteMany({
      where: { leagueId: id, userId },
    })

    return NextResponse.json({ success: true, message: 'Você saiu da liga com sucesso' })
  } catch {
    console.error('[League Leave]', error)
    return NextResponse.json({ error: 'Erro ao sair da liga' }, { status: 500 })
  }
}
