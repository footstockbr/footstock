// DELETE /api/v1/sponsored-leagues/:id/leave — usuario sai de liga patrocinada

import { NextRequest, NextResponse } from 'next/server'
import { error as apiError, errors } from '@/lib/api'
import { getAuthUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  try {
    const { id } = await params
    const league = await prisma.sponsoredLeague.findUnique({ where: { id } })

    if (!league) {
      return apiError('SPONSORED-001', 'Liga patrocinada nao encontrada', 404)
    }

    if (league.status === 'ENCERRADA') {
      return apiError('SPONSORED-007', 'Nao e possivel sair de uma liga encerrada', 422)
    }

    const membership = await prisma.sponsoredLeagueMember.findUnique({
      where: {
        sponsoredLeagueId_userId: { sponsoredLeagueId: id, userId: auth.user.id },
      },
    })

    if (!membership) {
      return apiError('SPONSORED-008', 'Voce nao esta inscrito nesta liga', 404)
    }

    await prisma.sponsoredLeagueMember.delete({
      where: { id: membership.id },
    })

    return NextResponse.json({ data: { success: true } }, { status: 200 })
  } catch (err) {
    console.error('[sponsored-leagues/:id/leave] Error:', err)
    return errors.server()
  }
}
