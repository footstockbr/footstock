// ============================================================================
// Foot Stock — Registrar push subscription VAPID (EP045)
// POST /api/v1/push/subscribe
// Upsert por endpoint UNIQUE. Máx 5 subscriptions por usuário (remove a mais antiga).
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { withAuth, type AuthContext } from '@/app/api/middleware'
import { prisma } from '@/lib/prisma'
import { ERROR_CODES, ERROR_MESSAGES } from '@/lib/constants/errors'

const MAX_SUBSCRIPTIONS_PER_USER = 5

const SubscribeSchema = z.object({
  endpoint: z.string().url({ message: 'Formato inválido para o campo endpoint.' }),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().optional(),
})

async function subscribeHandler(req: NextRequest, { user }: AuthContext): Promise<NextResponse> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { success: false, error: { code: ERROR_CODES.VAL_001, message: 'Corpo da requisição inválido.' } },
      { status: 400 },
    )
  }

  const parsed = SubscribeSchema.safeParse(body)
  if (!parsed.success) {
    const issueMsg = parsed.error.issues[0]?.message ?? ''
    const isUrlError = issueMsg.includes('Formato inválido')
    return NextResponse.json(
      {
        success: false,
        error: {
          code: ERROR_CODES.VAL_002,
          message: isUrlError ? issueMsg : ERROR_MESSAGES['VAL-001'],
        },
      },
      { status: 422 },
    )
  }

  const { endpoint, keys, userAgent } = parsed.data

  // Verificar se já existe e upsert
  const existing = await prisma.pushSubscription.findUnique({
    where: { endpoint },
    select: { id: true, userId: true },
  })

  // Caso exista para outro usuário — rejeitar (endpoint único globalmente)
  if (existing && existing.userId !== user.id) {
    return NextResponse.json(
      { success: false, error: { code: ERROR_CODES.SYS_004, message: 'Endpoint já registrado.' } },
      { status: 409 },
    )
  }

  const isCreate = !existing

  // Se criar, verificar limite e remover a mais antiga se necessário
  if (isCreate) {
    const activeCount = await prisma.pushSubscription.count({
      where: { userId: user.id, active: true },
    })

    if (activeCount >= MAX_SUBSCRIPTIONS_PER_USER) {
      const oldest = await prisma.pushSubscription.findFirst({
        where: { userId: user.id, active: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      })
      if (oldest) {
        await prisma.pushSubscription.update({
          where: { id: oldest.id },
          data: { active: false },
        })
      }
    }
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { p256dh: keys.p256dh, auth: keys.auth, userAgent, active: true },
    create: {
      userId: user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent,
    },
  })

  return NextResponse.json(
    { success: true, data: { subscribed: true } },
    { status: isCreate ? 201 : 200 },
  )
}

export const POST = withAuth(subscribeHandler)
