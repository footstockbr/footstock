import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth/server'
import { prisma } from '@/lib/prisma'

const PLAN_HIERARCHY = { JOGADOR: 0, CRAQUE: 1, LENDA: 2 }
type PlanType = keyof typeof PLAN_HIERARCHY

/** POST /api/v1/admin/users/[id]/promote-plan */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthUser()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  if (!['SUPER_ADMIN', 'ADMINISTRADOR'].includes(auth.user.adminRole ?? '')) {
    return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
  }

  const { id } = await params
  const { newPlan }: { newPlan: PlanType } = await request.json()
  if (!newPlan || !Object.prototype.hasOwnProperty.call(PLAN_HIERARCHY, newPlan)) {
    return NextResponse.json({ error: 'newPlan inválido. Use: JOGADOR, CRAQUE ou LENDA' }, { status: 400 })
  }

  try {
    const user = await prisma.user.findUnique({ where: { id } })
    if (!user) return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 })

    // Staff (ADMIN / CLUB_PARTNER) nao possui plano de player — promocao nao se aplica.
    if (user.userType === 'ADMIN' || user.userType === 'CLUB_PARTNER') {
      return NextResponse.json(
        { error: 'CANNOT_PROMOTE_STAFF_PLAN', message: 'Contas administrativas/institucionais nao possuem plano de player.' },
        { status: 400 },
      )
    }

    const currentPlan = user.planType as PlanType | null
    if (PLAN_HIERARCHY[newPlan] <= PLAN_HIERARCHY[currentPlan ?? 'JOGADOR']) {
      return NextResponse.json({ error: 'Downgrade não permitido. Apenas promoção.' }, { status: 400 })
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { planType: newPlan },
    })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).auditLog?.create({
      data: {
        action: 'PROMOTE_PLAN',
        targetId: id,
        performedBy: auth.user.id,
        metadata: JSON.stringify({ from: currentPlan, to: newPlan }),
      },
    }).catch(() => null)

    return NextResponse.json({ success: true, user: { id: updated.id, planType: newPlan } })
  } catch (error) {
    console.error('[PromotePlan]', error)
    return NextResponse.json({ error: 'Erro ao promover plano' }, { status: 500 })
  }
}
