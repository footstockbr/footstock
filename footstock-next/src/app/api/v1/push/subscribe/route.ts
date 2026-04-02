import { NextRequest } from 'next/server'
import { z } from 'zod'
import { getAuthUser } from '@/lib/auth'
import { pushSubscriptionRepository } from '@/lib/repositories/PushSubscriptionRepository'
import { ok, errors } from '@/lib/api'

const SubscribeSchema = z.object({
  endpoint: z.string().url({ message: 'Formato inválido para o campo endpoint.' }),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().optional(),
})

// POST /api/v1/push/subscribe
export async function POST(req: NextRequest) {
  const auth = await getAuthUser()
  if (!auth) return errors.unauthorized()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return errors.validation('Corpo da requisição inválido.')
  }

  const parsed = SubscribeSchema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const isUrlError = issue?.message?.includes('Formato inválido')
    return errors.validation(
      isUrlError ? issue.message : 'Campo obrigatório não informado.',
      parsed.error.message
    )
  }

  const { endpoint, keys, userAgent } = parsed.data

  try {
    await pushSubscriptionRepository.upsert(auth.user.id, {
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      userAgent,
    })
    return ok({ success: true })
  } catch {
    return errors.server()
  }
}
