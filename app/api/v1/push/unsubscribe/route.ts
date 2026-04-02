// ============================================================================
// Foot Stock — Remover push subscription VAPID (EP046)
// DELETE /api/v1/push/unsubscribe
// Soft-delete (active: false). Idempotente: retorna 204 se não encontrado.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth, type AuthContext } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'
import { ERROR_CODES, ERROR_MESSAGES } from '@/lib/constants/errors'

const UnsubscribeSchema = z.object({
  endpoint: z.string().url({ message: 'Formato inválido para o campo endpoint.' }),
})

async function unsubscribeHandler(req: NextRequest, { user }: AuthContext): Promise<NextResponse> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { success: false, error: { code: ERROR_CODES.VAL_001, message: 'Corpo da requisição inválido.' } },
      { status: 400 },
    )
  }

  const parsed = UnsubscribeSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: ERROR_CODES.VAL_002, message: ERROR_MESSAGES['VAL-001'] } },
      { status: 422 },
    )
  }

  const { endpoint } = parsed.data

  const subscription = await prisma.pushSubscription.findUnique({
    where: { endpoint },
    select: { id: true, userId: true, active: true },
  })

  // Idempotente: não encontrado ou não pertence ao usuário → 204
  if (!subscription || subscription.userId !== user.id || !subscription.active) {
    return new NextResponse(null, { status: 204 })
  }

  await prisma.pushSubscription.update({
    where: { id: subscription.id },
    data: { active: false },
  })

  return new NextResponse(null, { status: 204 })
}

export const DELETE = withAuth(unsubscribeHandler)
